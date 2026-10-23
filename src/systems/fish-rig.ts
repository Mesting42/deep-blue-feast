import type { SwimPose, SwimRig } from '../core/types';
import { angleDelta, clamp, lerp, type Vec } from '../core/math';

/** 常态俯仰约 32°，掉头期间允许鱼头沿小弧线经过竖直方向。 */
export const MAX_HEAD_PITCH = 0.56;
export const TURN_SECONDS = 0.4;

export function createSwimRig(facing = 1): SwimRig {
  const angle = facing > 0 ? 0 : Math.PI;
  return { headAngle: angle, bodyAngle: angle, tailAngle: angle };
}

export interface SwimSteering {
  direction: Vec;
  headTarget: number;
  turning: boolean;
  speedScale: number;
}

/**
 * 左右反向沿短弧改变实际速度。再次反向时沿当前弧线退回，不排队执行旧掉头。
 * 输入的上下方向决定弧线朝向，靠近上边界时向下绕，避免额外把玩家带入岩壁。
 */
export function steerPlayerFish(pose: SwimPose, intent: Vec, y: number, dt: number): SwimSteering {
  const rig = (pose.rig ??= createSwimRig(pose.targetFacing));
  const moving = Math.hypot(intent.x, intent.y) > 0.1;
  const requested = Math.abs(intent.x) > 0.2 ? Math.sign(intent.x) : pose.targetFacing;
  let turn = rig.turn;
  if (turn && requested === turn.from) {
    [turn.from, turn.to] = [turn.to, turn.from];
    [turn.startYaw, turn.endYaw] = [turn.endYaw, turn.startYaw];
    turn.progress = 1 - turn.progress;
    pose.targetFacing = requested;
  } else if (!turn && requested !== pose.targetFacing) {
    const from = pose.targetFacing;
    const side = Math.abs(intent.y) > 0.15 ? Math.sign(intent.y) : y < 460 ? 1 : -1;
    const base = from > 0 ? 0 : Math.PI;
    const startYaw = rig.headAngle + angleDelta(rig.headAngle, base);
    turn = rig.turn = {
      from,
      to: requested,
      startYaw,
      endYaw: startYaw + from * side * Math.PI,
      progress: 0,
    };
    pose.targetFacing = requested;
  }
  if (turn) {
    turn.progress = Math.min(1, turn.progress + dt / TURN_SECONDS);
    const t = turn.progress * turn.progress * (3 - 2 * turn.progress);
    const yaw = lerp(turn.startYaw, turn.endYaw, t);
    // 水平速度平滑反向；少量垂直分量形成可感知的小弧线，保留上下输入。
    const direction = {
      x: Math.cos(yaw) * Math.max(0.7, Math.abs(intent.x)),
      y: intent.y + Math.sin(yaw) * 0.7 * (1 - Math.abs(intent.y)),
    };
    if (turn.progress >= 1) rig.turn = undefined;
    return {
      direction: moving ? direction : { x: 0, y: 0 },
      headTarget: yaw,
      turning: true,
      speedScale: 1 - Math.sin(Math.PI * turn.progress) * 0.16,
    };
  }
  const pitch = moving
    ? clamp(Math.atan2(intent.y, Math.abs(intent.x) + 0.45), -MAX_HEAD_PITCH, MAX_HEAD_PITCH)
    : 0;
  return {
    direction: intent,
    headTarget: (pose.targetFacing > 0 ? 0 : Math.PI) + pitch * pose.targetFacing,
    turning: false,
    speedScale: 1,
  };
}

/** 鱼头先响应，躯干和尾部依次跟随；停止时沿相同链条柔和舒展。 */
export function updatePlayerRig(pose: SwimPose, steering: SwimSteering, dt: number) {
  const rig = (pose.rig ??= createSwimRig(pose.targetFacing));
  rig.headAngle += angleDelta(rig.headAngle, steering.headTarget) * (1 - Math.exp(-dt * 18));
  rig.bodyAngle += angleDelta(rig.bodyAngle, rig.headAngle) * (1 - Math.exp(-dt * 9));
  rig.tailAngle += angleDelta(rig.tailAngle, rig.bodyAngle) * (1 - Math.exp(-dt * 6));
  pose.facing = Math.cos(rig.bodyAngle);
  const base = pose.targetFacing > 0 ? 0 : Math.PI;
  pose.pitch = angleDelta(base, rig.bodyAngle);
  pose.bend = clamp(angleDelta(rig.tailAngle, rig.headAngle) * 0.6, -1, 1);
}

export interface SpinePoint extends Vec {
  angle: number;
}

/**
 * 归一化鱼体中线：t=-1 是尾柄，0 是身体中心，1 是嘴尖。
 * 两段三次曲线在中心共用身体切线，头尾切线分别取各自关节，转身时形成连续 C 形。
 * 渲染与吞噬都读取此函数，禁止另算一套只用于画面的鱼头偏移。
 */
export function fishSpine(rig: SwimRig, t: number): SpinePoint {
  const head = { x: Math.cos(rig.headAngle), y: Math.sin(rig.headAngle) };
  const body = { x: Math.cos(rig.bodyAngle), y: Math.sin(rig.bodyAngle) };
  const tail = { x: Math.cos(rig.tailAngle), y: Math.sin(rig.tailAngle) };
  const points =
    t >= 0
      ? [
          { x: 0, y: 0 },
          { x: body.x * 0.36, y: body.y * 0.36 },
          { x: body.x * 0.44 + head.x * 0.28, y: body.y * 0.44 + head.y * 0.28 },
          { x: body.x * 0.44 + head.x * 0.52, y: body.y * 0.44 + head.y * 0.52 },
        ]
      : [
          { x: -body.x * 0.22 - tail.x * 0.7, y: -body.y * 0.22 - tail.y * 0.7 },
          { x: -body.x * 0.22 - tail.x * 0.48, y: -body.y * 0.22 - tail.y * 0.48 },
          { x: -body.x * 0.36, y: -body.y * 0.36 },
          { x: 0, y: 0 },
        ];
  const u = t >= 0 ? clamp(t, 0, 1) : clamp(t + 1, 0, 1),
    v = 1 - u;
  const [a, b, c, d] = points;
  const x = v * v * v * a.x + 3 * v * v * u * b.x + 3 * v * u * u * c.x + u * u * u * d.x;
  const y = v * v * v * a.y + 3 * v * v * u * b.y + 3 * v * u * u * c.y + u * u * u * d.y;
  const dx = 3 * v * v * (b.x - a.x) + 6 * v * u * (c.x - b.x) + 3 * u * u * (d.x - c.x);
  const dy = 3 * v * v * (b.y - a.y) + 6 * v * u * (c.y - b.y) + 3 * u * u * (d.y - c.y);
  return { x, y, angle: Math.atan2(dy, dx) };
}
