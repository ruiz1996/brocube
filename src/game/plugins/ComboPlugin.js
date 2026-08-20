import { GAME } from '../config.js';

export const ComboPlugin = {
  id: 'combo-score',

  install({ events }) {
    this.events = events;
    this.combo = 0;
    this.timeRemaining = 0;
    this.unsubscribers = [
      events.on('brick:destroyed', () => this.registerKill()),
      events.on('game:started', () => this.reset()),
      events.on('game:lost', () => this.reset()),
    ];
  },

  afterUpdate(dt, { engine }) {
    if (engine.scene?.state !== 'playing' || this.combo === 0) return;
    this.timeRemaining -= dt;
    if (this.timeRemaining <= 0) this.reset();
  },

  scoreMultiplier() {
    if (this.combo < 2) return 1;
    return Math.min(
      GAME.combo.maximumMultiplier,
      1 + (this.combo - 1) * GAME.combo.multiplierPerKill,
    );
  },

  reset() {
    const hadCombo = this.combo >= 2;
    this.combo = 0;
    this.timeRemaining = 0;
    if (hadCombo) this.events?.emit('combo:ended');
  },

  dispose() {
    this.unsubscribers?.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
  },

  registerKill() {
    this.combo = this.timeRemaining > 0 ? this.combo + 1 : 1;
    this.timeRemaining = GAME.combo.windowSeconds;
    this.events.emit('combo:changed', {
      count: this.combo,
      multiplier: this.scoreMultiplier(),
      windowSeconds: GAME.combo.windowSeconds,
    });
  },
};
