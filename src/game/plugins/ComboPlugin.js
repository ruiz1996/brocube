export const ComboPlugin = {
  id: 'combo-score',
  install({ events }) {
    this.combo = 0;
    this.offHit = events.on('brick:destroyed', () => { this.combo = Math.min(this.combo + 1, 10); });
    this.offPaddle = events.on('ball:bounce', ({ surface }) => { if (surface === 'paddle') this.combo = 0; });
  },
  scoreMultiplier() { return 1 + this.combo * .1; },
  dispose() { this.offHit?.(); this.offPaddle?.(); },
};
