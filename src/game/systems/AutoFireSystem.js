import { GAME } from '../config.js';
import {
  BASIC_BALL_ID,
  LIGHTNING_BALL_ID,
  MICRO_NAVIGATION_BALL_ID,
  VOID_ORBIT_BALL_ID,
} from '../balls/BallDefinitionRegistry.js';
import { BALL_TRAITS } from '../balls/BallTraits.js';

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

  get activeBallCount() {
    return this.scene.world.count('ball', { includePending: true });
  }

  get isAtBallLimit() {
    return this.activeBallCount >= GAME.ball.maximumActiveCount;
  }

  reset() {
    this.timeUntilShot = .25;
    this.rapidShotsRemaining = 0;
    this.timeUntilRapidShot = 0;
  }

  update(dt) {
    if (this.isAtBallLimit) return;
    this.#updateRapidShots(dt);
    if (this.isAtBallLimit) return;
    this.timeUntilShot -= dt;
    if (this.timeUntilShot > 0) return;

    const launched = this.#fireAutomaticShot();
    if (launched > 0 && this.random() < this.scene.upgrades.rapidVolleyChance) {
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
      componentId: 'basic',
      randomized: false,
      definitionId: this.ballDefinitionId,
      emitterId: this.emitterId,
      source: 'automatic',
    }];

    if (this.scene.upgrades.levels.topLaunch > 0) {
      shots.push({
        shotType: 'top-launch', componentId: 'top-launch', traits: [BALL_TRAITS.TOP_LAUNCH],
        randomized: true, emitterId: 'top',
        speedMultiplier: GAME.upgrade.topLaunchSpeedMultiplier, source: 'top-launch',
        damageMultiplier: this.scene.upgrades.topImpactDamageMultiplier,
        visualOverrides: {
          renderer: 'top-launch', color: '#ffad5a', coreColor: '#fffdf0',
          innerColor: '#ffe17a', trailColor: '#ff5c7d', trailLength: 16,
        },
      });
    }

    if (this.scene.upgrades.levels.blastLaunch > 0) {
      shots.push({
        shotType: 'blast-launch', componentId: 'blast-core', traits: [BALL_TRAITS.BLAST_CORE],
        randomized: false, emitterId: 'paddle', source: 'blast-launch',
        visualOverrides: {
          renderer: 'blast-core', color: '#ff4fa3', coreColor: '#fff5ff',
          innerColor: '#d98cff', trailColor: '#9b6cff', trailLength: 12,
        },
        periodicEffects: [{
          id: 'area-blast', interval: this.scene.upgrades.blastInterval,
          initialDelay: this.scene.upgrades.blastInterval,
          config: {
            radius: GAME.upgrade.blastRadius, damage: GAME.upgrade.blastDamage,
            baseDamageScale: GAME.upgrade.blastDamage / GAME.combat.baseDamage,
            damageType: 'explosive', color: '#ff4fa3', secondaryColor: '#9b6cff',
          },
        }],
        damageEffects: this.scene.upgrades.levels.blastImpact > 0 ? [{
          id: 'impact-blast',
          config: {
            chance: this.scene.upgrades.blastImpactChance,
            radius: GAME.upgrade.blastRadius,
            damage: GAME.upgrade.blastDamage,
            baseDamageScale: GAME.upgrade.blastDamage / GAME.combat.baseDamage,
            damageType: 'explosive',
            color: '#ff4fa3',
            secondaryColor: '#9b6cff',
          },
        }] : [],
      });
    }

    if (this.scene.upgrades.levels.voidOrbit > 0) {
      shots.push({
        shotType: 'void-orbit', componentId: 'void-orbit', traits: [BALL_TRAITS.VOID_ORBIT],
        randomized: false, definitionId: VOID_ORBIT_BALL_ID,
        emitterId: 'paddle', source: 'void-orbit',
        orbitingDamageOverrides: {
          angularSpeed: this.scene.upgrades.voidOrbiterAngularSpeed,
          orbitRadius: this.scene.upgrades.voidOrbitRadius,
        },
      });
    }

    if (this.scene.upgrades.levels.microNavigation > 0) {
      shots.push({
        shotType: 'micro-navigation', componentId: 'micro-navigation',
        traits: [BALL_TRAITS.MICRO_NAVIGATION],
        randomized: false, definitionId: MICRO_NAVIGATION_BALL_ID,
        emitterId: 'paddle', source: 'micro-navigation',
        guidanceOverrides: {
          strength: this.scene.upgrades.navigationStrength,
          returnStrikeChance: this.scene.upgrades.navigationReturnChance,
          returnStrikeDelay: GAME.upgrade.navigationReturnDelay,
          returnStrikeChainDecay: GAME.upgrade.navigationReturnChainDecay,
        },
      });
    }

    if (this.scene.upgrades.levels.lightning > 0) {
      shots.push({
        shotType: 'lightning', componentId: 'chain-lightning',
        traits: [BALL_TRAITS.CHAIN_LIGHTNING],
        randomized: false, definitionId: LIGHTNING_BALL_ID,
        emitterId: 'paddle', source: 'lightning',
        damageEffectConfigOverrides: {
          'chain-lightning': {
            additionalTargets: this.scene.upgrades.lightningAdditionalTargets,
            strikeChance: this.scene.upgrades.lightningStrikeChance,
          },
        },
      });
    }

    return [
      ...shots,
      ...this.scene.ballFusions.availableShots(shots, { scene: this.scene }),
    ];
  }

  #updateRapidShots(dt) {
    if (this.rapidShotsRemaining <= 0) return;
    this.timeUntilRapidShot -= dt;
    let emitted = 0;
    while (this.timeUntilRapidShot <= 0
      && this.rapidShotsRemaining > 0
      && emitted < 5
      && !this.isAtBallLimit) {
      const launched = this.#fireAutomaticShot();
      if (launched <= 0) break;
      this.rapidShotsRemaining -= 1;
      this.timeUntilRapidShot += GAME.upgrade.rapidVolleyShotInterval;
      emitted += 1;
    }
  }

  #fireAutomaticShot() {
    const pool = this.availablePrimaryShots();
    let launched = 0;
    const fireFromPool = () => {
      const totalWeight = pool.reduce((sum, shot) => sum + (shot.selectionWeight ?? 1), 0);
      let roll = this.random() * totalWeight;
      let selected = pool.at(-1);
      for (const shot of pool) {
        roll -= shot.selectionWeight ?? 1;
        if (roll < 0) {
          selected = shot;
          break;
        }
      }
      const ball = this.#fireBall(selected);
      if (ball) launched += 1;
      return ball;
    };
    fireFromPool();
    if (this.scene.upgrades.levels.doubleShot > 0) {
      fireFromPool();
    } else if (this.random() < this.scene.upgrades.extraBallChance) {
      if (this.#fireBall({
        randomized: true, definitionId: BASIC_BALL_ID,
        emitterId: 'paddle', source: 'multi-shot',
      })) launched += 1;
    }
    if (this.scene.collectibleRun.extraSpecialBallChance > 0
      && this.random() < this.scene.collectibleRun.extraSpecialBallChance) {
      if (fireFromPool()) {
        this.scene.events.emit('ball:collectible-extra-shot', {
          chance: this.scene.collectibleRun.extraSpecialBallChance,
        });
      }
    }
    return launched;
  }

  #fireBall({
    randomized,
    definitionId = this.ballDefinitionId,
    emitterId = this.emitterId,
    speedMultiplier = 1,
    damageMultiplier = 1,
    source = 'automatic',
    traits = [],
    fusionId = null,
    fusionComponents = [],
    visualOverrides = {},
    visualLayers = [],
    periodicEffects = [],
    damageEffects = [],
    orbitingDamageOverrides = {},
    guidanceOverrides = {},
    damageEffectConfigOverrides = {},
    replaceDefinitionAbilities = false,
    guidance = null,
    orbitingDamage = null,
  }) {
    if (this.isAtBallLimit) return null;
    const definition = this.scene.ballDefinitions.get(definitionId);
    const shot = this.scene.ballEmitters.createShot(emitterId, {
      scene: this.scene, random: this.random, randomized, radius: definition.radius,
    });
    if (!shot) return null;
    const ball = this.scene.ballFactory.createPrimary({
      definitionId, ...shot, speed: GAME.ball.speed,
      speedMultiplier,
      lives: this.scene.upgrades.newBallLives,
      damageOverride: definition.damage + this.scene.upgrades.ballDamageBonus,
      damageMultiplier: definition.contactDamage === false ? 1 : damageMultiplier,
      launchSource: source, traits, fusionId, fusionComponents,
      visualOverrides, visualLayers, periodicEffects, damageEffects,
      orbitingDamageOverrides, guidanceOverrides, damageEffectConfigOverrides,
      replaceDefinitionAbilities, guidance, orbitingDamage,
    });
    this.scene.collectibleRun.applyBall(ball);
    this.scene.world.add(ball);
    this.scene.events.emit('ball:launched', {
      ball, automatic: true, emitterId, definitionId, source,
      fusionId, fusionComponents: [...fusionComponents], traits: [...ball.traits],
    });
    return ball;
  }
}
