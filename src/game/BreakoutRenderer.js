import { COLORS, GAME } from './config.js';

export class BreakoutRenderer {
  constructor(scene) { this.scene = scene; }

  render(ctx) {
    this.#background(ctx);
    const { world } = this.scene;
    for (const brick of world.all('brick')) this.#brick(ctx, brick);
    for (const wave of world.all('blast-wave')) this.#blastWave(ctx, wave);
    for (const arc of world.all('lightning-arc')) this.#lightningArc(ctx, arc);
    for (const strike of world.all('lightning-strike')) this.#lightningStrike(ctx, strike);
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

    if (brick.variant === 'boss') {
      const armorPoints = points.map((point) => ({
        x: centerX + (point.x - centerX) * .72,
        y: centerY + (point.y - centerY) * .68,
      }));
      ctx.shadowColor = '#fff0f7';
      ctx.shadowBlur = 18;
      ctx.strokeStyle = 'rgba(255, 240, 247, .82)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([8, 5]);
      this.#polygonPath(ctx, points);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.globalAlpha = .18;
      ctx.fillStyle = brick.color;
      this.#polygonPath(ctx, armorPoints);
      ctx.fill();
      ctx.globalAlpha = .86;
      ctx.strokeStyle = '#ffb1d4';
      ctx.lineWidth = 1.4;
      this.#polygonPath(ctx, armorPoints);
      ctx.stroke();

      ctx.globalAlpha = .58;
      ctx.strokeStyle = '#fff0f7';
      ctx.lineWidth = 1;
      for (let index = 0; index < points.length; index += 2) {
        ctx.beginPath();
        ctx.moveTo(points[index].x, points[index].y);
        ctx.lineTo(armorPoints[index].x, armorPoints[index].y);
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      const coreRadius = Math.min(brick.width, brick.height) * .14;
      const core = ctx.createRadialGradient(
        centerX - coreRadius * .25,
        centerY - coreRadius * .25,
        0,
        centerX,
        centerY,
        coreRadius,
      );
      core.addColorStop(0, '#ffffff');
      core.addColorStop(.28, '#ffb1d4');
      core.addColorStop(1, 'rgba(255, 63, 143, .08)');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(centerX, centerY, coreRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff0f7';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(centerX, centerY, coreRadius * 1.35, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.shadowBlur = 12;
    ctx.fillStyle = brick.color;
    const digits = String(brick.hitPoints).length;
    const baseFontSize = Math.max(13, Math.min(20, brick.height * .4));
    const fontSize = digits <= 2 ? baseFontSize : Math.max(9, baseFontSize * (2.4 / digits));
    ctx.font = `700 ${fontSize}px "Space Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (brick.variant === 'boss') {
      ctx.font = '700 10px "Space Mono", monospace';
      ctx.fillStyle = '#fff0f7';
      ctx.fillText('BOSS', centerX, centerY - 17);
      ctx.font = `700 ${fontSize}px "Space Mono", monospace`;
      ctx.fillStyle = brick.color;
      ctx.fillText(String(brick.hitPoints), centerX, centerY + 9);
    } else {
      ctx.fillText(String(brick.hitPoints), centerX, centerY + 1);
    }
    ctx.restore();
  }

  #paddle(ctx, paddle) {
    ctx.save();
    const isSecondary = paddle.role === 'secondary';
    ctx.globalAlpha = isSecondary ? .8 : 1;
    ctx.shadowColor = isSecondary ? COLORS.violet : COLORS.cyan;
    ctx.shadowBlur = isSecondary ? 12 : 18;
    const gradient = ctx.createLinearGradient(paddle.x, 0, paddle.x + paddle.width, 0);
    const paddleColor = isSecondary ? COLORS.violet : COLORS.cyan;
    gradient.addColorStop(0, isSecondary ? '#41358f' : '#248ba4'); gradient.addColorStop(.15, paddleColor); gradient.addColorStop(.85, paddleColor); gradient.addColorStop(1, isSecondary ? '#41358f' : '#248ba4');
    ctx.fillStyle = gradient;
    this.#roundRect(ctx, paddle.x, paddle.y, paddle.width, paddle.height, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    this.#roundRect(ctx, paddle.x + 12, paddle.y + 2, paddle.width - 24, 2, 1);
    ctx.fill();
    if (!isSecondary) {
      const charge = 1 - Math.max(0, Math.min(1, this.scene.autoFire.timeUntilShot / this.scene.autoFire.interval));
      ctx.fillStyle = 'rgba(85,232,255,.18)';
      ctx.fillRect(paddle.x, paddle.y + paddle.height + 7, paddle.width, 2);
      ctx.fillStyle = COLORS.cyan;
      ctx.fillRect(paddle.x, paddle.y + paddle.height + 7, paddle.width * charge, 2);
    }
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

  #blastWave(ctx, wave) {
    const progress = Math.max(0, Math.min(1, 1 - wave.life / wave.maxLife));
    const eased = 1 - (1 - progress) ** 3;
    const radius = Math.max(2, wave.radius * eased);
    const alpha = (1 - progress) ** 1.4;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * .24;
    const flash = ctx.createRadialGradient(wave.x, wave.y, 0, wave.x, wave.y, radius);
    flash.addColorStop(0, '#fff5ff');
    flash.addColorStop(.16, wave.color);
    flash.addColorStop(.58, wave.secondaryColor);
    flash.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = flash;
    ctx.beginPath();
    ctx.arc(wave.x, wave.y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = alpha;
    ctx.shadowColor = wave.color;
    ctx.shadowBlur = 22;
    ctx.strokeStyle = wave.color;
    ctx.lineWidth = 4 * (1 - progress) + 1;
    ctx.beginPath();
    ctx.arc(wave.x, wave.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = wave.secondaryColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(wave.x, wave.y, radius * .72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  #lightningArc(ctx, arc) {
    if (arc.points.length < 2) return;
    const alpha = Math.max(0, arc.life / arc.maxLife);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass += 1) {
      ctx.globalAlpha = alpha * (pass === 0 ? .3 : .95);
      ctx.shadowColor = arc.color;
      ctx.shadowBlur = pass === 0 ? 18 : 7;
      ctx.strokeStyle = pass === 0 ? arc.color : '#f5fdff';
      ctx.lineWidth = pass === 0 ? 5 : 1.5;
      ctx.beginPath();
      ctx.moveTo(arc.points[0].x, arc.points[0].y);
      for (let index = 1; index < arc.points.length; index += 1) {
        const previous = arc.points[index - 1];
        const point = arc.points[index];
        const middleX = (previous.x + point.x) / 2;
        const middleY = (previous.y + point.y) / 2;
        const bend = index % 2 === 0 ? -7 : 7;
        ctx.lineTo(middleX + bend, middleY - bend);
        ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  #lightningStrike(ctx, strike) {
    const alpha = Math.max(0, strike.life / strike.maxLife);
    const top = Math.max(GAME.playTop, strike.y - 150);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#71dfff';
    ctx.shadowBlur = 20;
    for (let pass = 0; pass < 2; pass += 1) {
      ctx.strokeStyle = pass === 0 ? '#4aa8ff' : '#f4ffff';
      ctx.lineWidth = pass === 0 ? 7 : 2;
      ctx.beginPath();
      ctx.moveTo(strike.x - 8, top);
      ctx.lineTo(strike.x + 9, top + 34);
      ctx.lineTo(strike.x - 11, top + 68);
      ctx.lineTo(strike.x + 7, top + 102);
      ctx.lineTo(strike.x, strike.y);
      ctx.stroke();
    }
    ctx.strokeStyle = strike.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(strike.x, strike.y, 10 + (1 - alpha) * 22, 0, Math.PI * 2);
    ctx.stroke();
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
