import type { Rock } from '../core/types';
import { clamp, Random } from '../core/math';
import { insideRock } from '../world/generation';

export interface SpawnView {
  left: number;
  right: number;
}
export interface SpawnRegion {
  x: number;
  width: number;
}

/**
 * 只从可见画面左右之外选点，额外留出整条长鱼与尾鳍的空间。
 * 边界或岩体没有空间时换另一侧，仍无位置则跳过本次补充，绝不把点夹回屏内。
 * 只依赖世界坐标，浏览器传实际镜头范围，引擎测试可提供等价的逻辑视口。
 */
export function findSideEntry(
  view: SpawnView,
  region: SpawnRegion,
  y: number,
  size: number,
  rocks: Rock[],
  rng: Random,
) {
  const preferred = rng.next() > 0.5 ? 1 : -1;
  const margin = 150 + size * 2.6;
  for (const side of [preferred, -preferred]) {
    for (let attempt = 0; attempt < 24; attempt++) {
      const x = (side < 0 ? view.left - margin : view.right + margin) + side * rng.range(0, 180);
      const entryY = clamp(y + rng.range(-400, 400), 520, 1660);
      if (x < region.x + 150 || x > region.x + region.width - 200) continue;
      if (rocks.some((rock) => insideRock(x, entryY, rock, size + 20))) continue;
      return {
        x,
        y: entryY,
        direction: -side,
        target: {
          x: clamp(
            side < 0 ? view.left + 320 : view.right - 320,
            region.x + 250,
            region.x + region.width - 250,
          ),
          y: entryY,
        },
      };
    }
  }
  return null;
}
