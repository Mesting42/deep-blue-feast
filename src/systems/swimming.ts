import type { SwimPose } from '../core/types';
import { clamp, lerp } from '../core/math';

/** 最大俯仰约 22°，上下游仍保留水平鱼身；不限制实际二维游动。 */
export const MAX_SWIM_PITCH = 0.38;
export const createSwimPose = (facing = 1): SwimPose => ({
  facing,
  targetFacing: facing,
  pitch: 0,
  bend: 0,
});

/**
 * 用实际速度驱动姿态，避免按键反向后身体先翻面、位置仍向旧方向滑动。
 * 水平速度死区保留垂直游动时的左右朝向；侧身在约 0.32 秒内完成。
 * 尾部比鱼头稍迟恢复，形成转身后的随动，不向渲染层写入游戏状态。
 */
export function updateSwimPose(pose: SwimPose, vx: number, vy: number, dt: number) {
  const speed = Math.hypot(vx, vy);
  if (Math.abs(vx) > Math.max(18, speed * 0.2)) pose.targetFacing = Math.sign(vx);
  const change = clamp(pose.targetFacing - pose.facing, -dt * 6.25, dt * 6.25);
  pose.facing += change;
  const pitch =
    speed > 12
      ? clamp(Math.atan2(vy, Math.abs(vx) + speed * 0.45), -MAX_SWIM_PITCH, MAX_SWIM_PITCH) *
        pose.targetFacing
      : 0;
  pose.pitch = lerp(pose.pitch, pitch, 1 - Math.exp(-dt * 7));
  pose.bend = lerp(pose.bend, (change / Math.max(dt, 0.001)) * 0.075, 1 - Math.exp(-dt * 9));
}

/** 普通鱼轻量姿态的嘴部变换；主角的弯曲嘴尖由 fishSpine 提供。 */
export function poseNose(pose: SwimPose) {
  return { x: Math.cos(pose.pitch) * pose.facing, y: Math.sin(pose.pitch) * pose.facing };
}
