import { GAME } from '../config.js';
import { resolveAbilityDamage, scaleDamage } from '../Damage.js';

function reflectBall(ball, normal) {
  const dot = ball.velocityX * normal.nx + ball.velocityY * normal.ny;
  if (dot >= 0) return false;
  ball.velocityX -= 2 * dot * normal.nx;
  ball.velocityY -= 2 * dot * normal.ny;
  ball.x += normal.nx * (normal.depth + .2);
  ball.y += normal.ny * (normal.depth + .2);
  return true;
}

export class BallBehaviorRegistry {
  constructor() {
    this.random = Math.random;
    this.damageEffects = new Map();
    this.collisionPolicies = new Map();
    this.periodicEffects = new Map();
  }

  registerDamageEffect(id, handler) {
    if (!id || this.damageEffects.has(id)) throw new Error(`Damage effect already exists: ${id}`);
    this.damageEffects.set(id, handler);
    return this;
  }

  registerCollisionPolicy(id, handler) {
    if (!id || this.collisionPolicies.has(id)) throw new Error(`Collision policy already exists: ${id}`);
    this.collisionPolicies.set(id, handler);
    return this;
  }

  registerPeriodicEffect(id, handler) {
    if (!id || this.periodicEffects.has(id)) throw new Error(`Ball periodic effect already exists: ${id}`);
    this.periodicEffects.set(id, handler);
    return this;
  }

  runDamageEffects(effectEntries, context) {
    for (const entry of effectEntries) {
      const id = typeof entry === 'string' ? entry : entry.id;
      const effectConfig = typeof entry === 'string' ? {} : entry.config;
      const effect = this.damageEffects.get(id);
      if (!effect) throw new Error(`Unknown damage effect: ${id}`);
      effect({ ...context, effectId: id, effectConfig });
    }
  }

  resolveCollision(policyId, context) {
    const policy = this.collisionPolicies.get(policyId) ?? this.collisionPolicies.get('bounce');
    return policy(context);
  }

  runPeriodicEffect(id, context) {
    const effect = this.periodicEffects.get(id);
    if (!effect) throw new Error(`Unknown ball periodic effect: ${id}`);
    return effect(context);
  }
}

export function createDefaultBallBehaviors() {
  const registry = new BallBehaviorRegistry();

  const explode = ({
    scene,
    combat,
    ball,
    effectConfig,
    cause,
    origin = null,
    orbiter = null,
    hitDamageMultiplier = 1,
  }) => {
    const radius = Math.max(1, effectConfig.radius ?? 120);
    const damage = scaleDamage(resolveAbilityDamage(ball, {
      ...effectConfig,
      baseDamageScale: effectConfig.baseDamageScale
        ?? (effectConfig.damage ?? GAME.combat.baseDamage) / GAME.combat.baseDamage,
    }, GAME.combat.baseDamage), hitDamageMultiplier);
    const x = origin?.x ?? ball.x;
    const y = origin?.y ?? ball.y;
    const hitBricks = [];
    for (const brick of scene.world.all('brick')) {
      const centerX = brick.x + brick.width / 2;
      const centerY = brick.y + brick.height / 2;
      if (Math.hypot(centerX - x, centerY - y) > radius) continue;
      combat.applyDamage({
        ball,
        brick,
        damage,
        damageType: effectConfig.damageType ?? 'explosive',
        cause,
      });
      hitBricks.push(brick);
    }
    const payload = {
      ball,
      x,
      y,
      radius,
      damage,
      hitBricks,
      color: effectConfig.color ?? '#ff5cab',
      secondaryColor: effectConfig.secondaryColor ?? '#9b6cff',
      cause,
      orbiter,
    };
    scene.events.emit('ball:exploded', payload);
    return payload;
  };

  registry.registerCollisionPolicy('bounce', ({ ball, contact }) => {
    reflectBall(ball, contact.normal);
    return { action: 'bounce' };
  });

  registry.registerCollisionPolicy('pierce', ({ ball, contact }) => {
    const remaining = ball.collisionState.remainingPierces ?? Infinity;
    if (remaining > 0) {
      if (Number.isFinite(remaining)) ball.collisionState.remainingPierces = remaining - 1;
      return { action: 'pierce', remainingPierces: ball.collisionState.remainingPierces };
    }
    reflectBall(ball, contact.normal);
    return { action: 'bounce' };
  });

  registry.registerCollisionPolicy('split', ({ scene, ball, contact }) => {
    const count = Math.max(1, Math.round(ball.collisionConfig.splitCount ?? 2));
    const spread = ball.collisionConfig.spreadRadians ?? .8;
    const speedRatio = ball.collisionConfig.derivedSpeedRatio ?? 1;
    const baseAngle = Math.atan2(ball.velocityY, ball.velocityX);
    const speed = Math.hypot(ball.velocityX, ball.velocityY) * speedRatio;
    const created = [];
    for (let index = 0; index < count; index += 1) {
      const progress = count === 1 ? .5 : index / (count - 1);
      const angle = baseAngle - spread / 2 + spread * progress;
      const derived = scene.ballFactory.createDerived({
        x: ball.x,
        y: ball.y,
        angle,
        speed,
        lives: scene.upgrades.newBallLives,
        damage: GAME.combat.baseDamage + scene.upgrades.ballDamageBonus,
      });
      scene.collectibleRun.applyBall(derived);
      scene.world.add(derived);
      created.push(derived);
    }
    if (ball.collisionConfig.consumeParent !== false) ball.destroy();
    else reflectBall(ball, contact.normal);
    scene.events.emit('ball:split', { ball, derivedBalls: created });
    return { action: 'split', derivedBalls: created };
  });

  registry.registerPeriodicEffect('area-blast', ({ scene, combat, ball, effectConfig, origin, orbiter }) => {
    return explode({ scene, combat, ball, effectConfig, cause: 'periodic-explosion', origin, orbiter });
  });

  registry.registerDamageEffect('impact-blast', ({
    scene, combat, ball, effectConfig, origin, orbiter, hitDamageMultiplier,
  }) => {
    const chance = Math.max(0, Math.min(1, effectConfig.chance ?? 0));
    if (registry.random() >= chance) return null;
    return explode({
      scene,
      combat,
      ball,
      effectConfig,
      cause: 'impact-explosion',
      origin,
      orbiter,
      hitDamageMultiplier,
    });
  });

  registry.registerDamageEffect('chain-lightning', ({
    scene, combat, ball, brick, effectConfig, origin, hitDamageMultiplier,
  }) => {
    const damage = scaleDamage(resolveAbilityDamage(ball, {
      ...effectConfig,
      baseDamageScale: effectConfig.baseDamageScale
        ?? (effectConfig.damage ?? GAME.combat.baseDamage) / GAME.combat.baseDamage,
    }, GAME.combat.baseDamage), hitDamageMultiplier ?? 1);
    const additionalTargets = Math.max(0, Math.round(effectConfig.additionalTargets ?? 1));
    const range = Math.max(1, effectConfig.range ?? 160);
    const targets = [brick];
    const points = [{ x: origin?.x ?? ball.x, y: origin?.y ?? ball.y }];
    let previous = brick;

    for (let index = 0; index <= additionalTargets; index += 1) {
      if (index > 0) {
        const previousX = previous.x + previous.width / 2;
        const previousY = previous.y + previous.height / 2;
        let nearest = null;
        let nearestDistance = Infinity;
        for (const candidate of scene.world.all('brick')) {
          if (targets.includes(candidate)) continue;
          const candidateX = candidate.x + candidate.width / 2;
          const candidateY = candidate.y + candidate.height / 2;
          const distance = Math.hypot(candidateX - previousX, candidateY - previousY);
          if (distance > range || distance >= nearestDistance) continue;
          nearest = candidate;
          nearestDistance = distance;
        }
        if (!nearest) break;
        previous = nearest;
        targets.push(nearest);
      }

      points.push({
        x: previous.x + previous.width / 2,
        y: previous.y + previous.height / 2,
      });
      combat.applyDamage({
        ball,
        brick: previous,
        damage,
        damageType: 'electric',
        cause: 'chain-lightning',
      });
      if (previous.active && scene.collectibleRun.rollLightningEcho()) {
        const echoResult = combat.applyDamage({
          ball,
          brick: previous,
          damage,
          damageType: 'electric',
          cause: 'chain-lightning-echo',
        });
        scene.events.emit('ball:lightning-echo', {
          ball,
          brick: previous,
          damage,
          source: 'chain-lightning',
          destroyed: echoResult.destroyed,
        });
      }
      const strikeChance = Math.max(0, Math.min(1, effectConfig.strikeChance ?? 0));
      if (registry.random() < strikeChance && previous.active) {
        const strikeResult = combat.applyDamage({
          ball,
          brick: previous,
          damage,
          damageType: 'electric',
          cause: 'lightning-strike',
        });
        scene.events.emit('ball:lightning-strike', {
          ball,
          brick: previous,
          x: previous.x + previous.width / 2,
          y: previous.y + previous.height / 2,
          damage,
          destroyed: strikeResult.destroyed,
        });
        if (previous.active && scene.collectibleRun.rollLightningEcho()) {
          const echoResult = combat.applyDamage({
            ball,
            brick: previous,
            damage,
            damageType: 'electric',
            cause: 'lightning-strike-echo',
          });
          scene.events.emit('ball:lightning-echo', {
            ball,
            brick: previous,
            damage,
            source: 'lightning-strike',
            destroyed: echoResult.destroyed,
          });
        }
      }
    }

    const payload = { ball, targets, points, damage, additionalTargets: targets.length - 1 };
    scene.events.emit('ball:lightning-chain', payload);
    return payload;
  });

  return registry;
}
