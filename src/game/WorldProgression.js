import { GAME } from './config.js';
import { normalizeWorldLevel } from './WorldLevel.js';

const STORAGE_KEY = 'neon-breaker:world-progression:v1';

function readState(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export class WorldProgression {
  constructor({ storage = globalThis.localStorage, events = null } = {}) {
    this.storage = storage;
    this.events = events;
    const stored = readState(storage);
    this.unlockedLevel = normalizeWorldLevel(stored.unlockedLevel);
    this.selectedLevel = Math.min(
      this.unlockedLevel,
      normalizeWorldLevel(stored.selectedLevel),
    );
  }

  select(level) {
    const nextLevel = normalizeWorldLevel(level);
    if (nextLevel > this.unlockedLevel) return false;
    if (nextLevel === this.selectedLevel) return true;
    const previousLevel = this.selectedLevel;
    this.selectedLevel = nextLevel;
    this.#save();
    this.events?.emit('world-level:selected', {
      previousLevel,
      selectedLevel: this.selectedLevel,
      unlockedLevel: this.unlockedLevel,
    });
    return true;
  }

  recordBossDefeat({ worldLevel, bossWave }) {
    const completedWorld = normalizeWorldLevel(worldLevel);
    const defeatedWave = Math.max(0, Math.floor(Number(bossWave) || 0));
    if (defeatedWave !== GAME.worldLevel.unlockBossWave) return null;
    if (completedWorld !== this.unlockedLevel) return null;

    const previousUnlockedLevel = this.unlockedLevel;
    const nextUnlockedLevel = normalizeWorldLevel(this.unlockedLevel + 1);
    if (nextUnlockedLevel === previousUnlockedLevel) return null;
    this.unlockedLevel = nextUnlockedLevel;
    this.#save();
    const result = {
      completedWorld,
      defeatedWave,
      previousUnlockedLevel,
      unlockedLevel: this.unlockedLevel,
      selectedLevel: this.selectedLevel,
    };
    this.events?.emit('world-level:unlocked', result);
    return result;
  }

  snapshot() {
    return {
      selectedLevel: this.selectedLevel,
      unlockedLevel: this.unlockedLevel,
      unlockBossWave: GAME.worldLevel.unlockBossWave,
    };
  }

  #save() {
    this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.snapshot()));
  }
}
