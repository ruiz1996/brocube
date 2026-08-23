import { COLLECTIBLE_CATALOG, getCollectible } from './CollectibleCatalog.js';

const STORAGE_KEY = 'neon-breaker:collectibles:v1';

function readState(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export class CollectibleInventory {
  constructor({ storage = globalThis.localStorage, events = null } = {}) {
    this.storage = storage;
    this.events = events;
    const stored = readState(storage);
    this.levels = Object.fromEntries(COLLECTIBLE_CATALOG.map(({ id, maxLevel }) => {
      const value = Math.max(0, Math.floor(Number(stored.levels?.[id]) || 0));
      return [id, Number.isFinite(maxLevel) ? Math.min(maxLevel, value) : value];
    }));
    this.chests = Math.min(
      Number.MAX_SAFE_INTEGER,
      Math.max(0, Math.floor(Number(stored.chests) || 0)),
    );
    this.equippedPaddleStyle = this.#isOwnedPaddleStyle(stored.equippedPaddleStyle)
      ? stored.equippedPaddleStyle
      : 'standard';
  }

  level(id) { return this.levels[id] ?? 0; }

  grantChests(amount = 1, source = 'boss') {
    const granted = Math.max(1, Math.floor(Number(amount) || 1));
    const previousChests = this.chests;
    this.chests = Math.min(Number.MAX_SAFE_INTEGER, this.chests + granted);
    this.#save();
    const payload = { previousChests, chests: this.chests, granted, source };
    this.events?.emit('collectible:chests-changed', payload);
    return payload;
  }

  consumeChest() {
    if (this.chests <= 0) return false;
    const previousChests = this.chests;
    this.chests -= 1;
    this.#save();
    this.events?.emit('collectible:chests-changed', {
      previousChests,
      chests: this.chests,
      granted: -1,
      source: 'opened',
    });
    return true;
  }

  grant(id, amount = 1) {
    const definition = getCollectible(id);
    if (!definition) throw new Error(`Unknown collectible: ${id}`);
    const previousLevel = this.level(id);
    const nextLevel = Math.min(
      Number.MAX_SAFE_INTEGER,
      Math.max(0, previousLevel + Math.max(1, Math.floor(Number(amount) || 1))),
    );
    this.levels[id] = Number.isFinite(definition.maxLevel)
      ? Math.min(definition.maxLevel, nextLevel)
      : nextLevel;
    this.#save();
    const payload = { definition, previousLevel, level: this.levels[id] };
    this.events?.emit('collectible:changed', payload);
    return payload;
  }

  equipPaddle(id) {
    const definition = getCollectible(id);
    if (!definition?.paddleStyle || this.level(id) <= 0) return false;
    this.equippedPaddleStyle = definition.paddleStyle;
    this.#save();
    this.events?.emit('paddle-style:changed', {
      collectible: definition,
      paddleStyle: definition.paddleStyle,
    });
    return true;
  }

  catalogState() {
    return COLLECTIBLE_CATALOG.map((definition) => ({
      ...definition,
      level: this.level(definition.id),
      owned: this.level(definition.id) > 0,
      capped: Number.isFinite(definition.maxLevel)
        && this.level(definition.id) >= definition.maxLevel,
      equipped: definition.paddleStyle === this.equippedPaddleStyle,
    }));
  }

  snapshot() {
    return {
      levels: { ...this.levels },
      chests: this.chests,
      equippedPaddleStyle: this.equippedPaddleStyle,
      ownedCount: Object.values(this.levels).filter((level) => level > 0).length,
      totalCount: COLLECTIBLE_CATALOG.length,
    };
  }

  #isOwnedPaddleStyle(style) {
    if (!style || style === 'standard') return style === 'standard';
    const definition = COLLECTIBLE_CATALOG.find((item) => item.paddleStyle === style);
    return Boolean(definition && this.level(definition.id) > 0);
  }

  #save() {
    this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.snapshot()));
  }
}
