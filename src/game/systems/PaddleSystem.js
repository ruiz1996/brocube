import { GAME } from '../config.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class PaddleSystem {
  constructor(scene) { this.scene = scene; }

  update(dt) {
    const { input, world } = this.scene;
    const paddle = world.first('paddle');
    if (!paddle) return;
    const previousX = paddle.x;
    let direction = 0;
    if (input.isDown('ArrowLeft', 'KeyA')) direction -= 1;
    if (input.isDown('ArrowRight', 'KeyD')) direction += 1;
    paddle.x += direction * GAME.paddle.speed * dt;
    if (input.pointer.active) {
      const target = input.pointer.x - paddle.width / 2;
      paddle.x += (target - paddle.x) * Math.min(1, dt * 18);
    }
    paddle.x = clamp(paddle.x, 14, GAME.width - paddle.width - 14);
    paddle.velocityX = (paddle.x - previousX) / dt;

    for (const ball of world.all('ball')) {
      if (!ball.attached) continue;
      ball.x = paddle.x + paddle.width / 2;
      ball.y = paddle.y - ball.radius - 3;
    }
  }
}
