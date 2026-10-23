import type { Shape, Species } from '../data/catalog';
import type { SwimPose } from '../core/types';
import { drawPlayerFish } from './player-fish';
export interface FishArt {
  shape: Shape;
  color: string;
  accent: string;
  player?: boolean;
  stage?: number;
  /** 主角外形按实际体型连续成熟，不在升级帧突然换一种鱼。 */
  maturity?: number;
}
/**
 * 局部坐标头朝右。普通游鱼使用水平侧身与有限俯仰；特殊掠食者仍按
 * 攻击角度旋转，让冲撞预警与弱点位置一致。姿态由逻辑提供，绘制不改状态。
 */
export function drawFish(
  ctx: CanvasRenderingContext2D,
  art: FishArt,
  x: number,
  y: number,
  size: number,
  angle: number,
  time: number,
  speed = 70,
  alpha = 1,
  pose?: SwimPose,
) {
  if (art.player && pose?.rig) {
    drawPlayerFish(ctx, art, x, y, size, pose.rig, time, speed, alpha);
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(pose ? pose.pitch : angle);
  // 转身中补出正面截面，避免横向压缩到零时整条鱼消失。
  if (pose && Math.abs(pose.facing) < 0.32) {
    ctx.save();
    ctx.globalAlpha *= alpha * (1 - Math.abs(pose.facing) / 0.32);
    ctx.fillStyle = art.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.27, size * (art.player ? 0.4 : 0.3), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (pose) ctx.scale(pose.facing, 1);
  else if (Math.cos(angle) < 0) ctx.scale(1, -1);
  ctx.scale(size, size);
  ctx.globalAlpha *= alpha;
  const wave = Math.sin(time * (3.4 + speed * 0.032)) * Math.min(0.28, 0.06 + speed * 0.001);
  const body = ctx.createLinearGradient(0, -0.65, 0, 0.7);
  body.addColorStop(0, art.color);
  body.addColorStop(0.55, art.color);
  body.addColorStop(1, art.accent);
  const maturity = art.maturity ?? 0;
  const fin = art.accent,
    shape = art.shape;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = 0.018;
  const path = (points: number[], fill: string | CanvasGradient, stroke?: string) => {
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  };
  const curve = (fn: () => void, fill: string | CanvasGradient) => {
    ctx.beginPath();
    fn();
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  if (shape === 'ray') {
    curve(() => {
      ctx.moveTo(0.95, 0);
      ctx.bezierCurveTo(0.35, -0.28, -0.03, -1.13, -0.7, -0.83 - wave);
      ctx.quadraticCurveTo(-0.3, 0, -0.95, 0.1);
      ctx.quadraticCurveTo(-0.4, 0.2, -0.7, 0.85 + wave);
      ctx.bezierCurveTo(0.02, 1.05, 0.4, 0.25, 0.95, 0);
    }, body);
    ctx.beginPath();
    ctx.moveTo(-0.7, 0);
    ctx.quadraticCurveTo(-1.4, wave, -2.15, wave * 2);
    ctx.strokeStyle = art.color;
    ctx.lineWidth = 0.055;
    ctx.stroke();
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.arc(Math.sin(i * 7) * 0.5, Math.cos(i * 4) * 0.55, 0.035, 0, Math.PI * 2);
      ctx.fillStyle = fin;
      ctx.fill();
    }
  } else if (shape === 'jelly') {
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.moveTo(-0.08, (i - 3) * 0.18);
      ctx.bezierCurveTo(
        -0.6,
        (i - 3) * 0.22 + wave,
        -1.05,
        (i - 3) * 0.16 - wave,
        -1.5,
        (i - 3) * 0.17 + wave,
      );
      ctx.strokeStyle = i % 2 ? art.accent : art.color;
      ctx.lineWidth = 0.035;
      ctx.stroke();
    }
    curve(() => {
      ctx.moveTo(0, -0.68);
      ctx.bezierCurveTo(1.3, -0.7, 1.3, 0.7, 0, 0.68);
      ctx.quadraticCurveTo(0.2, 0.35, 0, 0);
      ctx.quadraticCurveTo(0.2, -0.35, 0, -0.68);
    }, body);
    ctx.globalAlpha *= 0.5;
    ctx.beginPath();
    ctx.ellipse(0.45, 0, 0.28, 0.42, 0, 0, Math.PI * 2);
    ctx.fillStyle = art.accent;
    ctx.fill();
    ctx.globalAlpha /= 0.5;
  } else if (shape === 'squid') {
    path([0.75, 0, -0.2, -0.55, -0.6, -0.25, -0.5, 0.25, -0.2, 0.55], fin);
    curve(() => {
      ctx.moveTo(0.85, 0);
      ctx.quadraticCurveTo(0.2, -0.44, -0.55, -0.22);
      ctx.lineTo(-0.55, 0.22);
      ctx.quadraticCurveTo(0.2, 0.44, 0.85, 0);
    }, body);
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(-0.45, (i - 2.5) * 0.065);
      ctx.bezierCurveTo(
        -0.9,
        (i - 2.5) * 0.09,
        -1.1,
        (i - 2.5) * 0.16 + wave,
        -1.6,
        (i - 2.5) * 0.14,
      );
      ctx.strokeStyle = art.color;
      ctx.lineWidth = 0.06;
      ctx.stroke();
    }
  } else if (shape === 'turtle') {
    for (const sign of [-1, 1]) {
      path([0.3, sign * 0.28, 0.16 + wave, sign * 0.95, -0.3, sign * 0.68, -0.36, sign * 0.3], fin);
      path([-0.55, sign * 0.23, -0.8, sign * 0.55, -1.03, sign * 0.32, -0.65, sign * 0.08], fin);
    }
    curve(() => {
      ctx.ellipse(-0.15, 0, 0.7, 0.52, 0, 0, Math.PI * 2);
    }, body);
    ctx.strokeStyle = '#375b57';
    ctx.lineWidth = 0.025;
    ctx.beginPath();
    ctx.ellipse(-0.15, 0, 0.53, 0.38, 0, 0, Math.PI * 2);
    ctx.moveTo(0.2, -0.3);
    ctx.lineTo(-0.15, 0);
    ctx.lineTo(0.18, 0.3);
    ctx.moveTo(-0.5, -0.3);
    ctx.lineTo(-0.15, 0);
    ctx.lineTo(-0.5, 0.3);
    ctx.stroke();
    curve(() => {
      ctx.ellipse(0.66, 0, 0.34, 0.23, 0, 0, Math.PI * 2);
    }, fin);
  } else if (shape === 'eel') {
    curve(() => {
      ctx.moveTo(0.98, -0.08);
      ctx.bezierCurveTo(0.4, -0.47, -0.15, -0.25, -0.55, wave);
      ctx.bezierCurveTo(-1.1, 0.5 + wave, -1.9, -0.5 + wave, -2.4, wave * 0.5);
      ctx.bezierCurveTo(-1.5, 0.12 + wave, -1.3, 0.8, -0.45, 0.37 + wave);
      ctx.bezierCurveTo(0.1, 0.32, 0.6, 0.4, 0.98, 0.1);
    }, body);
    ctx.beginPath();
    ctx.moveTo(0.15, -0.25);
    ctx.bezierCurveTo(-0.8, -0.5, -1.6, 0.1 + wave, -2.3, wave * 0.5);
    ctx.strokeStyle = fin;
    ctx.lineWidth = 0.05;
    ctx.stroke();
  } else if (shape === 'puffer') {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      path(
        [
          Math.cos(a) * 0.72,
          Math.sin(a) * 0.64,
          Math.cos(a + 0.06) * 0.98,
          Math.sin(a + 0.06) * 0.87,
          Math.cos(a + 0.12) * 0.72,
          Math.sin(a + 0.12) * 0.64,
        ],
        fin,
      );
    }
    curve(() => {
      ctx.ellipse(0, 0, 0.84, 0.7, 0, 0, Math.PI * 2);
    }, body);
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      ctx.arc(Math.sin(i * 8) * 0.55, Math.cos(i * 3) * 0.42, 0.047, 0, Math.PI * 2);
      ctx.fillStyle = art.accent;
      ctx.fill();
    }
    path([-0.65, 0, -1.18, -0.25 + wave, -1.14, 0.25 + wave], art.color);
  } else {
    const deep =
      art.maturity !== undefined
        ? 0.4 + maturity * 0.12
        : shape === 'butterfly'
          ? 0.65
          : shape === 'tang'
            ? 0.58
            : shape === 'angel'
              ? 0.7
              : shape === 'leviathan'
                ? 0.49
                : shape === 'shark'
                  ? 0.34
                  : 0.3;
    const tail =
      art.maturity !== undefined
        ? -0.82 - maturity * 0.14
        : shape === 'tuna' || shape === 'shark' || shape === 'leviathan'
          ? -0.96
          : -0.82;
    const bend = (pose?.bend || 0) * 0.24;
    ctx.save();
    ctx.translate(tail, bend);
    ctx.rotate(wave + (pose?.bend || 0) * 0.65);
    curve(() => {
      ctx.moveTo(0.12, 0);
      ctx.quadraticCurveTo(-0.18, -0.12, -0.55, -0.62);
      ctx.quadraticCurveTo(-0.58, -0.1, -0.3, 0);
      ctx.quadraticCurveTo(-0.58, 0.15, -0.52, 0.58);
      ctx.quadraticCurveTo(-0.18, 0.12, 0.12, 0);
    }, fin);
    ctx.restore();
    if (shape === 'angel') {
      path([0.15, -0.4, -0.32, -1.23, -0.65, -0.16], fin);
      path([0.02, 0.4, -0.36, 1.1, -0.7, 0.16], fin);
    } else if (shape === 'shark' || shape === 'leviathan') {
      path([0.0, -0.22, -0.24, -0.9, -0.57, -0.23], art.color);
      path([0.22, 0.23, -0.25, 0.78, -0.45, 0.22], fin);
      if (shape === 'leviathan') {
        path([0.6, -0.25, 0.42, -0.68, 0.12, -0.42], fin);
        path([-0.45, -0.2, -0.66, -0.6, -0.85, -0.12], fin);
      }
    } else {
      curve(() => {
        ctx.moveTo(0.35, -deep * 0.7);
        ctx.quadraticCurveTo(-0.05, -deep * 1.65, -0.63, -deep * 0.5);
        ctx.lineTo(-0.5, 0);
      }, fin);
    }
    curve(() => {
      ctx.moveTo(0.98, 0);
      ctx.bezierCurveTo(0.78, -deep * 0.9, 0.0, -deep * 1.25, tail, -0.1 + bend);
      ctx.quadraticCurveTo(tail - 0.05, bend, tail, 0.1 + bend);
      ctx.bezierCurveTo(0, deep * 1.35, 0.8, deep * 0.85, 0.98, 0);
    }, body);
    // 纹理沿轮廓走向绘制，保留不同鱼种的条带、鳞片和背腹材质。
    ctx.save();
    ctx.globalAlpha *= 0.5;
    if (shape === 'butterfly' || shape === 'tang')
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(0.38 - i * 0.4, -deep * 0.82);
        ctx.quadraticCurveTo(0.05 - i * 0.4, 0, 0.25 - i * 0.4, deep * 0.8);
        ctx.strokeStyle = fin;
        ctx.lineWidth = shape === 'butterfly' ? 0.16 : 0.07;
        ctx.stroke();
      }
    else {
      ctx.beginPath();
      ctx.moveTo(0.68, -0.08);
      ctx.quadraticCurveTo(-0.1, -deep * 0.2, -0.67, -0.02);
      ctx.strokeStyle = fin;
      ctx.lineWidth = 0.035;
      ctx.stroke();
    }
    if (art.player || shape === 'leviathan') {
      for (let i = 0; i < 8; i++)
        for (let j = 0; j < 2; j++) {
          ctx.beginPath();
          ctx.arc(0.4 - i * 0.14, -0.1 + j * 0.16, 0.1, -0.5, 1.3);
          ctx.strokeStyle = fin;
          ctx.lineWidth = 0.012;
          ctx.stroke();
        }
    }
    ctx.restore();
    ctx.save();
    ctx.translate(0.12, 0.1);
    ctx.rotate(wave * 0.6);
    path([0.1, -0.04, -0.38, 0.05, -0.1, deep * 0.78], fin);
    ctx.restore();
    if (art.player) {
      const extension = art.maturity !== undefined ? maturity : (art.stage || 0) / 4;
      path([-0.4, -deep * 0.7, -0.65, -deep * (0.8 + extension * 0.85), -0.12, -deep * 0.95], fin);
    }
  }
  // 眼睛与口部在最终局部坐标绘制，所有鱼嘴都与逻辑前端一致。
  if (shape !== 'jelly') {
    const eyeX = shape === 'eel' ? 0.71 : shape === 'turtle' ? 0.77 : shape === 'ray' ? 0.53 : 0.63;
    const eyeY = shape === 'ray' ? -0.13 : shape === 'turtle' ? -0.06 : -0.13;
    ctx.beginPath();
    ctx.arc(eyeX, eyeY, shape === 'leviathan' ? 0.055 : 0.075, 0, Math.PI * 2);
    ctx.fillStyle = '#fbf5d9';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eyeX + 0.017, eyeY, 0.035, 0, Math.PI * 2);
    ctx.fillStyle = '#102e40';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eyeX + 0.026, eyeY - 0.012, 0.012, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0.97, 0.015);
    ctx.quadraticCurveTo(0.85, 0.08, 0.78, 0.04);
    ctx.strokeStyle = '#2b5861';
    ctx.lineWidth = 0.018;
    ctx.stroke();
    if (!['ray', 'turtle', 'puffer'].includes(shape)) {
      ctx.beginPath();
      ctx.moveTo(0.44, -0.15);
      ctx.quadraticCurveTo(0.33, 0, 0.42, 0.19);
      ctx.strokeStyle = '#305e66';
      ctx.globalAlpha *= 0.45;
      ctx.lineWidth = 0.022;
      ctx.stroke();
    }
  }
  ctx.restore();
}
