import { Random, distance } from '../core/math';
import type { Fish, Rock, Site } from '../core/types';
import { BY_ID, REGIONS, SPECIES } from '../data/catalog';
import { createSwimPose } from '../systems/swimming';
export const WORLD_HEIGHT = 2200;
export const WORLD_WIDTH = 13000;
export interface GeneratedWorld {
  rocks: Rock[];
  sites: Site[];
  fish: Fish[];
}
/**
 * 主水道中心线 y=1100，至少保留 640 像素净宽。最大的玩家半高不足 80，
 * 即使成长到上限也能原路返回。随机岩体只出现在上下两侧，不改变主线可达性。
 */
export function generateWorld(seed: number): GeneratedWorld {
  const rng = new Random(seed),
    rocks: Rock[] = [],
    sites: Site[] = [],
    fish: Fish[] = [];
  let uid = 1;
  for (let region = 0; region < 3; region++) {
    const r = REGIONS[region];
    for (let i = 0; i < 24; i++) {
      const x = r.x + 650 + rng.next() * (r.width - 900),
        y = i % 2 ? rng.range(1750, 2140) : rng.range(80, 450);
      rocks.push({
        x,
        y,
        rx: rng.range(90, 230),
        ry: rng.range(90, 190),
        region,
        kind: region === 2 && i % 4 === 0 ? 'pillar' : 'rock',
      });
    }
    // 可选支路的门框地形留出掉头空间，宝藏所在点单独做实体排除。
    if (region === 1) {
      rocks.push({ x: r.x + 1860, y: 340, rx: 330, ry: 90, region, kind: 'wreck' });
      rocks.push({ x: r.x + 2160, y: 640, rx: 180, ry: 110, region, kind: 'rock' });
    }
    if (region === 2) {
      for (const off of [-340, 340])
        rocks.push({ x: r.x + 3350, y: 1100 + off, rx: 90, ry: 175, region, kind: 'pillar' });
    }
    sites.push({
      id: `safe-${region}`,
      region,
      kind: 'safe',
      x: r.x + 330,
      y: 1100,
      used: false,
      variant: 0,
    });
    const positions = [
      { x: 1250, y: 740 },
      { x: 2180, y: 1450 },
      { x: 2870, y: 930 },
    ];
    const swap = rng.next() > 0.5;
    positions.forEach((p, i) =>
      sites.push({
        id: `mark-${region}-${i}`,
        region,
        kind: 'beacon',
        x: r.x + p.x + rng.range(-110, 110),
        y: swap ? 2200 - p.y : p.y,
        used: false,
        variant: i,
      }),
    );
    sites.push({
      id: `treasure-${region}`,
      region,
      kind: 'treasure',
      x: r.x + 1770,
      y: region === 1 ? 570 : 470,
      used: false,
      variant: Math.floor(rng.range(0, 3)),
    });
    sites.push({
      id: `current-${region}`,
      region,
      kind: 'current',
      x: r.x + 2670,
      y: 1570,
      used: false,
      variant: Math.floor(rng.range(0, 4)),
    });
    sites.push({
      id: `gate-${region}`,
      region,
      kind: 'gate',
      x: r.x + r.width - 170,
      y: 1100,
      used: false,
      variant: 0,
    });
    // 实体附近的信标与宝藏移动到最近的安全采样点，绝不把奖励埋进岩体。
    for (const site of sites.filter((s) => s.region === region)) {
      let tries = 0;
      while (rocks.some((o) => insideRock(site.x, site.y, o, 100)) && tries++ < 24) site.y += 50;
      site.y = Math.min(site.y, 1550);
    }
    const pool = SPECIES.filter(
      (s) => s.regions.includes(region) && !['elite', 'boss'].includes(s.behavior),
    );
    for (let school = 0; school < 20; school++) {
      const species = school < 4 ? BY_ID.sprat : school === 4 ? BY_ID.lantern : rng.pick(pool);
      const x =
          r.x +
          rng.range(
            ['hunt', 'ambush'].includes(species.behavior) ? 1500 : school < 4 ? 420 : 600,
            r.width - 500,
          ),
        y = rng.range(580, 1660);
      const count =
        species.behavior === 'school' ? rng.range(5, 9) : species.behavior === 'hunt' ? 1 : 2;
      for (let j = 0; j < count; j++) {
        const point = findOpen(
          rng,
          x + rng.range(-110, 110),
          y + rng.range(-85, 85),
          species.size,
          rocks,
          r.x,
          r.width,
        );
        if (['hunt', 'ambush'].includes(species.behavior) && point.x < r.x + 1350)
          point.x = r.x + 1550;
        fish.push(makeFish(uid++, species.id, point.x, point.y, region, school, rng));
      }
    }
    const eliteId = region === 0 ? 'barracuda' : region === 1 ? 'moray' : 'leviathan';
    fish.push(
      makeFish(
        uid++,
        eliteId,
        r.x + r.width - 920 + rng.range(-180, 140),
        rng.range(890, 1260),
        region,
        99,
        rng,
      ),
    );
  }
  return { rocks, sites, fish };
}
export function makeFish(
  uid: number,
  species: string,
  x: number,
  y: number,
  region: number,
  school: number,
  rng: Random,
): Fish {
  const s = BY_ID[species];
  const angle = rng.next() * Math.PI * 2;
  return {
    uid,
    species,
    x,
    y,
    vx: 0,
    vy: 0,
    angle,
    pose: ['elite', 'boss'].includes(s.behavior)
      ? undefined
      : createSwimPose(Math.cos(angle) >= 0 ? 1 : -1),
    size: s.size,
    home: { x, y },
    school,
    phase: rng.next() * 20,
    alive: true,
    state: 'cruise',
    timer: rng.range(1, 5),
    stun: 0,
    hits: 0,
    attack: 0,
    target: { x, y },
    biteUsed: false,
    region,
  };
}
export function insideRock(x: number, y: number, o: Rock, pad = 0) {
  return ((x - o.x) / (o.rx + pad)) ** 2 + ((y - o.y) / (o.ry + pad)) ** 2 < 1;
}
export function findOpen(
  rng: Random,
  x: number,
  y: number,
  size: number,
  rocks: Rock[],
  rx: number,
  width: number,
) {
  for (let i = 0; i < 30; i++) {
    if (!rocks.some((o) => insideRock(x, y, o, size + 15))) return { x, y };
    x = rx + rng.range(400, width - 400);
    y = rng.range(600, 1600);
  }
  return { x: rx + 400, y: 1100 };
}
/** 椭圆地形按玩家包围圆扩张后将实体推出；鱼嘴吞噬另做视线检查。 */
export function collide(
  body: { x: number; y: number; size: number; vx: number; vy: number },
  rocks: Rock[],
) {
  const radius = body.size * 0.48;
  for (const o of rocks) {
    if (Math.abs(body.x - o.x) > o.rx + body.size || Math.abs(body.y - o.y) > o.ry + body.size)
      continue;
    const rx = o.rx + radius,
      ry = o.ry + radius,
      dx = body.x - o.x,
      dy = body.y - o.y;
    const norm = Math.hypot(dx / rx, dy / ry);
    if (norm < 1) {
      const a = Math.atan2(dy / ry, dx / rx);
      body.x = o.x + Math.cos(a) * (rx + 1);
      body.y = o.y + Math.sin(a) * (ry + 1);
      const nx = Math.cos(a) / rx,
        ny = Math.sin(a) / ry,
        n = Math.hypot(nx, ny),
        dot = (body.vx * nx + body.vy * ny) / n;
      if (dot < 0) {
        body.vx -= (dot * nx) / n;
        body.vy -= (dot * ny) / n;
      }
    }
  }
}
export function lineOfSight(
  a: { x: number; y: number },
  b: { x: number; y: number },
  rocks: Rock[],
) {
  const d = distance(a, b),
    steps = Math.ceil(d / 35);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (rocks.some((o) => insideRock(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, o)))
      return false;
  }
  return true;
}
