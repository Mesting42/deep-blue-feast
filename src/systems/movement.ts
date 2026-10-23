import type { InputFrame, Player } from '../core/types';
import { angleDelta, clamp, lerp, unit } from '../core/math';
import { steerPlayerFish, updatePlayerRig } from './fish-rig';
/** 实际小弧线转向与三段鱼体姿态分离，行进角度仍供水流爆发与镜头使用。 */
export function movePlayer(p: Player, input: InputFrame, dt: number, has: (id: string) => boolean) {
  const n = unit(input.x, input.y),
    moving = Math.hypot(input.x, input.y) > 0.1;
  if (p.stamina <= 5) p.dashLocked = true;
  // 耗尽后需要松开并恢复至 25，不能在阈值附近每帧交替恢复/冲刺形成无限加速。
  if (!input.dash && p.stamina >= 25) p.dashLocked = false;
  const dash = input.dash && !p.dashLocked && p.stamina > 4 && moving;
  p.stamina = clamp(p.stamina + (dash ? -34 * (has('fins') ? 0.85 : 1) : 21) * dt, 0, 100);
  if (dash) p.dashMemory = 2;
  else p.dashMemory = Math.max(0, p.dashMemory - dt);
  let speed =
    (205 + Math.min(35, p.size * 0.22)) * (has('fins') ? 1.12 : 1) * (p.escapeBoost > 0 ? 1.25 : 1);
  if (dash) speed *= 1.85;
  if (p.surge > 0) speed *= 2.6;
  const intent = p.surge > 0 ? { x: Math.cos(p.angle), y: Math.sin(p.angle) } : n;
  const steering = steerPlayerFish(p.pose, intent, p.y, dt);
  const direction = p.surge > 0 ? intent : steering.direction;
  const k = 1 - Math.exp(-dt * (steering.turning ? 16 : moving ? 11 : 7.5));
  p.vx = lerp(p.vx, direction.x * speed * steering.speedScale, k);
  p.vy = lerp(p.vy, direction.y * speed * steering.speedScale, k);
  if (moving || p.surge > 0) {
    const target = Math.atan2(direction.y, direction.x);
    p.angle += clamp(angleDelta(p.angle, target), -dt * 8.5, dt * 8.5);
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  updatePlayerRig(p.pose, steering, dt);
}
