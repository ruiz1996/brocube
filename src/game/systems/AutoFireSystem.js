import { GAME } from '../config.js';
import { BASIC_BALL_ID, VOID_ORBIT_BALL_ID } from '../balls/BallDefinitionRegistry.js';

export class AutoFireSystem {
  constructor(scene) {
    this.scene = scene;
    this.random = Math.random;
    this.timeUntilShot = .25;
    this.emitterId = 'paddle';
    this.ballDefinitionId = BASIC_BALL_ID;
  }

  get interval() { return this.scene.upgrades.fireInterval; }

  reset() { this.timeUntilShot = .25; }

  update(dt) {
    this.timeUntilShot -= dt;
    if (this.timeUntilShot > 0) return;
    this.#fireBall({ randomized: false });
    if (this.random() < this.scene.upgrades.extraBallChance) {
      this.#fireBall({ randomized: true, source: 'multi-shot' });
    }
    if (this.random() < this.scene.upgrades.topLaunchChance) {
      this.#fireBall({
        randomized: true,
        emitterId: 'top',
        speedMultiplier: GAME.upgrade.topLaunchSpeedMultiplier,
        source: 'top-launch',
        visualOverrides: {
          renderer: 'top-launch',
          color: '#ffad5a',
          coreColor: '#fffdf0',
          innerColor: '#ffe17a',
          trailColor: '#ff5c7d',
          trailLength: 16,
        },
      });
    }
    if (this.random() < this.scene.upgrades.blastLaunchChance) {
      this.#fireBall({
        randomized: true,
        emitterId: 'paddle',
        source: 'blast-launch',
        visualOverrides: {
          renderer: 'blast-core',
          color: '#ff4fa3',
          coreColor: '#fff5ff',
          innerColor: '#d98cff',
          trailColor: '#9b6cff',
          trailLength: 12,
        },
        periodicEffects: [{
          id: 'area-blast',
          interval: this.scene.upgrades.blastInterval,
          initialDelay: this.scene.upgrades.blastInterval,
          config: {
            radius: GAME.upgrade.blastRadius,
            damage: GAME.upgrade.blastDamage,
            damageType: 'explosive',
            color: '#ff4fa3',
            secondaryColor: '#9b6cff',
          },
        }],
      });
    }
    if (this.random() < this.scene.upgrades.voidOrbitChance) {
      this.#fireBall({
        randomized: true,
        definitionId: VOID_ORBIT_BALL_ID,
        emitterId: 'paddle',
        source: 'void-orbit',
      });
    }
    this.timeUntilShot += this.interval;
  }

  #fireBall({
    randomized,
    definitionId = this.ballDefinitionId,
    emitterId = this.emitterId,
    speedMultiplier = 1,
    source = 'automatic',
    visualOverrides = {},
    periodicEffects = [],
  }) {
    const definition = this.scene.ballDefinitions.get(definitionId);
    const shot = this.scene.ballEmitters.createShot(emitterId, {
      scene: this.scene,
      random: this.random,
      randomized,
      radius: definition.radius,
    });
    if (!shot) return;
    const ball = this.scene.ballFactory.createPrimary({
      definitionId,
      ...shot,
      speed: GAME.ball.speed,
      speedMultiplier: this.scene.upgrades.ballSpeedMultiplier * speedMultiplier,
      launchSource: source,
      visualOverrides,
      periodicEffects,
    });
    this.scene.world.add(ball);
    this.scene.events.emit('ball:launched', {
      ball,
      automatic: true,
      emitterId,
      definitionId,
      source,
    });
  }
}
