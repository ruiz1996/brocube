const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class GuidanceSystem {
  constructor(scene) {
    this.scene = scene;
    this.random = Math.random;
    this.unsubscribe = scene.events.on('ball:bounce', ({ ball, brick }) => {
      if (!ball.guidance) return;
      this.selectTarget(ball);
      if (brick && ball.guidance.returnStrikeChance > 0) {
        ball.guidance.pendingReturnStrike = {
          targetId: brick.id,
          delay: ball.guidance.returnStrikeDelay ?? .1,
        };
      } else if (!brick) {
        ball.guidance.returnStrikeChain = 0;
      }
    });
  }

  selectTarget(ball) {
    if (!ball.guidance) return null;
    let nearest = null;
    let nearestDistance = Infinity;
    for (const brick of this.scene.world.all('brick')) {
      const targetX = brick.x + brick.width / 2;
      const targetY = brick.y + brick.height / 2;
      const distance = Math.hypot(targetX - ball.x, targetY - ball.y);
      if (distance > ball.guidance.range || distance >= nearestDistance) continue;
      nearest = brick;
      nearestDistance = distance;
    }
    ball.guidance.targetId = nearest?.id ?? null;
    ball.guidance.needsTarget = false;
    return nearest;
  }

  update(dt) {
    const bricks = this.scene.world.all('brick');
    for (const ball of this.scene.world.all('ball')) {
      if (!ball.guidance) continue;
      this.#updateReturnStrike(ball, bricks, dt);
      if (ball.guidance.needsTarget) this.selectTarget(ball);
      const target = bricks.find(({ id }) => id === ball.guidance.targetId);
      if (!target) continue;

      const speed = Math.hypot(ball.velocityX, ball.velocityY);
      if (speed <= 0) continue;
      const currentAngle = Math.atan2(ball.velocityY, ball.velocityX);
      const targetAngle = Math.atan2(
        target.y + target.height / 2 - ball.y,
        target.x + target.width / 2 - ball.x,
      );
      const difference = Math.atan2(
        Math.sin(targetAngle - currentAngle),
        Math.cos(targetAngle - currentAngle),
      );
      const maximumTurn = ball.guidance.strength * dt;
      const nextAngle = currentAngle + clamp(difference, -maximumTurn, maximumTurn);
      ball.velocityX = Math.cos(nextAngle) * speed;
      ball.velocityY = Math.sin(nextAngle) * speed;
    }
  }

  #updateReturnStrike(ball, bricks, dt) {
    const pending = ball.guidance.pendingReturnStrike;
    if (!pending) return;
    pending.delay -= dt;
    if (pending.delay > 0) return;
    ball.guidance.pendingReturnStrike = null;
    const target = bricks.find(({ id, active }) => id === pending.targetId && active);
    if (!target) {
      ball.guidance.returnStrikeChain = 0;
      return;
    }
    const chain = Math.max(0, ball.guidance.returnStrikeChain ?? 0);
    const chance = (ball.guidance.returnStrikeChance ?? 0)
      * (ball.guidance.returnStrikeChainDecay ?? .6) ** chain;
    if (this.random() >= chance) {
      ball.guidance.returnStrikeChain = 0;
      return;
    }
    const speed = Math.hypot(ball.velocityX, ball.velocityY);
    const angle = Math.atan2(
      target.y + target.height / 2 - ball.y,
      target.x + target.width / 2 - ball.x,
    );
    ball.velocityX = Math.cos(angle) * speed;
    ball.velocityY = Math.sin(angle) * speed;
    ball.guidance.returnStrikeChain = chain + 1;
    this.scene.events.emit('ball:navigation-return', {
      ball,
      brick: target,
      chance,
      chain: chain + 1,
    });
  }

  dispose() { this.unsubscribe(); }
}
