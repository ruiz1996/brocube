import { Ball } from '../entities/entities.js';
import { GAME } from '../config.js';

export class AutoFireSystem {
  constructor(scene) {
    this.scene = scene;
    this.random = Math.random;
    this.timeUntilShot = .25;
  }

  get interval() { return this.scene.upgrades.fireInterval; }

  reset() { this.timeUntilShot = .25; }

  update(dt) {
    this.timeUntilShot -= dt;
    if (this.timeUntilShot > 0) return;
    const paddle = this.scene.world.first('paddle');
    if (!paddle) return;
    const randomized = this.scene.upgrades.levels.multiShot > 0;
    this.#fireBall(paddle, this.#launchAngle(randomized));
    if (this.random() < this.scene.upgrades.extraBallChance) {
      this.#fireBall(paddle, this.#launchAngle(true));
    }
    this.timeUntilShot += this.interval;
  }

  #fireBall(paddle, angle) {
    const ball = new Ball({
      x: paddle.x + paddle.width / 2,
      y: paddle.y - GAME.ball.radius - 4,
      angle,
      speed: GAME.ball.speed * this.scene.upgrades.ballSpeedMultiplier,
    });
    this.scene.world.add(ball);
    this.scene.events.emit('ball:launched', { ball, automatic: true });
  }

  #launchAngle(randomized) {
    if (!randomized) return -Math.PI / 2 + (this.random() - .5) * .26;
    const minimum = GAME.upgrade.randomLaunchMinAngle;
    return -(minimum + this.random() * (Math.PI - minimum * 2));
  }
}
