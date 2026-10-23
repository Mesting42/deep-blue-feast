import { Game } from '../src/core/game';
import { BY_ID, REGIONS } from '../src/data/catalog';
import { distance, unit } from '../src/core/math';
import { championMinimumStage, minimumGrowth } from '../src/systems/combat';
import { lineOfSight } from '../src/world/generation';
import { missionPlan } from '../src/systems/missions';
import type { Fish, InputFrame } from '../src/core/types';
const clampToWater = (y: number) => (y < 580 ? 200 : -200);
/**
 * 端到端测试驾驶员只观察状态、提供正常移动/冲刺/技能/交互与 UI 选择。
 * 禁止修改玩家成长、生命、敌人血量或直接调用胜利/吞噬方法。
 */
export class JourneyDriver {
  foodUid = 0;
  nextDecision = 0;
  heading = { x: 1, y: 0 };
  trace: string[] = [];
  lastRegion = -1;
  lastStage = -1;
  foodStarted = 0;
  avoidedFood = new Map<number, number>();
  previousEaten = 0;
  lastEatTime = 0;
  roamUntil = 0;
  roamTarget = { x: 0, y: 1100 };
  decide(g: Game): InputFrame {
    const p = g.player,
      q = g.progress[g.region];
    if (g.stats.eaten !== this.previousEaten) {
      this.previousEaten = g.stats.eaten;
      this.lastEatTime = g.time;
    }
    let target: { x: number; y: number } = p;
    if (this.lastRegion !== g.region) {
      this.lastRegion = g.region;
      this.trace.push(`区域 ${g.region + 1} @ ${g.time.toFixed(1)}s`);
    }
    if (this.lastStage !== p.stage) {
      this.lastStage = p.stage;
      this.trace.push(`成长 ${p.stage + 1} @ ${g.time.toFixed(1)}s`);
    }
    const specials = g.world.fish.filter(
      (f) =>
        f.alive && f.region === g.region && ['elite', 'boss'].includes(BY_ID[f.species].behavior),
    );
    const champion = specials[0];
    const required = g.region === 0 ? minimumGrowth(0) : g.region === 1 ? minimumGrowth(1) : 3400;
    const ready = p.xp >= required;
    const safe = g.world.sites.find((s) => s.region === g.region && s.kind === 'safe')!;
    const needHeal = p.health < p.maxHealth * 0.55;
    let interact = false,
      dash = false,
      skill = false,
      aimMouth = false;
    if (needHeal) {
      target = safe;
      if (distance(p, safe) < 110) target = p;
    } else if (!ready) {
      // 长时间追不上同一目标时换猎物，避免简单驾驶员被岩壁另一侧的鱼困住。
      if (this.foodUid && g.time - this.foodStarted > 8) {
        this.avoidedFood.set(this.foodUid, g.time + 30);
        this.foodUid = 0;
      }
      let food = g.world.fish.find(
        (f) =>
          f.uid === this.foodUid &&
          f.alive &&
          f.y > 520 &&
          f.y < 1680 &&
          f.size * 1.2 <= p.size &&
          distance(p, f) < 1300,
      );
      if (!food || g.time > this.nextDecision) {
        const choices = g.world.fish.filter(
          (f) =>
            f.alive &&
            (this.avoidedFood.get(f.uid) ?? 0) <= g.time &&
            f.region === g.region &&
            f.y > 520 &&
            f.y < 1680 &&
            f.size * 1.2 <= p.size &&
            !['poison', 'elite', 'boss'].includes(BY_ID[f.species].behavior) &&
            lineOfSight(p, f, g.world.rocks),
        );
        choices.sort((a, b) => this.foodCost(g, a) - this.foodCost(g, b));
        food = choices[0];
        if (this.foodUid !== (food?.uid || 0)) this.foodStarted = g.time;
        this.foodUid = food?.uid || 0;
        this.nextDecision = g.time + 2;
      }
      if (food) {
        const d = distance(p, food),
          lead = Math.min(0.5, d / 400);
        target = { x: food.x + food.vx * lead, y: food.y + food.vy * lead };
        aimMouth = true;
        dash = d < 250 && d > 45 && p.stamina > 22;
      } else target = { x: p.x < REGIONS[g.region].x + 2000 ? p.x + 400 : p.x - 400, y: 1100 };
    } else if (q.marks < missionPlan(g.seed, g.region).marks) {
      const marks = g.world.sites
        .filter((s) => s.region === g.region && s.kind === 'beacon' && !s.used)
        .sort((a, b) => this.beaconCost(g, a) - this.beaconCost(g, b));
      target = marks[0];
      interact = distance(p, target) < 100;
      dash = p.stamina > 30;
    } else if (!q.elite && champion && p.stage >= championMinimumStage(g.region)) {
      const f = champion,
        head = {
          x: f.x + Math.cos(f.angle) * f.size * 0.72,
          y: f.y + Math.sin(f.angle) * f.size * 0.72,
        };
      if (f.state === 'weak' && !f.biteUsed) {
        target = head;
        aimMouth = true;
        dash = distance(p, head) > 100 && p.stamina > 6;
        skill = p.ability === 'surge' && distance(p, head) < 200;
      } else if (f.state === 'windup' || f.state === 'charge') {
        if (f.state === 'windup' && f.vx === 2)
          target = {
            x: f.x + Math.cos(f.angle - Math.PI / 2) * 420,
            y: f.y + Math.sin(f.angle - Math.PI / 2) * 420,
          };
        else if (f.state === 'windup' && f.vx === 1) {
          const n = unit(p.x - f.x, p.y - f.y);
          target = { x: f.x + n.x * f.size * 3, y: f.y + n.y * f.size * 3 };
        } else {
          const ax = Math.cos(f.angle),
            ay = Math.sin(f.angle),
            sign = (p.x - f.x) * -ay + (p.y - f.y) * ax >= 0 ? 1 : -1;
          target = { x: p.x - ay * sign * 350, y: p.y + ax * sign * 350 };
        }
        dash = p.stamina > 5;
      } else if (f.state === 'current')
        target = {
          x: f.x + Math.cos(f.angle - Math.PI / 2) * 420,
          y: f.y + Math.sin(f.angle - Math.PI / 2) * 420,
        };
      else {
        const n = unit(p.x - f.x, p.y - f.y);
        target = { x: f.x + n.x * 530, y: f.y + n.y * 530 };
      }
      if (p.ability === 'armor' && f.state === 'charge') skill = true;
    } else {
      target = g.world.sites.find((s) => s.region === g.region && s.kind === 'gate')!;
      interact = distance(p, target) < 100;
      dash = p.stamina > 25;
    }
    // 长时间没有捕食时实际游回开阔水道，不在同一条岩壁旁反复追同一批鱼。
    if (!ready && !needHeal && (this.roamUntil > g.time || g.time - this.lastEatTime > 45)) {
      if (this.roamUntil <= g.time) {
        const region = REGIONS[g.region];
        this.roamTarget = {
          x: Math.max(
            region.x + 400,
            Math.min(
              region.x + region.width - 400,
              p.x + (p.x < region.x + region.width - 900 ? 550 : -550),
            ),
          ),
          y: 1100,
        };
        this.roamUntil = g.time + 5;
        this.lastEatTime = g.time;
        this.foodUid = 0;
      }
      target = this.roamTarget;
      aimMouth = false;
      dash = p.stamina > 20;
    }
    // 水平鱼身必须用可见鱼嘴接近猎物，不能仍把鱼身中心当成垂直的嘴。
    if (aimMouth) {
      const facing =
        Math.abs(target.x - p.x) > p.size * 0.85 ? Math.sign(target.x - p.x) : p.pose.targetFacing;
      target = { x: target.x - facing * p.size * 0.72, y: target.y };
    }
    let dx = target.x - p.x,
      dy = target.y - p.y;
    // 普通危险的局部避让。主线留有安全水道，无需篡改位置来穿过地形。
    for (const f of g.world.fish)
      if (
        f.alive &&
        (!ready || needHeal) &&
        !['elite', 'boss'].includes(BY_ID[f.species].behavior) &&
        f.size > p.size * 1.08
      ) {
        const d = distance(p, f),
          range = f.size + p.size + 125;
        if (d < range) {
          const n = unit(p.x - f.x, p.y - f.y);
          dx += n.x * (range - d) * 5;
          dy += n.y * (range - d) * 5;
        }
      }
    // 躲避不能一直退向上下岩壁；离开开放水道时先侧向脱离追击再回中线。
    if (p.y < 580 || p.y > 1680) {
      const hunterNear = g.world.fish.some(
        (f) => f.alive && f.state === 'chase' && distance(p, f) < 400,
      );
      if (hunterNear) {
        dx = p.x > REGIONS[g.region].x + 1000 ? -450 : 450;
        dy = clampToWater(p.y);
        dash = p.stamina > 10;
      } else dy += (p.y < 580 ? 580 - p.y : 1680 - p.y) * 6;
    }
    const n = unit(dx, dy);
    return {
      x: Math.hypot(dx, dy) > 10 ? n.x : 0,
      y: Math.hypot(dx, dy) > 10 ? n.y : 0,
      dash,
      skill,
      interact,
    };
  }
  foodCost(g: Game, f: Fish) {
    const d = distance(g.player, f);
    const danger = g.world.fish.some(
      (h) =>
        h.alive &&
        h.size > g.player.size * 1.15 &&
        ['hunt', 'elite', 'ambush'].includes(BY_ID[h.species].behavior) &&
        distance(h, f) < 220,
    );
    return d / Math.pow(BY_ID[f.species].food, 0.25) + (danger ? 700 : 0);
  }
  /** 被追击者守住的信标先绕开，避免单纯排斥力让驾驶员在目标前原地打转。 */
  beaconCost(g: Game, site: { x: number; y: number }) {
    const guarded = g.world.fish.some(
      (f) =>
        f.alive &&
        f.size > g.player.size * 1.08 &&
        ['hunt', 'ambush'].includes(BY_ID[f.species].behavior) &&
        distance(f, site) < 350,
    );
    return distance(g.player, site) + (guarded ? 1600 : 0);
  }
  choose(g: Game) {
    if (g.screen === 'evolution') {
      const priority = [
        'fins',
        'reach',
        'vital',
        'stamina',
        'precision',
        'dashbite',
        'chain',
        'laststand',
        'weak',
        'escape',
      ];
      const id = [...g.evolutionOptions].sort(
        (a, b) =>
          (priority.indexOf(a) < 0 ? 30 : priority.indexOf(a)) -
          (priority.indexOf(b) < 0 ? 30 : priority.indexOf(b)),
      )[0];
      g.chooseEvolution(id);
    }
    if (g.screen === 'event') g.resolveEvent('growth');
  }
}
