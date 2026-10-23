import { BY_ID, STAGES } from '../data/catalog';
import type { Fish, Player, Rock } from '../core/types';
import { angleDelta, clamp, distance, unit } from '../core/math';
import { collide, insideRock } from '../world/generation';
export interface CombatContext {
  player: Player;
  rocks: Rock[];
  enabled: boolean;
  weakBonus: number;
  sound: (name: string) => void;
  tell: (message: string) => void;
  damage: (amount: number, source: string) => void;
}
/**
 * 精英有限侦测与脱战。预警时锁定冲撞方向，冲撞期间不追踪玩家，
 * 留出可预测的躲避窗口。每轮弱点只能咬一次，防止接触帧重复结算。
 */
export function updateChampion(f: Fish, dt: number, c: CombatContext) {
  if (!f.alive) return;
  const boss = BY_ID[f.species].behavior === 'boss',
    p = c.player,
    d = distance(f, p);
  f.stun = Math.max(0, f.stun - dt);
  if (!c.enabled) {
    f.state = 'cruise';
    f.timer = 2;
    f.angle += angleDelta(f.angle, Math.PI) * dt;
    return;
  }
  if (d > 1250) {
    f.state = 'cruise';
    f.timer = 2;
    const n = unit(f.home.x - f.x, f.home.y - f.y);
    f.x += n.x * 45 * dt;
    f.y += n.y * 45 * dt;
    return;
  }
  f.timer -= dt * (f.stun > 0 ? 0.25 : 1);
  const phase2 = boss && f.hits >= 3;
  if (f.state === 'cruise') {
    if (f.species === 'moray') {
      // 巨鳗在两次突进之间沿玩家侧向回旋；速度有限，下一次蓄力仍有完整预警。
      const toward = unit(p.x - f.x, p.y - f.y);
      f.vx = -toward.y * 48;
      f.vy = toward.x * 48;
      f.x += f.vx * dt;
      f.y = clamp(f.y + f.vy * dt, 450, 1750);
      collide(f, c.rocks);
    }
    f.angle += clamp(angleDelta(f.angle, Math.atan2(p.y - f.y, p.x - f.x)), -dt * 0.9, dt * 0.9);
    if (d < 850 && f.timer <= 0) {
      f.attack++;
      const attack = boss ? f.attack % 3 : f.species === 'moray' && f.attack % 3 === 0 ? 1 : 0;
      f.state = 'windup';
      f.timer = phase2 ? 1.65 : 2.1;
      f.target = { x: p.x, y: p.y };
      // 以锁定点表达所有攻击朝向；尾扫与水流将在倒计时结束后切换形态。
      f.vx = attack;
      f.vy = 0;
      f.angle = Math.atan2(p.y - f.y, p.x - f.x);
      c.sound('warning');
      c.tell(
        attack === 1
          ? '尾鳍蓄势：离开橙色环形范围'
          : attack === 2
            ? '水流将至：躲进青色安全缺口'
            : '冲撞蓄势：横向避开橙色轨迹',
      );
    }
  } else if (f.state === 'windup' && f.timer <= 0) {
    const attack = f.vx;
    if (attack === 1) {
      f.state = 'sweep';
      f.timer = 1.5;
    } else if (attack === 2) {
      f.state = 'current';
      f.timer = 3;
    } else {
      f.state = 'charge';
      f.timer = 1.35;
      const n = unit(f.target.x - f.x, f.target.y - f.y);
      f.vx = n.x * (phase2 ? 510 : 450);
      f.vy = n.y * (phase2 ? 510 : 450);
    }
    c.sound('dash');
  } else if (f.state === 'charge') {
    const previous = { x: f.x, y: f.y };
    f.x += f.vx * dt * (f.stun > 0 ? 0.35 : 1);
    f.y += f.vy * dt * (f.stun > 0 ? 0.35 : 1);
    const hit = c.rocks.some((o) => insideRock(f.x, f.y, o, f.size * 0.48));
    collide(f, c.rocks);
    f.y = clamp(f.y, 400, 1800);
    f.x = clamp(f.x, f.home.x - 700, f.home.x + 750);
    if (f.timer <= 0 || hit || distance(previous, f) < dt * 10) expose(f, c, boss && hit ? 6 : 4.5);
  } else if (f.state === 'sweep') {
    if (d < f.size * 2.25 && f.timer < 1.15) c.damage(phase2 ? 30 : 23, '尾部横扫');
    if (f.timer <= 0) expose(f, c, 4.7);
  } else if (f.state === 'current') {
    // 安全缺口始终在预警方向垂直的一侧；进入青色扇区可完整躲过水流。
    const a = Math.atan2(p.y - f.y, p.x - f.x),
      safeAngle = f.angle - Math.PI / 2;
    if (d < 650 && Math.abs(angleDelta(safeAngle, a)) > 0.4) {
      const n = unit(p.x - f.x, p.y - f.y);
      p.vx += n.x * 80 * dt;
      p.vy += n.y * 80 * dt;
      if (f.timer < 2.7) c.damage(16, '深海水流');
    }
    if (f.timer <= 0) expose(f, c, 5.2);
  } else if (f.state === 'weak' && f.timer <= 0) {
    f.state = 'cruise';
    f.timer = 2.6;
  }
  // 仅冲撞/追逐具有身体攻击，弱点和蓄力阶段不会用接触惩罚合理靠近。
  if (f.state === 'charge' && d < p.size * 0.45 + f.size * 0.7)
    c.damage(boss ? 34 : 25, '掠食者冲撞');
}
function expose(f: Fish, c: CombatContext, seconds: number) {
  f.state = 'weak';
  f.timer = seconds + c.weakBonus;
  f.vx = 0;
  f.vy = 0;
  f.biteUsed = false;
  c.sound('weak');
  c.tell('弱点暴露！面向它的头部靠近咬击');
}
export function championRequiredHits(f: Fish) {
  return f.species === 'leviathan' ? 6 : f.species === 'moray' ? 4 : 3;
}
export function championMinimumStage(region: number) {
  return region === 0 ? 1 : region === 1 ? 3 : 4;
}
export function minimumGrowth(region: number) {
  return region === 0 ? STAGES[2].xp : region === 1 ? STAGES[3].xp : STAGES[4].xp;
}
