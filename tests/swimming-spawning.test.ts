import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game';
import { Random } from '../src/core/math';
import { MAX_SWIM_PITCH, createSwimPose, updateSwimPose } from '../src/systems/swimming';
import { mouth, mouthContact, relation } from '../src/systems/predation';
import { findSideEntry } from '../src/systems/spawning';
import { growthForXP } from '../src/systems/growth';
import { makeFish } from '../src/world/generation';
import { updateEcology } from '../src/systems/ecology';
const idle = { x: 0, y: 0, dash: false, skill: false, interact: false };

test('大鱼的画外入场位置超过 AI 常规距离时仍持续向画面游入', () => {
  const game = new Game('endless', 73);
  game.region = 2;
  Object.assign(game.player, { x: 10700, xp: 3400, size: 132, stage: 4 });
  game.world.fish = [];
  game.world.rocks = [];
  game.spawnView = { left: 9250, right: 12150 };
  game.nextSpawn = 100;
  game.nextEndless = 0;
  game.wave = 20;
  game.update(1 / 60, idle);
  const far = game.world.fish.find((f) => Math.abs(f.x - game.player.x) > 1800)!;
  assert(far && far.arrivalTarget);
  const before = Math.abs(far.x - far.arrivalTarget.x);
  game.update(1 / 60, idle);
  assert(Math.abs(far.x - far.arrivalTarget.x) < before);
});

test('普通鱼轻量姿态保留左右朝向与有限俯仰，反向平滑经过侧身', () => {
  const pose = createSwimPose();
  for (let i = 0; i < 120; i++) updateSwimPose(pose, 0, -200, 1 / 60);
  assert.equal(pose.facing, 1);
  assert(pose.pitch < -0.37 && pose.pitch >= -MAX_SWIM_PITCH);
  updateSwimPose(pose, -200, 0, 1 / 60);
  assert(pose.facing > 0.8);
  let narrow = false;
  for (let i = 0; i < 30; i++) {
    const before = pose.facing;
    updateSwimPose(pose, -200, 0, 1 / 60);
    assert(Math.abs(pose.facing - before) <= 6.25 / 60 + 1e-9);
    if (Math.abs(pose.facing) < 0.15) narrow = true;
  }
  assert(narrow);
  assert.equal(pose.facing, -1);
  for (let i = 0; i < 120; i++) updateSwimPose(pose, 0, 200, 1 / 60);
  assert.equal(pose.facing, -1);
  assert(pose.pitch < 0); // 左向鱼低头时旋转角为负，头部世界坐标仍向下。
});

test('轻量姿态的鱼嘴跟随侧身和俯仰，反面与最窄瞬间不吞噬', () => {
  const p = new Game().player;
  p.pose = { facing: -1, targetFacing: -1, pitch: -0.3, bend: 0 };
  const m = mouth(p);
  assert(m.x < p.x && m.y > p.y);
  const f = makeFish(1, 'sprat', m.x - 3, m.y, 0, 0, new Random(1));
  assert(mouthContact(p, m, f));
  f.x = p.x + 23;
  assert(!mouthContact(p, m, f));
  p.pose.facing = 0.05;
  f.x = p.x + 2;
  assert(!mouthContact(p, mouth(p), f));
});

test('新局小鱼只吃更小的鱼，捕食后体型逐帧长大且重开完全重置', () => {
  const game = new Game('journey', 73, 4, 'armor');
  const p = game.player;
  assert.equal(p.size, 20);
  assert.equal(p.ability, 'surge');
  assert.equal(p.stage, 0);
  const prey = makeFish(1, 'sprat', p.x + 23, p.y, 0, 0, new Random(1));
  assert.equal(relation(p.size, prey), 'food');
  assert.notEqual(relation(p.size, makeFish(2, 'clown', 0, 0, 0, 0, new Random(2))), 'food');
  prey.stun = 10;
  game.world.fish = [prey];
  game.nextSpawn = 100;
  game.update(1 / 60, idle);
  assert.equal(game.stats.eaten, 1);
  assert(p.xp > 0);
  assert.equal(p.size, 20); // 奖励帧先积累成长，随后平滑增长。
  const target = growthForXP(p.xp).size;
  let previous = p.size;
  for (let i = 0; i < 180; i++) {
    game.update(1 / 60, idle);
    assert(p.size >= previous && p.size <= target);
    previous = p.size;
  }
  assert.equal(p.size, target);
  assert.equal(new Game('journey', 73).player.size, 20);
});

test('多种视口与边界下所有刷新点整条鱼位于左右画外，无空间就跳过', () => {
  const rng = new Random(73);
  for (const size of [12, 70, 172]) {
    for (const view of [
      { left: -600, right: 1500 },
      { left: 900, right: 3200 },
      { left: 2600, right: 4900 },
    ]) {
      for (let i = 0; i < 100; i++) {
        const point = findSideEntry(view, { x: 0, width: 4200 }, 1100, size, [], rng);
        if (!point) continue;
        assert(point.x + size * 2.6 < view.left || point.x - size * 2.6 > view.right);
        assert(point.x >= 150 && point.x <= 4000);
        assert((point.target.x - point.x) * point.direction > 0);
      }
    }
  }
  assert.equal(
    findSideEntry({ left: -100, right: 4500 }, { x: 0, width: 4200 }, 1100, 12, [], rng),
    null,
  );
});

test('普通补鱼与无尽事件共享画外入口，并实际向画内游动', () => {
  const game = new Game('endless', 73);
  game.player.x = 2000;
  game.world.fish = [];
  game.world.rocks = [];
  game.spawnView = { left: 1000, right: 3000 };
  game.nextSpawn = 0;
  game.nextEndless = 0;
  game.update(1 / 60, idle);
  assert(game.world.fish.length >= 9);
  for (const f of game.world.fish) {
    assert(f.x + f.size * 2.6 < 1000 || f.x - f.size * 2.6 > 3000);
    assert(f.arrivalTarget);
    const before = Math.abs(f.x - f.arrivalTarget.x);
    updateEcology([f], 0.04, {
      player: game.player,
      rocks: [],
      clouds: [],
      time: 1,
      has: () => false,
      minX: 0,
      maxX: 13000,
    });
    assert(Math.abs(f.x - f.arrivalTarget.x) < before);
  }
});
