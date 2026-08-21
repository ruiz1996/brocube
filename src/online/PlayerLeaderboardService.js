import { ONLINE_CONFIG } from './onlineConfig.js';

const SESSION_STORAGE_KEY = 'neon-breaker.supabase-session.v1';
const LOCAL_PROFILE_KEY = 'neon-breaker.player-profile.v1';
const LOCAL_BEST_KEY = 'neon-breaker.local-best.v1';

function parseStoredJson(storage, key) {
  try {
    return JSON.parse(storage?.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

function createUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function normalizeDisplayName(value) {
  const name = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!name) throw new Error('请输入玩家名称');
  if ([...name].length > 16) throw new Error('玩家名称最多 16 个字符');
  return name;
}

export function detectReleaseChannel(locationLike = globalThis.location) {
  const pathname = locationLike?.pathname ?? '';
  const search = locationLike?.search ?? '';
  const explicitChannel = new URLSearchParams(search).get('channel');
  if (explicitChannel === 'beta' || explicitChannel === 'stable') return explicitChannel;
  return /(?:^|\/)beta(?:\/|$)/i.test(pathname) ? 'beta' : 'stable';
}

export function shortPlayerCode(playerId) {
  return String(playerId ?? '').replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase().padEnd(4, '0');
}

class SupabaseRestClient {
  constructor({ url, publishableKey, storage, fetcher }) {
    this.url = url.replace(/\/$/, '');
    this.publishableKey = publishableKey;
    this.storage = storage;
    this.fetcher = fetcher;
    this.session = null;
    this.sessionPromise = null;
  }

  async ensureSession() {
    if (this.session?.access_token && this.#sessionIsFresh(this.session)) return this.session;
    if (this.sessionPromise) return this.sessionPromise;
    this.sessionPromise = this.#restoreOrCreateSession().finally(() => {
      this.sessionPromise = null;
    });
    return this.sessionPromise;
  }

  async getProfile() {
    const session = await this.ensureSession();
    const rows = await this.#databaseRequest(
      `/rest/v1/player_profiles?select=user_id,display_name,created_at&user_id=eq.${encodeURIComponent(session.user.id)}&limit=1`,
    );
    return rows[0] ?? null;
  }

  async saveProfile(displayName) {
    const session = await this.ensureSession();
    const rows = await this.#databaseRequest('/rest/v1/player_profiles?on_conflict=user_id', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: { user_id: session.user.id, display_name: displayName },
    });
    return rows[0];
  }

  async submitRun(run) {
    const session = await this.ensureSession();
    const rows = await this.#databaseRequest('/rest/v1/game_runs', {
      method: 'POST',
      prefer: 'return=representation',
      body: { ...run, user_id: session.user.id },
    });
    return rows[0];
  }

  async getLeaderboard(channel, limit) {
    return this.#databaseRequest('/rest/v1/rpc/get_leaderboard', {
      method: 'POST',
      body: { p_channel: channel, p_limit: limit },
    });
  }

  async #restoreOrCreateSession() {
    const stored = parseStoredJson(this.storage, SESSION_STORAGE_KEY);
    if (stored?.refresh_token && stored?.user?.id) {
      if (this.#sessionIsFresh(stored)) {
        this.session = stored;
        return stored;
      }
      try {
        return await this.#refreshSession(stored.refresh_token);
      } catch {
        this.storage?.removeItem(SESSION_STORAGE_KEY);
      }
    }
    return this.#createAnonymousSession();
  }

  async #createAnonymousSession() {
    const session = await this.#authRequest('/auth/v1/signup', {
      method: 'POST',
      body: { data: {}, gotrue_meta_security: {} },
    });
    return this.#storeSession(session);
  }

  async #refreshSession(refreshToken) {
    const session = await this.#authRequest('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: refreshToken },
    });
    return this.#storeSession(session);
  }

  async #authRequest(path, { method, body }) {
    const response = await this.fetcher(`${this.url}${path}`, {
      method,
      headers: {
        apikey: this.publishableKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    return this.#readResponse(response);
  }

  async #databaseRequest(path, { method = 'GET', body, prefer } = {}) {
    const session = await this.ensureSession();
    const headers = {
      apikey: this.publishableKey,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    };
    if (prefer) headers.Prefer = prefer;
    const response = await this.fetcher(`${this.url}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return this.#readResponse(response);
  }

  async #readResponse(response) {
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(payload?.message ?? payload?.msg ?? payload?.error_description ?? '在线服务请求失败');
    }
    return payload;
  }

  #storeSession(session) {
    if (!session?.access_token || !session?.refresh_token || !session?.user?.id) {
      throw new Error('匿名用户会话创建失败');
    }
    const normalized = {
      ...session,
      expires_at: session.expires_at ?? Math.floor(Date.now() / 1000) + (session.expires_in ?? 3600),
    };
    this.session = normalized;
    this.storage?.setItem(SESSION_STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }

  #sessionIsFresh(session) {
    return Number(session.expires_at ?? 0) > Math.floor(Date.now() / 1000) + 60;
  }
}

export class PlayerLeaderboardService {
  constructor({
    config = ONLINE_CONFIG,
    storage = globalThis.localStorage,
    fetcher = globalThis.fetch?.bind(globalThis),
    location = globalThis.location,
  } = {}) {
    this.config = config;
    this.storage = storage;
    this.fetcher = fetcher;
    this.channel = detectReleaseChannel(location);
    this.mode = 'local';
    this.error = null;
    this.profile = null;
    this.client = null;
  }

  get configured() {
    return Boolean(
      this.config.supabaseUrl?.startsWith('https://')
      && this.config.supabasePublishableKey
      && this.fetcher,
    );
  }

  async initialize() {
    const localProfile = this.#ensureLocalProfile();
    if (!this.configured) {
      this.profile = localProfile;
      return this.snapshot();
    }

    try {
      this.client = new SupabaseRestClient({
        url: this.config.supabaseUrl,
        publishableKey: this.config.supabasePublishableKey,
        storage: this.storage,
        fetcher: this.fetcher,
      });
      const session = await this.client.ensureSession();
      let remoteProfile = await this.client.getProfile();
      if (!remoteProfile && localProfile.displayName) {
        remoteProfile = await this.client.saveProfile(localProfile.displayName);
      }
      this.mode = 'online';
      this.profile = {
        playerId: session.user.id,
        displayName: remoteProfile?.display_name ?? '',
      };
      this.#storeLocalProfile(this.profile);
    } catch (error) {
      this.mode = 'local';
      this.error = error;
      this.profile = localProfile;
    }
    return this.snapshot();
  }

  async setDisplayName(value) {
    const displayName = normalizeDisplayName(value);
    if (!this.profile) await this.initialize();
    if (this.mode === 'online') await this.client.saveProfile(displayName);
    this.profile = { ...this.profile, displayName };
    this.#storeLocalProfile(this.profile);
    return this.snapshot();
  }

  async submitRun({ score, elapsed, upgrades }) {
    if (!this.profile?.displayName) return null;
    const run = {
      score: Math.max(0, Math.round(score ?? 0)),
      duration_seconds: Number(Math.max(0, Number(elapsed ?? 0)).toFixed(2)),
      channel: this.channel,
      game_version: this.config.gameVersion,
      upgrades: upgrades ?? {},
    };
    if (this.mode === 'online') return this.client.submitRun(run);

    const previous = parseStoredJson(this.storage, LOCAL_BEST_KEY);
    if (!previous || run.score > previous.score) {
      this.storage?.setItem(LOCAL_BEST_KEY, JSON.stringify({
        ...run,
        display_name: this.profile.displayName,
        player_code: shortPlayerCode(this.profile.playerId),
        created_at: new Date().toISOString(),
        is_current: true,
      }));
    }
    return run;
  }

  async getLeaderboard() {
    if (this.mode === 'online') {
      return this.client.getLeaderboard(this.channel, this.config.leaderboardLimit ?? 20);
    }
    const localBest = parseStoredJson(this.storage, LOCAL_BEST_KEY);
    return localBest ? [{ rank: 1, ...localBest }] : [];
  }

  snapshot() {
    return {
      mode: this.mode,
      channel: this.channel,
      configured: this.configured,
      displayName: this.profile?.displayName ?? '',
      playerId: this.profile?.playerId ?? '',
      playerCode: shortPlayerCode(this.profile?.playerId),
      needsName: !this.profile?.displayName,
      error: this.error?.message ?? null,
    };
  }

  #ensureLocalProfile() {
    const stored = parseStoredJson(this.storage, LOCAL_PROFILE_KEY);
    const profile = {
      playerId: stored?.playerId || createUuid(),
      displayName: stored?.displayName ?? '',
    };
    this.#storeLocalProfile(profile);
    return profile;
  }

  #storeLocalProfile(profile) {
    this.storage?.setItem(LOCAL_PROFILE_KEY, JSON.stringify(profile));
  }
}
