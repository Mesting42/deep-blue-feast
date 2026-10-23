import { STAGES } from '../data/catalog';
import { BALANCE } from '../data/balance';
import { clamp, lerp } from '../core/math';
/** 阶段之间连续变大，最终阶段以对数增长并封顶，避免地图被无限体型破坏。 */
export function growthForXP(xp: number) {
  const stage = STAGES.reduce((n, s, i) => (xp >= s.xp ? i : n), 0),
    a = STAGES[stage],
    b = STAGES[stage + 1];
  const size = b
    ? lerp(a.size, b.size, clamp((xp - a.xp) / (b.xp - a.xp), 0, 1))
    : Math.min(BALANCE.maxPlayerSize, a.size + Math.log2(1 + (xp - a.xp) / 500) * 4);
  return { stage, size };
}
export function foodGrowth(
  base: number,
  dashMemory: number,
  chain: number,
  has: (id: string) => boolean,
) {
  return (
    base *
    BALANCE.foodGrowthScale *
    (has('dashbite') && dashMemory > 0 ? 1.3 : 1) *
    (has('chain') ? 1 + Math.min(4, chain) * 0.12 : 1)
  );
}
