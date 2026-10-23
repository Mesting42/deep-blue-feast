import { BY_ID } from '../data/catalog';
import type { Cloud, Fish, Player, Rock } from '../core/types';
import { angleDelta, clamp, distance, unit } from '../core/math';
import { collide, lineOfSight, WORLD_HEIGHT } from '../world/generation';
import { updateSwimPose } from './swimming';
export interface EcologyContext {
  player: Player;
  rocks: Rock[];
  clouds: Cloud[];
  time: number;
  has: (id: string) => boolean;
  minX: number;
  maxX: number;
}
/** 邻近鱼使用局部网格做分离与群体对齐，远处鱼只巡游，不执行昂贵追击/视线。 */
export function updateEcology(fishes: Fish[], dt: number, c: EcologyContext) {
  const grid = new Map<string, Fish[]>();
  for (const f of fishes)
    if (f.alive) {
      const key = `${Math.floor(f.x / 180)},${Math.floor(f.y / 180)}`;
      const cell = grid.get(key) || [];
      cell.push(f);
      grid.set(key, cell);
    }
  for (const f of fishes) {
    if (!f.alive) continue;
    const s = BY_ID[f.species];
    if (s.behavior === 'elite' || s.behavior === 'boss') continue;
    f.stun = Math.max(0, f.stun - dt);
    f.timer -= dt;
    const d = distance(f, c.player),
      near = d < 1250;
    let dx = Math.cos(f.phase + c.time * 0.12) * 0.6 + (f.home.x - f.x) * 0.003,
      dy = Math.sin(f.phase + c.time * 0.18) * 0.4 + (f.home.y - f.y) * 0.003;
    const predatory = ['hunt', 'ambush'].includes(s.behavior),
      edible = c.player.size > f.size * 1.1;
    let speed = s.speed;
    const concealed =
      c.clouds.some((q) => distance(q, c.player) < q.radius) ||
      (c.has('kelp') && Math.sin(c.player.x * 0.012) > 0.32 && c.player.y > 1400);
    const detect = (s.behavior === 'ambush' ? 310 : 510) * (concealed ? 0.3 : 1);
    const facing =
      (c.player.x - f.x) * Math.cos(f.angle) + (c.player.y - f.y) * Math.sin(f.angle) > -30;
    if (near && predatory && !edible && d < detect && facing && lineOfSight(f, c.player, c.rocks)) {
      f.state = 'chase';
      f.timer = 3.5;
    }
    if (f.state === 'chase') {
      if (d > 780 || distance(f, f.home) > 850 || concealed || edible || f.timer < 0) {
        f.state = 'cruise';
        f.timer = 2;
      } else {
        dx = c.player.x - f.x;
        dy = c.player.y - f.y;
        speed *= 1.32;
      }
    } else if (near && edible && d < 210 + f.size) {
      f.state = 'flee';
      dx = f.x - c.player.x;
      dy = f.y - c.player.y;
      speed *= s.behavior === 'dart' ? 1.45 : 1.18;
      if (c.has('lure') && d < 110 && f.size < c.player.size * 0.75) {
        dx = -dx;
        dy = -dy;
        speed *= 0.35;
      }
    } else {
      f.state = 'cruise';
      if (f.arrivalTarget) {
        if (distance(f, f.arrivalTarget) < 100) f.arrivalTarget = undefined;
        else {
          dx = f.arrivalTarget.x - f.x;
          dy = f.arrivalTarget.y - f.y;
        }
      }
      // 群游时对齐同伴、靠近群体重心，分离项始终优先，避免重叠成团。
      if (near && s.behavior === 'school') {
        const gx = Math.floor(f.x / 180),
          gy = Math.floor(f.y / 180);
        let cx = 0,
          cy = 0,
          n = 0;
        for (let x = gx - 1; x <= gx + 1; x++)
          for (let y = gy - 1; y <= gy + 1; y++)
            for (const other of grid.get(`${x},${y}`) || []) {
              if (other === f) continue;
              const dd = distance(f, other);
              if (dd < 38 + f.size * 0.5) {
                dx += ((f.x - other.x) / (dd + 1)) * 2;
                dy += ((f.y - other.y) / (dd + 1)) * 2;
              }
              if (other.school === f.school && other.region === f.region && dd < 190) {
                cx += other.x;
                cy += other.y;
                n++;
              }
            }
        if (n) {
          dx += (cx / n - f.x) * 0.009;
          dy += (cy / n - f.y) * 0.009;
        }
      }
    }
    if (near) {
      // 所有弱小鱼也会避开当地的捕食者，距离限制保证生态计算有界。
      for (const hunter of fishes)
        if (
          hunter.alive &&
          hunter.size > f.size * 1.45 &&
          ['hunt', 'ambush', 'elite', 'boss'].includes(BY_ID[hunter.species].behavior)
        ) {
          const hd = distance(f, hunter);
          if (hd < 170) {
            dx += ((f.x - hunter.x) / (hd + 1)) * 2.3;
            dy += ((f.y - hunter.y) / (hd + 1)) * 2.3;
          }
        }
      for (const o of c.rocks) {
        const ox = f.x - o.x,
          oy = f.y - o.y;
        if (Math.abs(ox) < o.rx + 100 && Math.abs(oy) < o.ry + 100) {
          dx += (ox / (o.rx + 50)) * 2;
          dy += (oy / (o.ry + 50)) * 2;
        }
      }
    }
    const n = unit(dx, dy),
      rate = 1 - Math.exp(-dt * 3);
    const stun = f.stun > 0 ? 0.08 : 1;
    f.vx += (n.x * speed * stun - f.vx) * rate;
    f.vy += (n.y * speed * stun - f.vy) * rate;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    if (Math.hypot(f.vx, f.vy) > 5)
      f.angle += clamp(angleDelta(f.angle, Math.atan2(f.vy, f.vx)), -dt * 4, dt * 4);
    f.x = clamp(f.x, c.minX + 150, c.maxX - 200);
    f.y = clamp(f.y, 280, WORLD_HEIGHT - 200);
    collide(f, c.rocks);
    if (f.pose) updateSwimPose(f.pose, f.vx, f.vy, dt);
  }
}
