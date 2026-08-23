export class PlayerLeaderboardUI {
  constructor(engine, scene, service) {
    this.engine = engine;
    this.scene = scene;
    this.service = service;
    this.button = document.querySelector('#player-button');
    this.panel = document.querySelector('#player-panel');
    this.closeButton = document.querySelector('#player-panel-close');
    this.title = document.querySelector('#player-panel-title');
    this.nameInput = document.querySelector('#player-name-input');
    this.saveButton = document.querySelector('#player-name-save');
    this.identity = document.querySelector('#player-identity');
    this.serviceStatus = document.querySelector('#player-service-status');
    this.formStatus = document.querySelector('#player-form-status');
    this.leaderboardList = document.querySelector('#leaderboard-list');
    this.leaderboardEmpty = document.querySelector('#leaderboard-empty');
    this.refreshButton = document.querySelector('#leaderboard-refresh');
    this.settleButton = document.querySelector('#settle-run-button');
    this.resumeAfterPanel = false;
    this.firstSetup = false;
    this.#bind();
  }

  async initialize() {
    const state = await this.service.initialize();
    this.#renderProfile(state);
    if (state.needsName) this.#showPanel({ firstSetup: true });
  }

  #bind() {
    this.button.addEventListener('click', () => this.#showPanel());
    this.closeButton.addEventListener('click', () => this.#hidePanel());
    this.panel.addEventListener('click', (event) => {
      if (event.target === this.panel && !this.firstSetup) this.#hidePanel();
    });
    this.saveButton.addEventListener('click', () => this.#saveName());
    this.nameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.#saveName();
    });
    this.refreshButton.addEventListener('click', () => this.#loadLeaderboard());
    this.settleButton.addEventListener('click', () => this.#settleRun());
    this.engine.events.on('game:started', () => this.#updateSettlementButton());
    this.engine.events.on('game:finished', async (result) => {
      this.#updateSettlementButton();
      try {
        const saved = await this.service.submitRun(result);
        if (!saved) {
          this.formStatus.textContent = '请先保存玩家名称，之后的成绩才能上传。';
          return;
        }
        this.formStatus.textContent = result.reason === 'manual-settlement'
          ? `本局 ${Math.round(result.score).toLocaleString('zh-CN')} 分已保存。`
          : this.formStatus.textContent;
        this.engine.events.emit('leaderboard:run-submitted', { result, saved });
        if (!this.panel.classList.contains('is-hidden')) await this.#loadLeaderboard();
      } catch (error) {
        this.formStatus.textContent = `成绩保存失败：${error.message}`;
        this.engine.events.emit('leaderboard:run-submit-failed', { result, error });
      }
    });
  }

  async #showPanel({ firstSetup = false } = {}) {
    this.firstSetup = firstSetup;
    this.resumeAfterPanel = this.scene.state === 'playing' && !this.engine.paused;
    if (this.resumeAfterPanel) this.engine.setPaused(true);
    const state = this.service.snapshot();
    this.title.textContent = firstSetup ? '建立玩家档案' : '玩家与排行榜';
    this.closeButton.classList.toggle('is-hidden', firstSetup);
    this.nameInput.value = state.displayName;
    this.formStatus.textContent = firstSetup ? '名称允许重复，之后也可以随时修改。' : '';
    this.#renderProfile(state);
    this.#updateSettlementButton();
    this.panel.classList.remove('is-hidden');
    this.panel.setAttribute('aria-hidden', 'false');
    this.button.setAttribute('aria-expanded', 'true');
    await this.#loadLeaderboard();
    this.nameInput.focus();
  }

  #hidePanel() {
    if (this.firstSetup) return;
    this.panel.classList.add('is-hidden');
    this.panel.setAttribute('aria-hidden', 'true');
    this.button.setAttribute('aria-expanded', 'false');
    if (this.resumeAfterPanel && this.scene.state === 'playing') this.engine.setPaused(false);
    this.resumeAfterPanel = false;
  }

  async #saveName() {
    this.saveButton.disabled = true;
    this.formStatus.textContent = '正在保存玩家档案…';
    try {
      const state = await this.service.setDisplayName(this.nameInput.value);
      this.#renderProfile(state);
      this.formStatus.textContent = `名称已保存：${state.displayName}`;
      if (this.firstSetup) {
        this.firstSetup = false;
        this.closeButton.classList.remove('is-hidden');
        setTimeout(() => this.#hidePanel(), 450);
      }
      await this.#loadLeaderboard();
    } catch (error) {
      this.formStatus.textContent = error.message;
    } finally {
      this.saveButton.disabled = false;
    }
  }

  #settleRun() {
    if (!['playing', 'upgrading'].includes(this.scene.state)) return;
    if (!this.service.snapshot().displayName) {
      this.formStatus.textContent = '请先保存玩家名称，再结算并上传成绩。';
      this.nameInput.focus();
      return;
    }
    const confirmed = globalThis.confirm?.(
      `确定结束本局并上传当前 ${Math.round(this.scene.score).toLocaleString('zh-CN')} 分吗？`,
    ) ?? true;
    if (!confirmed) return;
    this.settleButton.disabled = true;
    this.formStatus.textContent = '正在结算并上传本局成绩…';
    this.scene.settleRun();
  }

  #updateSettlementButton() {
    this.settleButton.disabled = !['playing', 'upgrading'].includes(this.scene.state);
  }

  #renderProfile(state) {
    this.identity.textContent = state.displayName
      ? `${state.displayName}  #${state.playerCode}`
      : `未命名玩家  #${state.playerCode}`;
    if (state.mode === 'online') {
      this.serviceStatus.textContent = `${state.channel === 'beta' ? 'BETA' : '正式版'} · 在线身份已连接`;
      this.serviceStatus.classList.add('is-online');
    } else {
      this.serviceStatus.textContent = state.configured
        ? `在线连接失败，当前使用本机身份${state.error ? `：${state.error}` : ''}`
        : '当前使用本机身份；配置 Supabase 后自动启用全球排行';
      this.serviceStatus.classList.remove('is-online');
    }
  }

  async #loadLeaderboard() {
    this.refreshButton.disabled = true;
    this.leaderboardList.replaceChildren();
    this.leaderboardEmpty.textContent = '正在读取排行榜…';
    this.leaderboardEmpty.classList.remove('is-hidden');
    try {
      const entries = await this.service.getLeaderboard();
      if (entries.length === 0) {
        this.leaderboardEmpty.textContent = this.service.mode === 'online'
          ? '排行榜还没有成绩，来拿下第一名吧。'
          : '完成一局后，这里会显示你的本机最高分。';
        return;
      }
      this.leaderboardEmpty.classList.add('is-hidden');
      entries.forEach((entry, index) => {
        const row = document.createElement('li');
        if (entry.is_current) row.classList.add('is-current');
        const rank = document.createElement('span');
        rank.className = 'leaderboard-rank';
        rank.textContent = String(entry.rank ?? index + 1).padStart(2, '0');
        const player = document.createElement('span');
        player.className = 'leaderboard-player';
        const name = document.createElement('strong');
        name.textContent = entry.display_name;
        const code = document.createElement('small');
        code.textContent = `#${entry.player_code}`;
        player.append(name, code);
        const score = document.createElement('strong');
        score.className = 'leaderboard-score';
        score.textContent = Math.round(entry.score).toLocaleString('zh-CN');
        const worldLevel = document.createElement('span');
        worldLevel.className = 'leaderboard-world-level';
        worldLevel.textContent = `W${Math.max(1, Math.floor(Number(entry.world_level) || 1)).toLocaleString('zh-CN')}`;
        worldLevel.title = `世界等级 ${Math.max(1, Math.floor(Number(entry.world_level) || 1)).toLocaleString('zh-CN')}`;
        row.append(rank, player, worldLevel, score);
        this.leaderboardList.append(row);
      });
    } catch (error) {
      this.leaderboardEmpty.textContent = `排行榜读取失败：${error.message}`;
      this.leaderboardEmpty.classList.remove('is-hidden');
    } finally {
      this.refreshButton.disabled = false;
    }
  }
}
