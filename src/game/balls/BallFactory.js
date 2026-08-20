import { Ball } from '../entities/entities.js';
import { GAME } from '../config.js';
import { BASIC_BALL_ID } from './BallDefinitionRegistry.js';

export class BallFactory {
  constructor(definitions) { this.definitions = definitions; }

  createPrimary({
    definitionId = BASIC_BALL_ID,
    x,
    y,
    angle,
    speed = GAME.ball.speed,
    speedMultiplier = 1,
    launchSource = 'manual',
    visualOverrides = {},
    periodicEffects = [],
  }) {
    const definition = this.definitions.get(definitionId);
    return this.#create({
      definition,
      definitionId,
      role: 'primary',
      x,
      y,
      angle,
      speed: speed * speedMultiplier * definition.speedMultiplier,
      launchSource,
      visualOverrides,
      periodicEffects: [...definition.periodicEffects, ...periodicEffects],
    });
  }

  createDerived({ x, y, angle, speed = GAME.ball.speed }) {
    const basic = this.definitions.get(BASIC_BALL_ID);
    return new Ball({
      definitionId: BASIC_BALL_ID,
      role: 'derived',
      launchSource: 'derived',
      x,
      y,
      angle,
      speed,
      radius: GAME.ball.derivedRadius,
      damage: 1,
      damageType: 'kinetic',
      contactDamage: true,
      damageEffects: [],
      periodicEffects: [],
      collisionPolicy: 'bounce',
      collisionConfig: {},
      orbiters: [],
      visual: { ...basic.visual, trailLength: Math.min(5, basic.visual.trailLength) },
    });
  }

  #create({
    definition,
    definitionId,
    role,
    x,
    y,
    angle,
    speed,
    launchSource,
    visualOverrides = {},
    periodicEffects = [],
  }) {
    return new Ball({
      definitionId,
      role,
      x,
      y,
      angle,
      speed,
      launchSource,
      radius: definition.radius,
      damage: definition.damage,
      damageType: definition.damageType,
      contactDamage: definition.contactDamage,
      damageEffects: definition.damageEffects.map((effect) => ({
        id: effect.id,
        config: { ...effect.config },
      })),
      periodicEffects: periodicEffects.map((effect) => ({
        id: effect.id,
        interval: effect.interval,
        initialDelay: effect.initialDelay,
        config: { ...(effect.config ?? {}) },
      })),
      collisionPolicy: definition.collisionPolicy,
      collisionConfig: { ...definition.collisionConfig },
      orbiters: this.#createOrbiters(definition.orbitingDamage),
      visual: { ...definition.visual, ...visualOverrides },
    });
  }

  #createOrbiters(config) {
    if (!config) return [];
    return Array.from({ length: config.count }, (_, index) => ({
      phase: config.phaseOffset + index * Math.PI * 2 / config.count,
      orbitRadius: config.orbitRadius,
      radius: config.radius,
      angularSpeed: config.angularSpeed,
      damage: config.damage,
      damageType: config.damageType,
      visual: { ...config.visual },
    }));
  }
}
