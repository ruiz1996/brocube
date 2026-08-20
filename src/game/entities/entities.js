import { Entity } from '../../core/Entity.js';
import { GAME } from '../config.js';

export class Paddle extends Entity {
  constructor() {
    super('paddle', {
      tags: ['collidable', 'player'],
      x: (GAME.width - GAME.paddle.width) / 2,
      y: GAME.paddle.y,
      width: GAME.paddle.width,
      height: GAME.paddle.height,
      velocityX: 0,
    });
  }
}

export class Ball extends Entity {
  constructor({ x, y, speed = GAME.ball.speed, angle = -Math.PI / 2 } = {}) {
    super('ball', {
      tags: ['collidable', 'projectile'],
      x: x ?? GAME.width / 2,
      y: y ?? GAME.paddle.y - 14,
      radius: GAME.ball.radius,
      velocityX: Math.cos(angle) * speed,
      velocityY: Math.sin(angle) * speed,
      speed,
      attached: false,
      trail: [],
    });
  }
}

export class Brick extends Entity {
  constructor({ x, y, width, height, points, hitPoints = 1, color, score = 100 }) {
    super('brick', {
      tags: ['collidable', 'breakable'],
      x, y, width, height,
      points: points ?? [
        { x: 0, y: 0 }, { x: width, y: 0 },
        { x: width, y: height }, { x: 0, y: height },
      ],
      hitPoints, maxHitPoints: hitPoints, color, score,
      hitFlash: 0,
    });
  }

  damage(amount = 1) {
    this.hitPoints -= amount;
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
