export class BallRendererRegistry {
  constructor() { this.renderers = new Map(); }

  register(id, renderer) {
    if (!id || this.renderers.has(id)) throw new Error(`Ball renderer already exists: ${id}`);
    this.renderers.set(id, renderer);
    return this;
  }

  render(ctx, ball) {
    const renderer = this.renderers.get(ball.visual.renderer) ?? this.renderers.get('orb');
    renderer(ctx, ball);
  }
}

export function createDefaultBallRenderers() {
  const registry = new BallRendererRegistry();

  registry.register('orb', (ctx, ball) => {
    const trailColor = ball.visual.trailColor ?? ball.visual.color;
    ctx.save();
    for (let index = ball.trail.length - 1; index >= 0; index -= 1) {
      const point = ball.trail[index];
      ctx.globalAlpha = (ball.trail.length - index) / ball.trail.length * .12;
      ctx.fillStyle = trailColor;
      ctx.beginPath();
      ctx.arc(point.x, point.y, ball.radius * (1 - index / ball.trail.length * .65), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowColor = ball.visual.color;
    ctx.shadowBlur = ball.role === 'derived' ? 13 : 22;
    const glow = ctx.createRadialGradient(ball.x - 2, ball.y - 2, 0, ball.x, ball.y, ball.radius);
    glow.addColorStop(0, ball.visual.coreColor ?? '#ffffff');
    glow.addColorStop(.35, ball.visual.innerColor ?? '#bff9ff');
    glow.addColorStop(1, ball.visual.color);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  registry.register('top-launch', (ctx, ball) => {
    const pulse = .5 + Math.sin((ball.age ?? 0) * 18) * .5;
    ctx.save();

    ctx.lineCap = 'round';
    for (let index = ball.trail.length - 1; index > 0; index -= 1) {
      const point = ball.trail[index];
      const next = ball.trail[index - 1];
      const progress = 1 - index / ball.trail.length;
      ctx.globalAlpha = .05 + progress * .35;
      ctx.strokeStyle = index % 2 === 0 ? ball.visual.trailColor : ball.visual.color;
      ctx.lineWidth = Math.max(1, ball.radius * progress * 1.15);
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(next.x, next.y);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.translate(ball.x, ball.y);
    ctx.rotate(Math.atan2(ball.velocityY, ball.velocityX));
    const wake = ctx.createLinearGradient(-ball.radius * 5.5, 0, ball.radius, 0);
    wake.addColorStop(0, 'rgba(255, 92, 125, 0)');
    wake.addColorStop(.62, 'rgba(255, 92, 125, .32)');
    wake.addColorStop(1, 'rgba(255, 225, 122, .82)');
    ctx.fillStyle = wake;
    ctx.beginPath();
    ctx.moveTo(-ball.radius * (5 + pulse), 0);
    ctx.lineTo(-ball.radius * .35, -ball.radius * .82);
    ctx.lineTo(ball.radius * .3, 0);
    ctx.lineTo(-ball.radius * .35, ball.radius * .82);
    ctx.closePath();
    ctx.fill();

    ctx.shadowColor = ball.visual.color;
    ctx.shadowBlur = 28 + pulse * 10;
    ctx.strokeStyle = `rgba(255, 225, 122, ${.42 + pulse * .3})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, ball.radius * (1.55 + pulse * .14), 0, Math.PI * 2);
    ctx.stroke();

    const core = ctx.createRadialGradient(-2, -2, 0, 0, 0, ball.radius * 1.08);
    core.addColorStop(0, ball.visual.coreColor);
    core.addColorStop(.34, ball.visual.innerColor);
    core.addColorStop(1, ball.visual.color);
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, ball.radius * 1.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  return registry;
}
