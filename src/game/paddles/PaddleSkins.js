import { COLORS } from '../config.js';

export const PADDLE_SKINS = Object.freeze([
  Object.freeze({ id: 'standard', name: '标准能量板' }),
  Object.freeze({ id: 'crystal-wing', name: '晶翼拦截器' }),
  Object.freeze({ id: 'star-crescent', name: '断星月刃' }),
  Object.freeze({ id: 'prism-ark', name: '棱镜方舟' }),
  Object.freeze({ id: 'void-spine', name: '虚空脊刃' }),
]);

function polygon(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index][0], points[index][1]);
  ctx.closePath();
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

export function drawPaddleSkin(ctx, paddle, style = 'standard', { secondary = false } = {}) {
  const { x, y, width, height } = paddle;
  const primary = secondary ? COLORS.violet : COLORS.cyan;
  const dark = secondary ? '#34276f' : '#174c68';
  const accent = secondary ? '#d6c8ff' : '#f1fdff';
  ctx.shadowColor = primary;
  ctx.shadowBlur = secondary ? 12 : 18;

  if (style === 'crystal-wing') {
    const center = x + width / 2;
    ctx.fillStyle = dark;
    polygon(ctx, [[x, y + height], [x + width * .12, y + 2], [center - width * .12, y], [center, y + height * .7], [center + width * .12, y], [x + width * .88, y + 2], [x + width, y + height]]);
    ctx.fill();
    ctx.strokeStyle = primary; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = accent;
    polygon(ctx, [[center, y + 1], [center + 7, y + height / 2], [center, y + height - 1], [center - 7, y + height / 2]]);
    ctx.fill();
    return;
  }

  if (style === 'star-crescent') {
    const gradient = ctx.createLinearGradient(x, y, x + width, y);
    gradient.addColorStop(0, dark); gradient.addColorStop(.5, primary); gradient.addColorStop(1, dark);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(x, y + height * .72);
    ctx.quadraticCurveTo(x + width / 2, y - height * .55, x + width, y + height * .72);
    ctx.quadraticCurveTo(x + width / 2, y + height * 1.25, x, y + height * .72);
    ctx.fill();
    ctx.strokeStyle = accent; ctx.lineWidth = 1.4; ctx.stroke();
    return;
  }

  if (style === 'prism-ark') {
    ctx.fillStyle = dark;
    polygon(ctx, [[x, y + height], [x + 8, y + 2], [x + width * .36, y], [x + width * .44, y + 4], [x + width * .56, y + 4], [x + width * .64, y], [x + width - 8, y + 2], [x + width, y + height]]);
    ctx.fill();
    ctx.strokeStyle = primary; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = accent;
    polygon(ctx, [[x + width / 2, y + 1], [x + width / 2 + 8, y + height / 2], [x + width / 2, y + height - 1], [x + width / 2 - 8, y + height / 2]]);
    ctx.fill();
    return;
  }

  if (style === 'void-spine') {
    const gap = 3;
    const segmentWidth = (width - gap * 4) / 5;
    for (let index = 0; index < 5; index += 1) {
      const offset = index === 2 ? -2 : Math.abs(index - 2) === 1 ? 0 : 2;
      ctx.fillStyle = index === 2 ? accent : index % 2 ? primary : dark;
      roundedRect(ctx, x + index * (segmentWidth + gap), y + offset, segmentWidth, height - offset, 4);
      ctx.fill();
    }
    ctx.strokeStyle = primary; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 4, y + height / 2); ctx.lineTo(x + width - 4, y + height / 2); ctx.stroke();
    return;
  }

  const gradient = ctx.createLinearGradient(x, 0, x + width, 0);
  gradient.addColorStop(0, dark);
  gradient.addColorStop(.15, primary);
  gradient.addColorStop(.85, primary);
  gradient.addColorStop(1, dark);
  ctx.fillStyle = gradient;
  roundedRect(ctx, x, y, width, height, 7);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.72)';
  roundedRect(ctx, x + 12, y + 2, Math.max(1, width - 24), 2, 1);
  ctx.fill();
}
