import { GAME, COLORS } from '../config.js';

export const BASIC_BALL_ID = 'basic';
export const VOID_ORBIT_BALL_ID = 'void-orbit';
export const MICRO_NAVIGATION_BALL_ID = 'micro-navigation';
export const LIGHTNING_BALL_ID = 'lightning';

function normalizeDamageEffect(effect) {
  if (typeof effect === 'string') return { id: effect, config: {} };
  if (!effect?.id) throw new Error('Ball damage effect requires an id');
  return { id: effect.id, config: { ...(effect.config ?? {}) } };
}

function normalizePeriodicEffect(effect) {
  if (!effect?.id) throw new Error('Ball periodic effect requires an id');
  const interval = Math.max(.05, effect.interval ?? 1);
  return {
    id: effect.id,
    interval,
    initialDelay: Math.max(0, effect.initialDelay ?? interval),
    config: { ...(effect.config ?? {}) },
  };
}

function normalizeOrbitingDamage(config) {
  if (!config) return null;
  return {
    count: Math.max(1, Math.round(config.count ?? 1)),
    orbitRadius: Math.max(0, config.orbitRadius ?? 20),
    radius: Math.max(1, config.radius ?? 4),
    angularSpeed: config.angularSpeed ?? 3,
    phaseOffset: config.phaseOffset ?? 0,
    damage: Math.max(0, config.damage ?? GAME.combat.baseDamage),
    damageType: config.damageType ?? 'kinetic',
    visual: {
      color: '#9b6cff',
      coreColor: '#ffffff',
      ...(config.visual ?? {}),
    },
  };
}

export class BallDefinitionRegistry {
  constructor() { this.definitions = new Map(); }

  register(id, definition) {
    if (!id || this.definitions.has(id)) throw new Error(`Ball definition already exists: ${id}`);
    this.definitions.set(id, {
      id,
      damage: definition.damage ?? GAME.combat.baseDamage,
      damageType: definition.damageType ?? 'kinetic',
      contactDamage: definition.contactDamage ?? true,
      radius: definition.radius ?? GAME.ball.radius,
      speedMultiplier: definition.speedMultiplier ?? 1,
      damageEffects: (definition.damageEffects ?? []).map(normalizeDamageEffect),
      periodicEffects: (definition.periodicEffects ?? []).map(normalizePeriodicEffect),
      collisionPolicy: definition.collisionPolicy ?? 'bounce',
      collisionConfig: { ...(definition.collisionConfig ?? {}) },
      guidance: definition.guidance ? {
        strength: Math.max(0, definition.guidance.strength ?? 0),
        range: Math.max(0, definition.guidance.range ?? Infinity),
      } : null,
      orbitingDamage: normalizeOrbitingDamage(definition.orbitingDamage),
      visual: {
        renderer: 'orb',
        color: COLORS.cyan,
        coreColor: '#ffffff',
        trailColor: COLORS.cyan,
        trailLength: 8,
        ...(definition.visual ?? {}),
      },
    });
    return this;
  }

  get(id) {
    const definition = this.definitions.get(id);
    if (!definition) throw new Error(`Unknown ball definition: ${id}`);
    return definition;
  }

  has(id) { return this.definitions.has(id); }
}

export function createDefaultBallDefinitions() {
  return new BallDefinitionRegistry().register(BASIC_BALL_ID, {
    damage: GAME.combat.baseDamage,
    damageType: 'kinetic',
    collisionPolicy: 'bounce',
  }).register(VOID_ORBIT_BALL_ID, {
    damage: 0,
    damageType: 'void',
    contactDamage: false,
    collisionPolicy: 'bounce',
    orbitingDamage: {
      count: 2,
      orbitRadius: GAME.upgrade.voidOrbitRadius,
      radius: GAME.upgrade.voidOrbiterRadius,
      angularSpeed: GAME.upgrade.voidOrbiterAngularSpeed,
      damage: GAME.upgrade.voidOrbiterDamage,
      damageType: 'void',
      visual: {
        color: '#a56cff',
        coreColor: '#f4e9ff',
        trailColor: '#8a4de0',
      },
    },
    visual: {
      renderer: 'void-orbit',
      color: '#6e38bd',
      coreColor: '#090512',
      innerColor: '#24103f',
      trailColor: '#7c4bc7',
      trailLength: 10,
    },
  }).register(MICRO_NAVIGATION_BALL_ID, {
    damage: GAME.combat.baseDamage,
    damageType: 'kinetic',
    collisionPolicy: 'bounce',
    guidance: {
      strength: GAME.upgrade.navigationStrength,
      range: GAME.upgrade.navigationRange,
    },
    visual: {
      renderer: 'micro-navigation',
      color: '#4fffc2',
      coreColor: '#f3fffb',
      innerColor: '#72ffd3',
      trailColor: '#20b98d',
      trailLength: 11,
    },
  }).register(LIGHTNING_BALL_ID, {
    damage: 0,
    damageType: 'electric',
    contactDamage: false,
    damageEffects: [{
      id: 'chain-lightning',
      config: {
        damage: GAME.upgrade.lightningDamage,
        additionalTargets: GAME.upgrade.lightningAdditionalTargets,
        range: GAME.upgrade.lightningRange,
      },
    }],
    collisionPolicy: 'bounce',
    visual: {
      renderer: 'lightning',
      color: '#5dc8ff',
      coreColor: '#ffffff',
      innerColor: '#d4f5ff',
      trailColor: '#6e7cff',
      trailLength: 13,
    },
  });
}
