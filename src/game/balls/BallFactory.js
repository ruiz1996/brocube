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
    orbitingDamageOverrides = {},
    guidanceOverrides = {},
    damageEffectConfigOverrides = {},
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
      orbitingDamageOverrides,
      guidanceOverrides,
      damageEffectConfigOverrides,
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
      guidance: null,
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
    orbitingDamageOverrides = {},
    guidanceOverrides = {},
    damageEffectConfigOverrides = {},
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
        config: { ...effect.config, ...(damageEffectConfigOverrides[effect.id] ?? {}) },
      })),
      periodicEffects: periodicEffects.map((effect) => ({
        id: effect.id,
        interval: effect.interval,
        initialDelay: effect.initialDelay,
        config: { ...(effect.config ?? {}) },
      })),
      collisionPolicy: definition.collisionPolicy,
      collisionConfig: { ...definition.collisionConfig },
      guidance: definition.guidance ? { ...definition.guidance, ...guidanceOverrides } : null,
      orbiters: this.#createOrbiters(definition.orbitingDamage, orbitingDamageOverrides),
      visual: { ...definition.visual, ...visualOverrides },
    });
  }

  #createOrbiters(config, overrides = {}) {
    if (!config) return [];
    const resolved = { ...config, ...overrides };
    return Array.from({ length: resolved.count }, (_, index) => ({
      phase: resolved.phaseOffset + index * Math.PI * 2 / resolved.count,
      orbitRadius: resolved.orbitRadius,
      radius: resolved.radius,
      angularSpeed: resolved.angularSpeed,
      damage: resolved.damage,
      damageType: resolved.damageType,
      visual: { ...resolved.visual },
    }));
  }
}
