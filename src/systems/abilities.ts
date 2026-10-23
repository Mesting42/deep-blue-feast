import type { Cloud, Fish, Player } from '../core/types';
import { ABILITIES, BY_ID } from '../data/catalog';
import { distance, unit } from '../core/math';
/** 能力只修改有限范围的世界状态，声音与 UI 反馈由调用者处理。 */
export function activateAbility(
  p: Player,
  fish: Fish[],
  clouds: Cloud[],
  has: (id: string) => boolean,
) {
  if (p.cooldown > 0) return false;
  const ability = ABILITIES.find((a) => a.id === p.ability)!;
  p.cooldown = ability.cooldown * (has('control') ? 0.8 : 1);
  const range = has('range') ? 1.35 : 1;
  if (p.ability === 'surge') {
    p.surge = 0.65;
    for (const f of fish)
      if (f.alive && f.size < p.size && distance(f, p) < 180 * range) {
        const n = unit(f.x - p.x, f.y - p.y);
        f.vx = n.x * 220;
        f.vy = n.y * 220;
        f.stun = 0.65;
      }
  } else if (p.ability === 'ink') clouds.push({ x: p.x, y: p.y, radius: 230 * range, life: 6 });
  else if (p.ability === 'pulse')
    for (const f of fish) {
      if (f.alive && distance(f, p) < 260 * range)
        f.stun = ['elite', 'boss'].includes(BY_ID[f.species].behavior) ? 0.8 : 3;
    }
  else {
    p.shield = Math.max(p.shield, has('range') ? 60 : 45);
    p.shieldTime = 7;
  }
  return true;
}
