import { getOrbiterPosition, getOrbiterTrail } from './Orbiter.js';

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

  registry.register('blast-core', (ctx, ball) => {
    const pulse = .5 + Math.sin((ball.age ?? 0) * 12) * .5;
    const blastEffect = ball.periodicEffects.find((effect) => effect.id === 'area-blast');
    const charge = blastEffect
      ? Math.max(0, Math.min(1, 1 - blastEffect.timeRemaining / blastEffect.interval))
      : 0;
    ctx.save();

    for (let index = ball.trail.length - 1; index >= 0; index -= 1) {
      const point = ball.trail[index];
      const progress = 1 - index / ball.trail.length;
      ctx.globalAlpha = .04 + progress * .2;
      ctx.fillStyle = index % 2 === 0 ? ball.visual.trailColor : ball.visual.color;
      ctx.beginPath();
      ctx.arc(point.x, point.y, Math.max(1, ball.radius * progress * .7), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.translate(ball.x, ball.y);
    ctx.shadowColor = ball.visual.color;
    ctx.shadowBlur = 24 + pulse * 12;
    ctx.strokeStyle = 'rgba(217, 140, 255, .38)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, ball.radius * (1.55 + pulse * .16), 0, Math.PI * 2);
    ctx.stroke();

    const orbit = (ball.age ?? 0) * 4.5;
    for (let index = 0; index < 3; index += 1) {
      const angle = orbit + index * Math.PI * 2 / 3;
      const distance = ball.radius * 1.5;
      ctx.fillStyle = index === 0 ? '#fff5ff' : ball.visual.innerColor;
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * distance, Math.sin(angle) * distance, 1.5 + pulse, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowBlur = 28;
    const core = ctx.createRadialGradient(-2, -2, 0, 0, 0, ball.radius * 1.08);
    core.addColorStop(0, ball.visual.coreColor);
    core.addColorStop(.3, ball.visual.innerColor);
    core.addColorStop(.72, ball.visual.color);
    core.addColorStop(1, '#651d9c');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, ball.radius * 1.08, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 12;
    ctx.strokeStyle = '#fff5ff';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, ball.radius * 1.92, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * charge);
    ctx.stroke();
    ctx.restore();
  });

  registry.register('void-orbit', (ctx, ball) => {
    const pulse = .5 + Math.sin((ball.age ?? 0) * 9) * .5;
    const positions = ball.orbiters.map((orbiter) => ({
      orbiter,
      ...getOrbiterPosition(ball, orbiter),
    }));
    ctx.save();

    for (let index = ball.trail.length - 1; index >= 0; index -= 1) {
      const point = ball.trail[index];
      const progress = 1 - index / ball.trail.length;
      ctx.globalAlpha = .03 + progress * .12;
      ctx.fillStyle = ball.visual.trailColor;
      ctx.beginPath();
      ctx.arc(point.x, point.y, Math.max(1, ball.radius * progress * .7), 0, Math.PI * 2);
      ctx.fill();
    }

    for (const position of positions) {
      const orbiterTrail = getOrbiterTrail(ball, position.orbiter);
      ctx.lineCap = 'round';
      for (let index = orbiterTrail.length - 1; index > 0; index -= 1) {
        const point = orbiterTrail[index];
        const next = orbiterTrail[index - 1];
        const progress = 1 - index / orbiterTrail.length;
        ctx.globalAlpha = .05 + progress * .42;
        ctx.strokeStyle = position.orbiter.visual.trailColor ?? position.orbiter.visual.color;
        ctx.lineWidth = Math.max(1, position.radius * (.2 + progress * .55));
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(next.x, next.y);
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      ctx.shadowColor = position.orbiter.visual.color;
      ctx.shadowBlur = 16 + pulse * 5;
      const satellite = ctx.createRadialGradient(
        position.x - 1,
        position.y - 1,
        0,
        position.x,
        position.y,
        position.radius,
      );
      satellite.addColorStop(0, position.orbiter.visual.coreColor);
      satellite.addColorStop(.38, '#c38cff');
      satellite.addColorStop(1, position.orbiter.visual.color);
      ctx.fillStyle = satellite;
      ctx.beginPath();
      ctx.arc(position.x, position.y, position.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowColor = '#8d4de2';
    ctx.shadowBlur = 20 + pulse * 7;
    const core = ctx.createRadialGradient(
      ball.x - 1.5,
      ball.y - 1.5,
      0,
      ball.x,
      ball.y,
      ball.radius * 1.15,
    );
    core.addColorStop(0, '#020105');
    core.addColorStop(.62, ball.visual.coreColor);
    core.addColorStop(.82, ball.visual.innerColor);
    core.addColorStop(1, ball.visual.color);
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius * 1.15, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 8;
    ctx.strokeStyle = `rgba(222, 192, 255, ${.45 + pulse * .25})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius * (1.48 + pulse * .08), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });

  return registry;
}
