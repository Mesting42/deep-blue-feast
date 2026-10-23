import { BY_ID } from '../data/catalog';
import type { Body, Fish } from '../core/types';
import { segmentDistance } from '../core/math';
import { BALANCE } from '../data/balance';
import { poseNose } from './swimming';
import { fishSpine } from './fish-rig';
export type Relation = 'food' | 'equal' | 'danger' | 'poison' | 'special';
export function relation(playerSize: number, fish: Fish): Relation {
  const s = BY_ID[fish.species];
  if (s.behavior === 'elite' || s.behavior === 'boss') return 'special';
  if (playerSize >= fish.size * BALANCE.edibleRatio)
    return s.behavior === 'poison' ? 'poison' : 'food';
  return fish.size > playerSize * 1.08 ? 'danger' : 'equal';
}
export function mouth(body: Body) {
  if (body.pose?.rig) {
    const tip = fishSpine(body.pose.rig, 1);
    return { x: body.x + tip.x * body.size, y: body.y + tip.y * body.size };
  }
  const nose = body.pose
    ? poseNose(body.pose)
    : { x: Math.cos(body.angle), y: Math.sin(body.angle) };
  const offset = body.pose ? 0.9 : 0.79;
  return {
    x: body.x + nose.x * body.size * offset,
    y: body.y + nose.y * body.size * offset,
  };
}
/**
 * 鱼嘴由前后帧端点构成线段；额外检验目标是否处于朝向前方。
 * alive 在奖励前置为 false，后续所有循环首先跳过死亡对象，保证奖励防重。
 */
export function mouthContact(
  body: Body,
  previousMouth: { x: number; y: number },
  fish: Fish,
  reach = 1,
) {
  const m = mouth(body),
    dx = fish.x - body.x,
    dy = fish.y - body.y;
  // 转身最窄的一瞬不把穿过身后的猎物当成正面吞噬。
  if (body.pose && !body.pose.rig && Math.abs(body.pose.facing) < 0.18) return false;
  if (body.pose?.rig) {
    const forward = { x: Math.cos(body.pose.rig.headAngle), y: Math.sin(body.pose.rig.headAngle) };
    const front = (fish.x - m.x) * forward.x + (fish.y - m.y) * forward.y;
    const previousFront =
      (fish.x - previousMouth.x) * forward.x + (fish.y - previousMouth.y) * forward.y;
    return (
      Math.max(front, previousFront) > -body.size * 0.2 &&
      segmentDistance(fish, previousMouth, m) < body.size * 0.3 * reach + fish.size * 0.54
    );
  }
  const nose = body.pose
    ? poseNose(body.pose)
    : { x: Math.cos(body.angle), y: Math.sin(body.angle) };
  const length = Math.hypot(nose.x, nose.y) || 1;
  const forward = { x: nose.x / length, y: nose.y / length };
  const front = dx * forward.x + dy * forward.y;
  const previousFront =
    (fish.x - previousMouth.x) * forward.x +
    (fish.y - previousMouth.y) * forward.y +
    body.size * (body.pose ? 0.9 * length : 0.79);
  return (
    Math.max(front, previousFront) > body.size * 0.18 &&
    segmentDistance(fish, previousMouth, m) < body.size * 0.3 * reach + fish.size * 0.54
  );
}
