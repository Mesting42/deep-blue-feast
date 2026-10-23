import type { SwimRig } from '../core/types';
import type { FishArt } from './fish';
import { clamp } from '../core/math';
import { fishSpine } from '../systems/fish-rig';

/**
 * 主角沿真实关节中线铺开轮廓、条纹与鱼鳍，不缩放整条鱼来模拟转身。
 * 只有尾鳍的游动摆幅属于表现动画；嘴尖严格取 fishSpine(rig,1)。
 */
export function drawPlayerFish(
  c: CanvasRenderingContext2D,
  art: FishArt,
  x: number,
  y: number,
  size: number,
  rig: SwimRig,
  time: number,
  speed: number,
  alpha: number,
) {
  c.save();
  c.translate(x, y);
  c.scale(size, size);
  c.globalAlpha *= alpha;
  const maturity = art.maturity ?? clamp((art.stage || 0) / 4, 0, 1);
  const deep = art.shape === 'tuna' ? 0.3 : art.shape === 'tang' ? 0.47 : 0.4 + maturity * 0.12;
  const wave = Math.sin(time * (3.4 + speed * 0.032)) * Math.min(0.23, 0.045 + speed * 0.0007);
  const width = (t: number) =>
    Math.max(
      0.012,
      deep * Math.pow(Math.sin(((t + 1) * Math.PI) / 2), 0.8) * (0.76 + (t + 1) * 0.12),
    );
  const outline = (
    points: { x: number; y: number }[],
    fill: string | CanvasGradient,
    stroke = false,
  ) => {
    c.beginPath();
    points.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    if (stroke) {
      c.strokeStyle = '#925e3c66';
      c.lineWidth = 0.012;
      c.stroke();
    }
  };
  // 身体切线的背侧投影在经过竖直方向时平滑收起，不突然把背鳍翻到腹部。
  const finAt = (t: number, length: number, height: number, dorsal: boolean) => {
    const p = fishSpine(rig, t),
      dx = Math.cos(p.angle),
      dy = Math.sin(p.angle);
    const sign = dorsal ? -1 : 1,
      projection = Math.cos(p.angle);
    const nx = -dy * projection * sign,
      ny = dx * projection * sign;
    const root = width(t) * 0.7;
    outline(
      [
        { x: p.x + dx * length * 0.5 + nx * root, y: p.y + dy * length * 0.5 + ny * root },
        {
          x: p.x - dx * length * 0.2 + nx * (root + height),
          y: p.y - dy * length * 0.2 + ny * (root + height),
        },
        { x: p.x - dx * length * 0.8 + nx * root, y: p.y - dy * length * 0.8 + ny * root },
      ],
      art.accent,
    );
  };
  finAt(-0.12, 0.62, deep * (0.55 + maturity * 0.25), true);
  finAt(-0.25, 0.35, deep * 0.35, false);
  const tail = fishSpine(rig, -1);
  c.save();
  c.translate(tail.x, tail.y);
  c.rotate(rig.tailAngle + wave);
  c.beginPath();
  c.moveTo(0.08, 0);
  c.quadraticCurveTo(-0.16, -0.12, -0.55, -0.57);
  c.quadraticCurveTo(-0.59, -0.15, -0.3, 0);
  c.quadraticCurveTo(-0.59, 0.15, -0.55, 0.57);
  c.quadraticCurveTo(-0.16, 0.12, 0.08, 0);
  c.fillStyle = art.accent;
  c.fill();
  c.restore();
  const gradient = c.createLinearGradient(0, -deep, 0, deep);
  gradient.addColorStop(0, art.color);
  gradient.addColorStop(0.55, art.color);
  gradient.addColorStop(1, art.accent);
  const upper: { x: number; y: number }[] = [],
    lower: { x: number; y: number }[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = -1 + i / 20,
      p = fishSpine(rig, t),
      w = width(t);
    const nx = -Math.sin(p.angle),
      ny = Math.cos(p.angle);
    upper.push({ x: p.x - nx * w, y: p.y - ny * w });
    lower.push({ x: p.x + nx * w, y: p.y + ny * w });
  }
  outline([...upper, ...lower.reverse()], gradient, true);
  c.save();
  c.globalAlpha *= 0.6;
  c.strokeStyle = art.accent;
  c.lineWidth = art.shape === 'tuna' ? 0.045 : 0.11;
  c.lineCap = 'round';
  for (const t of [-0.52, -0.13, 0.27]) {
    const p = fishSpine(rig, t),
      w = width(t) * 0.84,
      nx = -Math.sin(p.angle),
      ny = Math.cos(p.angle);
    c.beginPath();
    c.moveTo(p.x - nx * w, p.y - ny * w);
    c.quadraticCurveTo(
      p.x - Math.cos(p.angle) * 0.12,
      p.y - Math.sin(p.angle) * 0.12,
      p.x + nx * w,
      p.y + ny * w,
    );
    c.stroke();
  }
  c.restore();
  // 鳞片顺着弯曲中线分布，保留原有鱼体细节，转身时与肌肉一起跟随。
  c.save();
  c.globalAlpha *= 0.3;
  c.strokeStyle = art.accent;
  c.lineWidth = 0.012;
  for (let i = 0; i < 8; i++) {
    const t = -0.55 + i * 0.13,
      p = fishSpine(rig, t);
    c.save();
    c.translate(p.x, p.y);
    c.rotate(p.angle);
    for (const offset of [-0.09, 0.09]) {
      c.beginPath();
      c.arc(0, offset, 0.075, -0.7, 0.9);
      c.stroke();
    }
    c.restore();
  }
  c.restore();
  const gill = fishSpine(rig, 0.52),
    nx = -Math.sin(gill.angle),
    ny = Math.cos(gill.angle);
  c.strokeStyle = '#526e6266';
  c.lineWidth = 0.024;
  c.beginPath();
  c.moveTo(gill.x - nx * 0.13, gill.y - ny * 0.13);
  c.quadraticCurveTo(
    gill.x - Math.cos(gill.angle) * 0.08,
    gill.y - Math.sin(gill.angle) * 0.08,
    gill.x + nx * 0.14,
    gill.y + ny * 0.14,
  );
  c.stroke();
  finAt(0.13, 0.36, deep * (0.34 + wave), false);
  const eye = fishSpine(rig, 0.77),
    hx = Math.cos(rig.headAngle),
    hy = Math.sin(rig.headAngle);
  const eyeX = eye.x + hy * hx * 0.12,
    eyeY = eye.y - hx * hx * 0.12;
  c.beginPath();
  c.arc(eyeX, eyeY, 0.075, 0, Math.PI * 2);
  c.fillStyle = '#fbf5d9';
  c.fill();
  c.beginPath();
  c.arc(eyeX + hx * 0.016, eyeY + hy * 0.016, 0.035, 0, Math.PI * 2);
  c.fillStyle = '#102e40';
  c.fill();
  c.beginPath();
  c.arc(eyeX + hx * 0.02, eyeY + hy * 0.02 - 0.013, 0.012, 0, Math.PI * 2);
  c.fillStyle = '#fff';
  c.fill();
  const mouth = fishSpine(rig, 1),
    lip = fishSpine(rig, 0.87);
  c.strokeStyle = '#476559';
  c.lineWidth = 0.018;
  c.beginPath();
  c.moveTo(mouth.x, mouth.y);
  c.quadraticCurveTo(lip.x - hy * 0.045, lip.y + hx * 0.045, lip.x, lip.y);
  c.stroke();
  c.restore();
}
