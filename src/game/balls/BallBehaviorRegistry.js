import { GAME } from '../config.js';

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
      scene.world.add(derived);
      created.push(derived);
    }
    if (ball.collisionConfig.consumeParent !== false) ball.destroy();
    else reflectBall(ball, contact.normal);
    scene.events.emit('ball:split', { ball, derivedBalls: created });
    return { action: 'split', derivedBalls: created };
  });

  registry.registerPeriodicEffect('area-blast', ({ scene, combat, ball, effectConfig }) => {
    const radius = Math.max(1, effectConfig.radius ?? 120);
    const damage = Math.max(0, effectConfig.damage ?? GAME.combat.baseDamage);
    const hitBricks = [];
    for (const brick of scene.world.all('brick')) {
      const centerX = brick.x + brick.width / 2;
      const centerY = brick.y + brick.height / 2;
      if (Math.hypot(centerX - ball.x, centerY - ball.y) > radius) continue;
      combat.applyDamage({
        ball,
        brick,
        damage,
        damageType: effectConfig.damageType ?? 'explosive',
        cause: 'periodic-explosion',
      });
      hitBricks.push(brick);
    }
    const payload = {
      ball,
      x: ball.x,
      y: ball.y,
      radius,
      damage,
      hitBricks,
      color: effectConfig.color ?? '#ff5cab',
      secondaryColor: effectConfig.secondaryColor ?? '#9b6cff',
    };
    scene.events.emit('ball:exploded', payload);
    return payload;
  });

  registry.registerDamageEffect('chain-lightning', ({ scene, combat, ball, brick, effectConfig }) => {
    const damage = Math.max(0, effectConfig.damage ?? GAME.combat.baseDamage);
    const additionalTargets = Math.max(0, Math.round(effectConfig.additionalTargets ?? 1));
    const range = Math.max(1, effectConfig.range ?? 160);
    const targets = [brick];
    const points = [{ x: ball.x, y: ball.y }];
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
    }

    const payload = { ball, targets, points, damage, additionalTargets: targets.length - 1 };
    scene.events.emit('ball:lightning-chain', payload);
    return payload;
  });

  return registry;
}
