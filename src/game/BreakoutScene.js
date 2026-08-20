import { World } from '../core/Entity.js';
import { Paddle } from './entities/entities.js';
import { PaddleSystem } from './systems/PaddleSystem.js';
import { AutoFireSystem } from './systems/AutoFireSystem.js';
import { BallPhysicsSystem } from './systems/BallPhysicsSystem.js';
import { BrickFieldSystem } from './systems/BrickFieldSystem.js';
import { EffectsSystem } from './systems/EffectsSystem.js';
import { UpgradeSystem } from './systems/UpgradeSystem.js';
import { BreakoutRenderer } from './BreakoutRenderer.js';

export class BreakoutScene {
  enter(context) {
    Object.assign(this, context);
    this.world = new World();
    this.renderer = new BreakoutRenderer(this);
    this.upgrades = new UpgradeSystem(this);
    this.autoFire = new AutoFireSystem(this);
    this.ballPhysics = new BallPhysicsSystem(this);
    this.brickField = new BrickFieldSystem(this);
    this.systems = [
      new PaddleSystem(this),
      this.autoFire,
      this.ballPhysics,
      this.brickField,
      new EffectsSystem(this),
    ];
    this.score = 0;
    this.state = 'idle';
    this.statsTimer = 0;
    this.unsubscribers = [
      this.events.on('brick:hit', (payload) => this.#onBrickHit(payload)),
      this.events.on('brick:breached', (payload) => this.#onBrickBreached(payload)),
    ];
    this.#resetWorld();
    this.events.emit('game:ready', this.snapshot());
  }

  startNewGame() {
    this.score = 0;
    this.state = 'playing';
    this.statsTimer = 0;
    this.#resetWorld();
    this.engine.setPaused(false);
    this.events.emit('game:started', this.snapshot());
    this.events.emit('game:stats', this.snapshot());
  }

  update(dt) {
    if (this.state !== 'playing') return;
    for (const system of this.systems) {
      system.update?.(dt);
      if (this.state !== 'playing') break;
    }
    for (const brick of this.world.all('brick')) brick.hitFlash = Math.max(0, brick.hitFlash - dt * 7);
    this.world.flush();
    this.statsTimer -= dt;
    if (this.statsTimer <= 0) {
      this.statsTimer = .1;
      this.events.emit('game:stats', this.snapshot());
    }
  }

  render(ctx) { this.renderer.render(ctx); }

  chooseUpgrade(id) { return this.upgrades.choose(id); }

  snapshot() {
    return {
      score: Math.round(this.score),
      balls: this.world.all('ball').length,
      nextShot: Math.max(0, this.autoFire?.timeUntilShot ?? 0),
      elapsed: this.brickField?.elapsed ?? 0,
      upgrades: { ...this.upgrades.levels },
      state: this.state,
    };
  }

  #resetWorld() {
    this.world.clear();
    this.world.add(new Paddle());
    this.upgrades.reset();
    this.autoFire.reset();
    this.brickField.reset();
    this.world.flush();
  }

  #onBrickHit({ brick, ball }) {
    if (!brick.active || this.state !== 'playing') return;
    const destroyed = brick.damage(1);
    this.events.emit(destroyed ? 'brick:destroyed' : 'brick:damaged', { brick, ball });
    if (!destroyed) return;
    const comboPlugin = this.plugins.plugins.get('combo-score');
    const multiplier = comboPlugin?.scoreMultiplier?.() ?? 1;
    this.score += brick.score * multiplier;
    this.events.emit('game:stats', this.snapshot());
    this.upgrades.check(this.score);
  }

  #onBrickBreached({ brick, elapsed }) {
    if (this.state !== 'playing') return;
    this.state = 'lost';
    this.events.emit('game:lost', { ...this.snapshot(), elapsed, breachedBrick: brick });
  }

  exit() {
    this.unsubscribers?.forEach((unsubscribe) => unsubscribe());
    this.systems?.forEach((system) => system.dispose?.());
    this.world?.clear();
  }
}
