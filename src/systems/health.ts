import type { Player } from '../core/types';
import { BALANCE } from '../data/balance';
/** 伤害保护是全局接触保护：同帧多个碰撞共用一次受击窗口，护盾先扣。 */
export function receiveDamage(p: Player, amount: number) {
  if (p.invulnerable > 0 || amount <= 0) return { blocked: true, absorbed: 0, lost: 0 };
  const absorbed = Math.min(p.shield, amount),
    lost = Math.min(p.health, amount - absorbed);
  p.shield -= absorbed;
  p.health = Math.max(0, p.health - lost);
  p.invulnerable = BALANCE.hurtProtectionSeconds;
  return { blocked: false, absorbed, lost };
}
