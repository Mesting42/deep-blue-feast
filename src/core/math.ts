/** 世界坐标以逻辑像素计；速度为像素/秒，所有持续时间统一为秒。 */
export interface Vec {
  x: number;
  y: number;
}
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
export function unit(x: number, y: number): Vec {
  const n = Math.hypot(x, y);
  return n > 0.001 ? { x: x / n, y: y / n } : { x: 0, y: 0 };
}
export function angleDelta(a: number, b: number) {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}
/** 用固定种子重现整张海域，随机只影响配置而不决定吞噬资格。 */
export class Random {
  constructor(public seed: number) {}
  next() {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) {
    return a + this.next() * (b - a);
  }
  pick<T>(a: readonly T[]): T {
    return a[Math.floor(this.next() * a.length)];
  }
  shuffle<T>(a: readonly T[]): T[] {
    return [...a].sort(() => this.next() - 0.5);
  }
}
/** 点到线段的连续距离，用于高速游动时的鱼嘴扫掠，避免跨帧穿过猎物。 */
export function segmentDistance(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}
