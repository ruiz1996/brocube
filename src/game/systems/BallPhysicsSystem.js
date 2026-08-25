import { GAME } from '../config.js';
import { BALL_TRAITS } from '../balls/BallTraits.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function circleAabb(ball, box) {
  const nearestX = clamp(ball.x, box.x, box.x + box.width);
  const nearestY = clamp(ball.y, box.y, box.y + box.height);
  const dx = ball.x - nearestX;
  const dy = ball.y - nearestY;
  const distanceSq = dx * dx + dy * dy;
  if (distanceSq >= ball.radius * ball.radius) return null;

  if (distanceSq > 0.0001) {
    const distance = Math.sqrt(distanceSq);
    return { nx: dx / distance, ny: dy / distance, depth: ball.radius - distance };
  }
  const left = Math.abs(ball.x - box.x);
  const right = Math.abs(box.x + box.width - ball.x);
  const top = Math.abs(ball.y - box.y);
  const bottom = Math.abs(box.y + box.height - ball.y);
  const minimum = Math.min(left, right, top, bottom);
  if (minimum === left) return { nx: -1, ny: 0, depth: ball.radius };
  if (minimum === right) return { nx: 1, ny: 0, depth: ball.radius };
  if (minimum === top) return { nx: 0, ny: -1, depth: ball.radius };
  return { nx: 0, ny: 1, depth: ball.radius };
}

export function circlePolygon(ball, brick) {
  const points = brick.worldPoints();
  const axes = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const edgeX = next.x - current.x;
    const edgeY = next.y - current.y;
    const length = Math.hypot(edgeX, edgeY) || 1;
    axes.push({ x: -edgeY / length, y: edgeX / length });
  }

  let closest = points[0];
  let closestDistance = Infinity;
  for (const point of points) {
    const distance = (ball.x - point.x) ** 2 + (ball.y - point.y) ** 2;
    if (distance < closestDistance) { closest = point; closestDistance = distance; }
  }
  const vertexDistance = Math.sqrt(closestDistance) || 1;
  axes.push({ x: (ball.x - closest.x) / vertexDistance, y: (ball.y - closest.y) / vertexDistance });

  let minimumOverlap = Infinity;
  let collisionAxis = null;
  for (const axis of axes) {
    let polygonMin = Infinity;
    let polygonMax = -Infinity;
    for (const point of points) {
      const projection = point.x * axis.x + point.y * axis.y;
      polygonMin = Math.min(polygonMin, projection);
      polygonMax = Math.max(polygonMax, projection);
    }
    const centerProjection = ball.x * axis.x + ball.y * axis.y;
    const circleMin = centerProjection - ball.radius;
    const circleMax = centerProjection + ball.radius;
    const overlap = Math.min(polygonMax, circleMax) - Math.max(polygonMin, circleMin);
    if (overlap <= 0) return null;
    if (overlap < minimumOverlap) {
      minimumOverlap = overlap;
      collisionAxis = { ...axis };
    }
  }

  const centerX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const centerY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  if ((ball.x - centerX) * collisionAxis.x + (ball.y - centerY) * collisionAxis.y < 0) {
    collisionAxis.x *= -1;
    collisionAxis.y *= -1;
  }
  return { nx: collisionAxis.x, ny: collisionAxis.y, depth: minimumOverlap };
}

export class BallPhysicsSystem {
  constructor(scene) {
    this.scene = scene;
    this.random = Math.random;
  }

  update(dt) {
    const { world, events } = this.scene;
    const paddles = world.all('paddle');

    for (const ball of world.all('ball')) {
      if (ball.attached) continue;
      ball.age += dt;
      ball.trail.unshift({ x: ball.x, y: ball.y, age: ball.age });
      const trailLength = ball.visual.trailLength ?? 8;
      if (ball.trail.length > trailLength) ball.trail.pop();
      ball.x += ball.velocityX * dt;
      ball.y += ball.velocityY * dt;

      if (ball.x - ball.radius < 10) {
        ball.x = 10 + ball.radius;
        ball.velocityX = Math.abs(ball.velocityX);
        events.emit('ball:bounce', { ball, surface: 'wall' });
      } else if (ball.x + ball.radius > GAME.width - 10) {
        ball.x = GAME.width - 10 - ball.radius;
        ball.velocityX = -Math.abs(ball.velocityX);
        events.emit('ball:bounce', { ball, surface: 'wall' });
      }
      if (ball.y - ball.radius < GAME.playTop) {
        ball.y = GAME.playTop + ball.radius;
        ball.velocityY = Math.abs(ball.velocityY);
        events.emit('ball:bounce', { ball, surface: 'wall' });
      }

      if (ball.velocityY > 0) {
        for (const paddle of paddles) {
          const collision = circleAabb(ball, paddle);
          if (!collision) continue;
          const relativeHit = clamp((ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2), -1, 1);
          const maximumSpeed = GAME.ball.maxSpeed;
          const speed = Math.min(maximumSpeed, Math.hypot(ball.velocityX, ball.velocityY) * 1.012);
          const angle = relativeHit * Math.PI * .36;
          ball.velocityX = Math.sin(angle) * speed + paddle.velocityX * .06;
          ball.velocityY = -Math.abs(Math.cos(angle) * speed);
          ball.y = paddle.y - ball.radius - .5;
          ball.collectibleNextHitDamageMultiplier = this.scene.collectibleRun
            .recoilDamageMultiplier;
          events.emit('ball:bounce', { ball, paddle, surface: 'paddle', strength: relativeHit });
          break;
        }
      }

      let hitBrick = null;
      const overlappingBrickIds = new Set();
      for (const brick of world.all('brick')) {
        const collision = circlePolygon(ball, brick);
        if (!collision) continue;
        overlappingBrickIds.add(brick.id);
        if (hitBrick) continue;
        const approach = ball.velocityX * collision.nx + ball.velocityY * collision.ny;
        if (approach >= 0) continue;
        if (!this.scene.ballCombat.canHit(ball, brick)) continue;
        hitBrick = { brick, collision };
      }
      for (const brickId of ball.brickContacts) {
        if (!overlappingBrickIds.has(brickId)) ball.brickContacts.delete(brickId);
      }
      if (hitBrick) {
        this.scene.ballCombat.resolveBrickCollision({
          ball,
          brick: hitBrick.brick,
          normal: hitBrick.collision,
        });
      }
      if (!ball.active) continue;
      if (ball.y - ball.radius > GAME.playBottom) {
        const bottomBounceSaved = this.random() < this.scene.upgrades.bottomBounceChance;
        const collectibleSaved = !bottomBounceSaved
          && this.scene.collectibleRun.bottomRetentionChance > 0
          && this.random() < this.scene.collectibleRun.bottomRetentionChance;
        const topRecoverySaved = !bottomBounceSaved && !collectibleSaved
          && ball.hasTrait(BALL_TRAITS.TOP_LAUNCH)
          && this.random() < this.scene.upgrades.topRecoveryChance;
        if (bottomBounceSaved || collectibleSaved || topRecoverySaved) {
          ball.y = GAME.playBottom - ball.radius;
          ball.velocityY = -Math.abs(ball.velocityY);
          events.emit('ball:bounce', { ball, surface: 'bottom' });
          events.emit('ball:saved', {
            ball,
            reason: topRecoverySaved
              ? 'top-recovery'
              : collectibleSaved ? 'collectible-retention' : 'bottom-bounce',
          });
        } else {
          ball.lives = Math.max(0, ball.lives - 1);
          events.emit('ball:life-lost', { ball, lives: ball.lives });
          if (ball.lives > 0) {
            ball.y = GAME.playBottom - ball.radius;
            ball.velocityY = -Math.abs(ball.velocityY);
            events.emit('ball:bounce', { ball, surface: 'bottom' });
            events.emit('ball:saved', { ball, reason: 'remaining-lives' });
          } else {
            ball.destroy();
            events.emit('ball:lost', { ball, lives: ball.lives });
          }
        }
      }
    }
  }
}
