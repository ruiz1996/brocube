import { Entity } from '../../core/Entity.js';
import { GAME } from '../config.js';
import {
  normalizeDamage,
  normalizeDamageMultiplier,
  scaleDamage,
} from '../Damage.js';

export class Paddle extends Entity {
  constructor({ role = 'primary', x, y, width, height } = {}) {
    super('paddle', {
      tags: ['collidable', 'player', role],
      role,
      x: x ?? (GAME.width - (width ?? GAME.paddle.width)) / 2,
      y: y ?? GAME.paddle.y,
      width: width ?? GAME.paddle.width,
      height: height ?? GAME.paddle.height,
      velocityX: 0,
    });
  }
}

export class Ball extends Entity {
  constructor({
    definitionId = 'basic',
    role = 'primary',
    x,
    y,
    speed = GAME.ball.speed,
    angle = -Math.PI / 2,
    launchSource = 'manual',
    traits = [],
    fusionId = null,
    fusionComponents = [],
    level = GAME.ball.defaultLevel,
    lives = GAME.ball.defaultLives,
    kills = 0,
    experience = kills,
    radius = GAME.ball.radius,
    damage = GAME.combat.baseDamage,
    damageMultiplier = 1,
    damageType = 'kinetic',
    contactDamage = true,
    damageEffects = [],
    periodicEffects = [],
    collisionPolicy = 'bounce',
    collisionConfig = {},
    guidance = null,
    orbiters = [],
    visual = {},
  } = {}) {
    const baseDamage = normalizeDamage(damage);
    const contactDamageMultiplier = normalizeDamageMultiplier(damageMultiplier);
    super('ball', {
      tags: ['collidable', 'projectile', role],
      definitionId,
      role,
      launchSource,
      traits: new Set(traits),
      fusionId,
      fusionComponents: [...fusionComponents],
      level: Math.max(1, Math.round(level)),
      lives: Math.max(0, Math.round(lives)),
      kills: Math.max(0, Math.round(kills)),
      experience: Math.max(0, Number(experience) || 0),
      x: x ?? GAME.width / 2,
      y: y ?? GAME.paddle.y - 14,
      radius,
      velocityX: Math.cos(angle) * speed,
      velocityY: Math.sin(angle) * speed,
      speed,
      baseDamage,
      contactDamageMultiplier,
      damage: contactDamage === false ? 0 : scaleDamage(baseDamage, contactDamageMultiplier),
      damageType,
      contactDamage,
      damageEffects: damageEffects.map((effect) => (
        typeof effect === 'string'
          ? { id: effect, config: {} }
          : { id: effect.id, config: { ...(effect.config ?? {}) } }
      )),
      periodicEffects: periodicEffects.map((effect) => {
        const interval = Math.max(.05, effect.interval ?? 1);
        return {
          id: effect.id,
          interval,
          timeRemaining: Math.max(0, effect.initialDelay ?? interval),
          config: { ...(effect.config ?? {}) },
        };
      }),
      collisionPolicy,
      collisionConfig: { ...collisionConfig },
      collisionState: { ...collisionConfig },
      guidance: guidance ? {
        ...guidance,
        targetId: null,
        needsTarget: true,
      } : null,
      orbiters: orbiters.map((orbiter, index) => ({
        ...orbiter,
        damage: normalizeDamage(orbiter.damage),
        id: orbiter.id ?? `orbiter-${index}`,
        visual: { ...(orbiter.visual ?? {}) },
        payload: orbiter.payload ? {
          ...orbiter.payload,
          traits: new Set(orbiter.payload.traits ?? []),
          damageEffects: (orbiter.payload.damageEffects ?? []).map((effect) => ({
            id: effect.id,
            config: { ...(effect.config ?? {}) },
          })),
          periodicEffects: (orbiter.payload.periodicEffects ?? []).map((effect) => {
            const interval = Math.max(.05, effect.interval ?? 1);
            const initialDelay = Math.max(0, effect.initialDelay ?? interval);
            return {
              id: effect.id,
              interval,
              timeRemaining: initialDelay + (effect.stagger === false
                ? 0
                : index * interval / Math.max(1, orbiters.length)),
              config: { ...(effect.config ?? {}) },
            };
          }),
          guidance: orbiter.payload.guidance ? {
            ...orbiter.payload.guidance,
            cooldownRemaining: index * .12,
            lunge: null,
          } : null,
        } : null,
        positionOverride: null,
        brickContacts: new Set(),
      })),
      visual: { ...visual },
      brickContacts: new Set(),
      attached: false,
      age: 0,
      levelUpAt: -Infinity,
      trail: [],
    });
  }

  hasTrait(trait) { return this.traits.has(trait); }
}

export class Brick extends Entity {
  constructor({ x, y, width, height, points, hitPoints = GAME.combat.baseHealth, color, score = 100, variant = 'normal', bossShape = null }) {
    const normalizedHitPoints = Math.max(1, normalizeDamage(hitPoints));
    super('brick', {
      tags: ['collidable', 'breakable'],
      x, y, width, height,
      points: points ?? [
        { x: 0, y: 0 }, { x: width, y: 0 },
        { x: width, y: height }, { x: 0, y: height },
      ],
      hitPoints: normalizedHitPoints, maxHitPoints: normalizedHitPoints, color, score,
      variant,
      bossShape,
      hitFlash: 0,
    });
  }

  damage(amount = GAME.combat.baseDamage) {
    this.hitPoints -= normalizeDamage(amount);
    this.hitFlash = 1;
    if (this.hitPoints <= 0) this.destroy();
    return !this.active;
  }

  worldPoints() {
    return this.points.map((point) => ({ x: this.x + point.x, y: this.y + point.y }));
  }

  bottom() {
    return this.y + Math.max(...this.points.map((point) => point.y));
  }
}

export class Particle extends Entity {
  constructor({ x, y, velocityX, velocityY, color, life = .45, size = 3 }) {
    super('particle', { x, y, velocityX, velocityY, color, life, maxLife: life, size });
  }
}

export class BlastWave extends Entity {
  constructor({ x, y, radius, color = '#ff5cab', secondaryColor = '#9b6cff', life = .5 }) {
    super('blast-wave', {
      x,
      y,
      radius,
      color,
      secondaryColor,
      life,
      maxLife: life,
    });
  }
}

export class LightningArc extends Entity {
  constructor({ points, color = '#78d7ff', life = .18 }) {
    super('lightning-arc', {
      points: points.map((point) => ({ ...point })),
      color,
      life,
      maxLife: life,
    });
  }
}

export class LightningStrike extends Entity {
  constructor({ x, y, color = '#d9f8ff', life = .28 }) {
    super('lightning-strike', {
      x,
      y,
      color,
      life,
      maxLife: life,
      seed: Math.random() * 1000,
    });
  }
}
