import { GAME, COLORS } from '../config.js';

export const BASIC_BALL_ID = 'basic';

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

export class BallDefinitionRegistry {
  constructor() { this.definitions = new Map(); }

  register(id, definition) {
    if (!id || this.definitions.has(id)) throw new Error(`Ball definition already exists: ${id}`);
    this.definitions.set(id, {
      id,
      damage: definition.damage ?? 1,
      damageType: definition.damageType ?? 'kinetic',
      radius: definition.radius ?? GAME.ball.radius,
      speedMultiplier: definition.speedMultiplier ?? 1,
      damageEffects: (definition.damageEffects ?? []).map(normalizeDamageEffect),
      periodicEffects: (definition.periodicEffects ?? []).map(normalizePeriodicEffect),
      collisionPolicy: definition.collisionPolicy ?? 'bounce',
      collisionConfig: { ...(definition.collisionConfig ?? {}) },
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
    damage: 1,
    damageType: 'kinetic',
    collisionPolicy: 'bounce',
  });
}
