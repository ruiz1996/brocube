import { COLORS, GAME } from './config.js';

export class BreakoutRenderer {
  constructor(scene) { this.scene = scene; }

  render(ctx) {
    this.#background(ctx);
    const { world } = this.scene;
    for (const brick of world.all('brick')) this.#brick(ctx, brick);
    for (const particle of world.all('particle')) this.#particle(ctx, particle);
    for (const paddle of world.all('paddle')) this.#paddle(ctx, paddle);
    for (const ball of world.all('ball')) this.#ball(ctx, ball);
  }

  #background(ctx) {
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, GAME.width, GAME.height);
    const glow = ctx.createRadialGradient(GAME.width / 2, 90, 10, GAME.width / 2, 190, 560);
    glow.addColorStop(0, 'rgba(61, 95, 196, .12)');
    glow.addColorStop(1, 'rgba(7, 11, 24, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, GAME.width, GAME.height);
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let x = 0; x <= GAME.width; x += 48) { ctx.beginPath(); ctx.moveTo(x, GAME.playTop); ctx.lineTo(x, GAME.height); ctx.stroke(); }
    for (let y = GAME.playTop; y <= GAME.height; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(GAME.width, y); ctx.stroke(); }
    ctx.fillStyle = 'rgba(104, 131, 189, .18)';
    ctx.fillRect(9, GAME.playTop, 1, GAME.playBottom - GAME.playTop);
    ctx.fillRect(GAME.width - 10, GAME.playTop, 1, GAME.playBottom - GAME.playTop);
    ctx.fillStyle = 'rgba(255, 92, 171, .38)';
    ctx.fillRect(10, GAME.playBottom - 2, GAME.width - 20, 2);
    ctx.fillStyle = 'rgba(255, 92, 171, .62)';
    ctx.font = '700 9px "Space Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('BREACH LINE', GAME.width - 18, GAME.playBottom - 9);
  }

  #brick(ctx, brick) {
    const points = brick.worldPoints();
    const centerX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const centerY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    ctx.save();
    ctx.shadowColor = brick.color;
    ctx.shadowBlur = 10 + brick.hitFlash * 20;

    ctx.globalAlpha = .08 + brick.hitFlash * .12;
    ctx.fillStyle = brick.color;
    this.#polygonPath(ctx, points);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.strokeStyle = brick.color;
    ctx.lineWidth = 2.2 + brick.hitFlash * 1.8;
    ctx.lineJoin = 'round';
    this.#polygonPath(ctx, points);
    ctx.stroke();

    ctx.shadowBlur = 12;
    ctx.fillStyle = brick.color;
    const digits = String(brick.hitPoints).length;
    const baseFontSize = Math.max(13, Math.min(20, brick.height * .4));
    const fontSize = digits <= 2 ? baseFontSize : Math.max(9, baseFontSize * (2.4 / digits));
    ctx.font = `700 ${fontSize}px "Space Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(brick.hitPoints), centerX, centerY + 1);
    ctx.restore();
  }

  #paddle(ctx, paddle) {
    ctx.save();
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 18;
    const gradient = ctx.createLinearGradient(paddle.x, 0, paddle.x + paddle.width, 0);
    gradient.addColorStop(0, '#248ba4'); gradient.addColorStop(.15, COLORS.cyan); gradient.addColorStop(.85, COLORS.cyan); gradient.addColorStop(1, '#248ba4');
    ctx.fillStyle = gradient;
    this.#roundRect(ctx, paddle.x, paddle.y, paddle.width, paddle.height, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    this.#roundRect(ctx, paddle.x + 12, paddle.y + 2, paddle.width - 24, 2, 1);
    ctx.fill();
    const charge = 1 - Math.max(0, Math.min(1, this.scene.autoFire.timeUntilShot / this.scene.autoFire.interval));
    ctx.fillStyle = 'rgba(85,232,255,.18)';
    ctx.fillRect(paddle.x, paddle.y + paddle.height + 7, paddle.width, 2);
    ctx.fillStyle = COLORS.cyan;
    ctx.fillRect(paddle.x, paddle.y + paddle.height + 7, paddle.width * charge, 2);
    ctx.restore();
  }

  #ball(ctx, ball) {
    this.scene.ballRenderers.render(ctx, ball);
  }

  #particle(ctx, particle) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
    ctx.fillStyle = particle.color;
    ctx.shadowColor = particle.color;
    ctx.shadowBlur = 7;
    ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
    ctx.restore();
  }

  #roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + width, y, x + width, y + height, r); ctx.arcTo(x + width, y + height, x, y + height, r); ctx.arcTo(x, y + height, x, y, r); ctx.arcTo(x, y, x + width, y, r); ctx.closePath();
  }

  #polygonPath(ctx, points) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index].x, points[index].y);
    ctx.closePath();
  }
}
