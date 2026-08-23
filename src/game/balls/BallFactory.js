import { Ball } from '../entities/entities.js';
import { GAME } from '../config.js';
import { BASIC_BALL_ID } from './BallDefinitionRegistry.js';
import { BALL_TRAITS, normalizeTraits } from './BallTraits.js';

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
    traits = [],
    fusionId = null,
    fusionComponents = [],
    level = GAME.ball.defaultLevel,
    lives = GAME.ball.defaultLives,
    damageOverride,
    damageMultiplier = 1,
    visualOverrides = {},
    visualLayers = [],
    damageEffects = [],
    periodicEffects = [],
    replaceDefinitionAbilities = false,
    guidance = null,
    orbitingDamage = null,
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
      traits: normalizeTraits(definition.traits, traits),
      fusionId,
      fusionComponents,
      level,
      lives,
      damageOverride,
      damageMultiplier,
      visualOverrides,
      visualLayers,
      damageEffects: replaceDefinitionAbilities
        ? damageEffects
        : [...definition.damageEffects, ...damageEffects],
      periodicEffects: replaceDefinitionAbilities
        ? periodicEffects
        : [...definition.periodicEffects, ...periodicEffects],
      guidance: replaceDefinitionAbilities ? guidance : definition.guidance,
      orbitingDamage: replaceDefinitionAbilities ? orbitingDamage : definition.orbitingDamage,
      orbitingDamageOverrides,
      guidanceOverrides,
      damageEffectConfigOverrides,
    });
  }

  createDerived({
    x,
    y,
    angle,
    speed = GAME.ball.speed,
    level = GAME.ball.defaultLevel,
    lives = GAME.ball.defaultLives,
    damage = GAME.combat.baseDamage,
  }) {
    const basic = this.definitions.get(BASIC_BALL_ID);
    return new Ball({
      definitionId: BASIC_BALL_ID,
      role: 'derived',
      launchSource: 'derived',
      traits: [BALL_TRAITS.DERIVED],
      level,
      lives,
      x,
      y,
      angle,
      speed,
      radius: GAME.ball.derivedRadius,
      damage,
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
    traits,
    fusionId,
    fusionComponents,
    level,
    lives,
    damageOverride,
    damageMultiplier = 1,
    visualOverrides = {},
    visualLayers = [],
    damageEffects = definition.damageEffects,
    periodicEffects = [],
    guidance = definition.guidance,
    orbitingDamage = definition.orbitingDamage,
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
      traits,
      fusionId,
      fusionComponents,
      level,
      lives,
      radius: definition.radius,
      damage: damageOverride ?? definition.damage,
      damageMultiplier,
      damageType: definition.damageType,
      contactDamage: definition.contactDamage,
      damageEffects: damageEffects.map((effect) => ({
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
      guidance: guidance ? { ...guidance, ...guidanceOverrides } : null,
      orbiters: this.#createOrbiters(orbitingDamage, orbitingDamageOverrides),
      visual: {
        ...definition.visual,
        ...visualOverrides,
        layers: [...(definition.visual.layers ?? []), ...visualLayers],
      },
    });
  }

  #createOrbiters(config, overrides = {}) {
    if (!config) return [];
    const resolved = { ...config, ...overrides };
    const count = Math.max(1, Math.round(resolved.count ?? 1));
    const phaseOffset = resolved.phaseOffset ?? 0;
    return Array.from({ length: count }, (_, index) => ({
      phase: phaseOffset + index * Math.PI * 2 / count,
      orbitRadius: resolved.orbitRadius,
      radius: resolved.radius,
      angularSpeed: resolved.angularSpeed,
      damage: resolved.damage,
      damageType: resolved.damageType,
      payload: resolved.payload ? {
        ...resolved.payload,
        traits: [...(resolved.payload.traits ?? [])],
        damageEffects: (resolved.payload.damageEffects ?? []).map((effect) => ({
          id: effect.id,
          config: { ...(effect.config ?? {}) },
        })),
        periodicEffects: (resolved.payload.periodicEffects ?? []).map((effect) => ({
          id: effect.id,
          interval: effect.interval,
          initialDelay: effect.initialDelay,
          config: { ...(effect.config ?? {}) },
        })),
        guidance: resolved.payload.guidance ? { ...resolved.payload.guidance } : null,
      } : null,
      visual: { ...resolved.visual },
    }));
  }
}
