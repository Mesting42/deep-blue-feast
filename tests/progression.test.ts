import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game';
import { growthForXP } from '../src/systems/growth';
import { missionPlan } from '../src/systems/missions';
import { makeFish } from '../src/world/generation';
import { Random } from '../src/core/math';
const idle = { x: 0, y: 0, dash: false, skill: false, interact: false };
test('成长连续并在极高收益时封顶，阶段不会超过五个', () => {
  assert(growthForXP(229).size < growthForXP(230).size);
  assert.equal(growthForXP(1e9).size, 148);
  assert.equal(growthForXP(1e9).stage, 4);
});
test('任务组合随种子变化，同时始终保留两个以上的探索目标', () => {
  const variants = new Set<string>();
  for (let seed = 0; seed < 100; seed++) {
    const plan = missionPlan(seed, 0);
    variants.add(JSON.stringify(plan));
    assert(plan.marks >= 2 && plan.marks <= 3);
  }
  assert.equal(variants.size, 3);
});
test('秘藏奖励原子结算，换技能后同一站点不能重复获取收益', () => {
  const game = new Game('journey', 73),
    site = game.world.sites.find((s) => s.kind === 'treasure' && s.region === 0)!;
  game.nearby = site;
  game.interact();
  assert.equal(game.screen, 'event');
  game.resolveEvent('ability', 'armor');
  assert.equal(game.player.ability, 'armor');
  assert(site.used);
  const score = game.stats.score;
  game.resolveEvent('growth');
  assert.equal(game.stats.score, score);
  assert.equal(game.stats.explored, 1);
});
test('全部进化用尽后安全退出三选一，不出现重复卡片或无限待选状态', () => {
  const game = new Game('journey', 73);
  game.evolutionQueue = 20;
  for (let i = 0; i < 25; i++) {
    game.update(1 / 60, idle);
    if (game.screen === 'evolution') game.chooseEvolution(game.evolutionOptions[0]);
  }
  assert.equal(game.evolutions.length, 18);
  assert.equal(new Set(game.evolutions).size, 18);
  assert.equal(game.evolutionQueue, 0);
  assert.equal(game.screen, 'playing');
  assert.equal(game.player.maxHealth, 125);
});
test('大鱼占满附近生态时仍补充可捕食目标，主线不会缺食物', () => {
  const game = new Game('journey', 73);
  game.world.fish = [];
  for (let i = 0; i < 70; i++)
    game.world.fish.push(makeFish(i + 1, 'shark', 1300 + i, 1100, 0, 0, new Random(i)));
  game.nextSpawn = 0;
  game.update(1 / 60, idle);
  assert(game.world.fish.some((f) => f.alive && f.size * 1.2 <= game.player.size));
});
