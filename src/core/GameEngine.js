import { EventBus } from './EventBus.js';
import { InputManager } from './InputManager.js';
import { PluginManager } from './PluginManager.js';

export class GameEngine {
  constructor({ canvas, width = 960, height = 600, fixedStep = 1 / 120 }) {
    this.canvas = canvas;
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.width = width;
    this.height = height;
    this.fixedStep = fixedStep;
    this.events = new EventBus();
    this.input = new InputManager(canvas);
    this.scene = null;
    this.running = false;
    this.paused = false;
    this.plugins = new PluginManager({ engine: this, events: this.events });
  }

  setScene(scene) {
    this.scene?.exit?.();
    this.scene = scene;
    scene.enter?.({
      engine: this,
      ctx: this.ctx,
      input: this.input,
      events: this.events,
      plugins: this.plugins,
    });
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    requestAnimationFrame(this.#frame);
  }

  setPaused(value) {
    if (this.paused === value) return;
    this.paused = value;
    this.events.emit(value ? 'engine:paused' : 'engine:resumed');
  }

  togglePause() { this.setPaused(!this.paused); }

  #frame = (now) => {
    if (!this.running) return;
    const elapsed = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    if (this.input.pressed('KeyP', 'Escape')) this.togglePause();
    if (!this.paused) {
      this.accumulator += elapsed;
      while (this.accumulator >= this.fixedStep) {
        this.plugins.call('beforeUpdate', this.fixedStep);
        this.scene?.update?.(this.fixedStep);
        this.plugins.call('afterUpdate', this.fixedStep);
        this.accumulator -= this.fixedStep;
      }
    }
    this.scene?.render?.(this.ctx, this.accumulator / this.fixedStep);
    this.plugins.call('afterRender', this.ctx);
    this.input.endFrame();
    requestAnimationFrame(this.#frame);
  };
}
