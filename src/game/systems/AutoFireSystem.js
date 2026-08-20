import { GAME } from '../config.js';
import {
  BASIC_BALL_ID,
  LIGHTNING_BALL_ID,
  MICRO_NAVIGATION_BALL_ID,
  VOID_ORBIT_BALL_ID,
} from '../balls/BallDefinitionRegistry.js';

export class AutoFireSystem {
  constructor(scene) {
    this.scene = scene;
    this.random = Math.random;
    this.timeUntilShot = .25;
    this.emitterId = 'paddle';
    this.ballDefinitionId = BASIC_BALL_ID;
    this.rapidShotsRemaining = 0;
    this.timeUntilRapidShot = 0;
  }

  get interval() { return this.scene.upgrades.fireInterval; }

  reset() {
    this.timeUntilShot = .25;
    this.rapidShotsRemaining = 0;
    this.timeUntilRapidShot = 0;
  }

  update(dt) {
    this.#updateRapidShots(dt);
    this.timeUntilShot -= dt;
    if (this.timeUntilShot > 0) return;

    this.#fireAutomaticShot();
    if (this.random() < this.scene.upgrades.rapidVolleyChance) {
      this.rapidShotsRemaining = Math.max(0, GAME.upgrade.rapidVolleyBallCount - 1);
      this.timeUntilRapidShot = GAME.upgrade.rapidVolleyShotInterval;
      this.scene.events.emit('ball:rapid-volley', {
        count: GAME.upgrade.rapidVolleyBallCount,
        interval: GAME.upgrade.rapidVolleyShotInterval,
      });
    }
    this.timeUntilShot += this.interval;
  }

  availablePrimaryShots() {
    const shots = [{
      shotType: 'basic',
      randomized: false,
      definitionId: this.ballDefinitionId,
      emitterId: this.emitterId,
      source: 'automatic',
    }];

    if (this.scene.upgrades.levels.topLaunch > 0) {
      shots.push({
        shotType: 'top-launch', randomized: true, emitterId: 'top',
        speedMultiplier: GAME.upgrade.topLaunchSpeedMultiplier, source: 'top-launch',
        visualOverrides: {
          renderer: 'top-launch', color: '#ffad5a', coreColor: '#fffdf0',
          innerColor: '#ffe17a', trailColor: '#ff5c7d', trailLength: 16,
        },
      });
    }

    if (this.scene.upgrades.levels.blastLaunch > 0) {
      shots.push({
        shotType: 'blast-launch', randomized: true, emitterId: 'paddle', source: 'blast-launch',
        visualOverrides: {
          renderer: 'blast-core', color: '#ff4fa3', coreColor: '#fff5ff',
          innerColor: '#d98cff', trailColor: '#9b6cff', trailLength: 12,
        },
        periodicEffects: [{
          id: 'area-blast', interval: this.scene.upgrades.blastInterval,
          initialDelay: this.scene.upgrades.blastInterval,
          config: {
            radius: GAME.upgrade.blastRadius, damage: GAME.upgrade.blastDamage,
            damageType: 'explosive', color: '#ff4fa3', secondaryColor: '#9b6cff',
          },
        }],
      });
    }

    if (this.scene.upgrades.levels.voidOrbit > 0) {
      shots.push({
        shotType: 'void-orbit', randomized: true, definitionId: VOID_ORBIT_BALL_ID,
        emitterId: 'paddle', source: 'void-orbit',
        orbitingDamageOverrides: { angularSpeed: this.scene.upgrades.voidOrbiterAngularSpeed },
      });
    }

    if (this.scene.upgrades.levels.microNavigation > 0) {
      shots.push({
        shotType: 'micro-navigation', randomized: true, definitionId: MICRO_NAVIGATION_BALL_ID,
        emitterId: 'paddle', source: 'micro-navigation',
        guidanceOverrides: { strength: this.scene.upgrades.navigationStrength },
      });
    }

    if (this.scene.upgrades.levels.lightning > 0) {
      shots.push({
        shotType: 'lightning', randomized: true, definitionId: LIGHTNING_BALL_ID,
        emitterId: 'paddle', source: 'lightning',
        damageEffectConfigOverrides: {
          'chain-lightning': { additionalTargets: this.scene.upgrades.lightningAdditionalTargets },
        },
      });
    }

    return shots;
  }

  #updateRapidShots(dt) {
    if (this.rapidShotsRemaining <= 0) return;
    this.timeUntilRapidShot -= dt;
    let emitted = 0;
    while (this.timeUntilRapidShot <= 0 && this.rapidShotsRemaining > 0 && emitted < 5) {
      this.#fireAutomaticShot();
      this.rapidShotsRemaining -= 1;
      this.timeUntilRapidShot += GAME.upgrade.rapidVolleyShotInterval;
      emitted += 1;
    }
  }

  #fireAutomaticShot() {
    const pool = this.availablePrimaryShots();
    const selectedIndex = Math.min(pool.length - 1, Math.floor(this.random() * pool.length));
    this.#fireBall(pool[selectedIndex]);
    if (this.random() < this.scene.upgrades.extraBallChance) {
      this.#fireBall({
        randomized: true, definitionId: BASIC_BALL_ID,
        emitterId: 'paddle', source: 'multi-shot',
      });
    }
  }

  #fireBall({
    randomized,
    definitionId = this.ballDefinitionId,
    emitterId = this.emitterId,
    speedMultiplier = 1,
    source = 'automatic',
    visualOverrides = {},
    periodicEffects = [],
    orbitingDamageOverrides = {},
    guidanceOverrides = {},
    damageEffectConfigOverrides = {},
  }) {
    const definition = this.scene.ballDefinitions.get(definitionId);
    const shot = this.scene.ballEmitters.createShot(emitterId, {
      scene: this.scene, random: this.random, randomized, radius: definition.radius,
    });
    if (!shot) return null;
    const ball = this.scene.ballFactory.createPrimary({
      definitionId, ...shot, speed: GAME.ball.speed,
      speedMultiplier: this.scene.upgrades.ballSpeedMultiplier * speedMultiplier,
      launchSource: source, visualOverrides, periodicEffects,
      orbitingDamageOverrides, guidanceOverrides, damageEffectConfigOverrides,
    });
    this.scene.world.add(ball);
    this.scene.events.emit('ball:launched', {
      ball, automatic: true, emitterId, definitionId, source,
    });
    return ball;
  }
}
