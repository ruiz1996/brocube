import { getNaturalOrbiterPosition, getOrbiterPosition } from '../balls/Orbiter.js';
import { circlePolygon } from './BallPhysicsSystem.js';
import { scaleDamage } from '../Damage.js';

export class OrbiterDamageSystem {
  constructor(scene) { this.scene = scene; }

  positionOf(ball, orbiter) { return getOrbiterPosition(ball, orbiter); }

  update(dt = 0) {
    const bricks = this.scene.world.all('brick');
    for (const ball of this.scene.world.all('ball')) {
      if (!ball.active || ball.orbiters.length === 0) continue;
      for (const orbiter of ball.orbiters) {
        this.#updatePayloadMotion(ball, orbiter, bricks, dt);
        const position = getOrbiterPosition(ball, orbiter);
        const overlappingBrickIds = new Set();
        for (const brick of bricks) {
          if (!brick.active) continue;
          const collision = circlePolygon(position, brick);
          if (!collision) continue;
          overlappingBrickIds.add(brick.id);
          if (orbiter.brickContacts.has(brick.id)) continue;
          orbiter.brickContacts.add(brick.id);
          const payload = orbiter.payload;
          const damageMultiplier = payload?.damageMultiplier ?? 1;
          const damage = payload?.contactDamage === false
            ? 0
            : scaleDamage(orbiter.damage, damageMultiplier);
          const contact = {
            normal: collision,
            orbiterId: orbiter.id,
            position,
          };
          const damageResult = damage > 0
            ? this.scene.ballCombat.applyDamage({
              ball,
              brick,
              damage,
              damageType: orbiter.damageType,
              contact,
              cause: `orbiting-${payload?.type ?? 'satellite'}`,
            })
            : { damage: 0, destroyed: false };
          if (payload?.damageEffects?.length) {
            this.scene.ballBehaviors.runDamageEffects(payload.damageEffects, {
              scene: this.scene,
              world: this.scene.world,
              events: this.scene.events,
              combat: this.scene.ballCombat,
              ball,
              brick,
              contact,
              origin: position,
              orbiter,
              ...damageResult,
            });
          }
          this.#queueReturnLunge(orbiter, brick);
          this.scene.events.emit('ball:orbiter-hit', {
            ball,
            orbiter,
            brick,
            position,
          });
        }
        for (const brickId of orbiter.brickContacts) {
          if (!overlappingBrickIds.has(brickId)) orbiter.brickContacts.delete(brickId);
        }
      }
    }
  }

  #nearestBrick(position, bricks, range) {
    let nearest = null;
    let nearestDistance = Infinity;
    for (const brick of bricks) {
      if (!brick.active) continue;
      const x = brick.x + brick.width / 2;
      const y = brick.y + brick.height / 2;
      const distance = Math.hypot(x - position.x, y - position.y);
      if (distance > range || distance >= nearestDistance) continue;
      nearest = brick;
      nearestDistance = distance;
    }
    return nearest;
  }

  #updatePayloadMotion(ball, orbiter, bricks, dt) {
    const guidance = orbiter.payload?.guidance;
    if (!guidance) {
      orbiter.positionOverride = null;
      return;
    }
    guidance.cooldownRemaining = Math.max(0, (guidance.cooldownRemaining ?? 0) - dt);
    if (!guidance.lunge && guidance.cooldownRemaining <= 0) {
      const origin = getNaturalOrbiterPosition(ball, orbiter);
      const target = this.#nearestBrick(origin, bricks, guidance.range ?? Infinity);
      if (target) {
        const strengthRatio = Math.max(.35, (guidance.strength ?? .55) / .55);
        guidance.lunge = {
          targetId: target.id,
          elapsed: 0,
          duration: Math.max(.16, .38 / strengthRatio),
        };
      }
    }
    if (!guidance.lunge) {
      orbiter.positionOverride = null;
      return;
    }
    const target = bricks.find(({ id }) => id === guidance.lunge.targetId);
    if (!target?.active) {
      guidance.lunge = null;
      guidance.cooldownRemaining = .25;
      orbiter.positionOverride = null;
      return;
    }
    guidance.lunge.elapsed += dt;
    const progress = Math.min(1, guidance.lunge.elapsed / guidance.lunge.duration);
    const natural = getNaturalOrbiterPosition(ball, orbiter);
    const targetX = target.x + target.width / 2;
    const targetY = target.y + target.height / 2;
    const outward = progress <= .5 ? progress * 2 : (1 - progress) * 2;
    const eased = 1 - (1 - Math.max(0, outward)) ** 2;
    orbiter.positionOverride = {
      x: natural.x + (targetX - natural.x) * eased,
      y: natural.y + (targetY - natural.y) * eased,
      angle: natural.angle,
    };
    if (progress >= 1) {
      guidance.lunge = null;
      guidance.cooldownRemaining = Math.max(.2, .72 / Math.max(.5, guidance.strength / .55));
      orbiter.positionOverride = null;
    }
  }

  #queueReturnLunge(orbiter, brick) {
    const guidance = orbiter.payload?.guidance;
    if (!guidance || !brick.active) return;
    const chain = Math.max(0, guidance.returnStrikeChain ?? 0);
    const chance = Math.max(0, Math.min(1,
      (guidance.returnStrikeChance ?? 0)
        * (guidance.returnStrikeChainDecay ?? .6) ** chain,
    ));
    if (this.scene.ballBehaviors.random() >= chance) {
      guidance.returnStrikeChain = 0;
      return;
    }
    guidance.returnStrikeChain = chain + 1;
    guidance.lunge = { targetId: brick.id, elapsed: 0, duration: .16 };
    guidance.cooldownRemaining = 0;
    this.scene.events.emit('ball:orbiter-return', { orbiter, brick });
  }
}
