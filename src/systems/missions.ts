import type { Fish, Mode, Player, RegionProgress, Site } from '../core/types';
import { BY_ID, STAGES } from '../data/catalog';
import { championMinimumStage, minimumGrowth } from './combat';
import { distance } from '../core/math';
export interface MissionContext {
  mode: Mode;
  region: number;
  player: Player;
  progress: RegionProgress[];
  wave: number;
  time: number;
  nextEndless: number;
  seed: number;
}
/** 信标探索与本地鱼群任务按种子组合；第三座信标始终保留为可选成长奖励。 */
export function missionPlan(seed: number, region: number) {
  const variant = ((seed >>> 3) + region * 7) % 3;
  return variant === 0
    ? { marks: 3, food: 0 }
    : { marks: 2, food: variant === 1 ? 24 + region * 8 : 36 + region * 6 };
}
export function explorationComplete(c: MissionContext, region = c.region) {
  const plan = missionPlan(c.seed, region),
    q = c.progress[region];
  return q.marks >= plan.marks && q.eaten >= plan.food;
}
/** 文案与导航都依据同一进度生成，目标鱼会由生态补充，信标不会被生态消耗。 */
export function describeObjective(c: MissionContext) {
  const { mode, region, player: p } = c,
    q = c.progress[region],
    plan = missionPlan(c.seed, region);
  if (mode === 'practice') return '自由练习 · 生命不会耗尽，随时暂停切换鱼体、成长与技能';
  if (mode === 'endless')
    return `潮汐 ${c.wave + 1} · 自由探索与成长，下一次生态变化 ${Math.max(0, Math.ceil(c.nextEndless - c.time))} 秒`;
  if (q.marks < plan.marks)
    return `点亮海洋信标 ${q.marks}/${plan.marks}${plan.food ? ` · 本地鱼群 ${Math.min(q.eaten, plan.food)}/${plan.food}` : ' · 沿青色方向标探索'}`;
  if (q.eaten < plan.food) return `捕食本地鱼群 ${q.eaten}/${plan.food} · 朝向绿色标记的目标靠近`;
  if (p.stage < championMinimumStage(region))
    return `捕食成长至${STAGES[championMinimumStage(region)].name} · ${Math.floor(p.xp)}/${STAGES[championMinimumStage(region)].xp}`;
  if (!q.elite)
    return region === 2
      ? '最终挑战 · 躲避预警，弱点暴露时面向头部咬击（6 次）'
      : `驱离${region === 0 ? '银刃梭王' : '沉船巨鳗'} · 躲开冲撞，咬击橙色头部弱点`;
  if (p.xp < minimumGrowth(region))
    return `捕食成长 · ${Math.floor(p.xp)}/${minimumGrowth(region)}，随后前往海域出口`;
  return '航道已开放 · 前往东侧海流出口，按 F 进入新海域';
}
export function nextObjectiveTarget(c: MissionContext, sites: Site[], fish: Fish[]) {
  const { mode, region, player } = c,
    q = c.progress[region],
    plan = missionPlan(c.seed, region);
  if (mode === 'practice') return null;
  if (q.marks < plan.marks) {
    const next = sites
      .filter((s) => s.region === region && s.kind === 'beacon' && !s.used)
      .sort((a, b) => distance(a, player) - distance(b, player))[0];
    return next ? { ...next, label: '海洋信标' } : null;
  }
  if (
    q.eaten < plan.food ||
    player.stage < championMinimumStage(region) ||
    (q.elite && player.xp < minimumGrowth(region))
  ) {
    const f = fish
      .filter(
        (f) =>
          f.alive &&
          f.region === region &&
          f.size * 1.2 <= player.size &&
          !['poison', 'elite', 'boss'].includes(BY_ID[f.species].behavior),
      )
      .sort((a, b) => distance(a, player) - distance(b, player))[0];
    return f ? { ...f, label: '可捕食鱼群' } : null;
  }
  if (!q.elite) {
    const f = fish.find(
      (f) =>
        f.region === region && f.alive && ['elite', 'boss'].includes(BY_ID[f.species].behavior),
    );
    return f
      ? {
          ...f,
          label:
            player.stage >= championMinimumStage(region)
              ? BY_ID[f.species].name
              : '捕食成长后再挑战',
        }
      : null;
  }
  const next = sites.find((s) => s.region === region && s.kind === 'gate');
  return next ? { ...next, label: '海流出口' } : null;
}
