import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game';
import { BY_ID, SPECIES } from '../src/data/catalog';
import { Random, distance } from '../src/core/math';
import { generateWorld, insideRock, makeFish } from '../src/world/generation';
import { mouth, mouthContact, relation } from '../src/systems/predation';
import { validateSave } from '../src/platform/storage';
import { movePlayer } from '../src/systems/movement';
const idle = { x: 0, y: 0, dash: false, skill: false, interact: false };

test('冲刺耗尽后保持按住不会在低体力阈值无限加速，释放后可再次冲刺', () => {
  const g = new Game(),
    p = g.player;
  for (let i = 0; i < 600; i++) movePlayer(p, { ...idle, x: 1, dash: true }, 1 / 60, () => false);
  assert(p.dashLocked);
  assert.equal(p.dashMemory, 0);
  assert(p.vx < 250);
  movePlayer(p, { ...idle, x: 1 }, 1 / 60, () => false);
  assert(!p.dashLocked);
  movePlayer(p, { ...idle, x: 1, dash: true }, 1 / 60, () => false);
  assert(p.dashMemory > 0);
});

test('17 种生物拥有独立配置，普通吞噬资格明确且与标记一致', () => {
  assert.equal(SPECIES.length, 17);
  const f = makeFish(1, 'clown', 200, 100, 0, 0, new Random(1));
  assert.equal(relation(23, f), 'food');
  assert.equal(relation(16, f), 'danger');
  assert.equal(relation(19, f), 'equal');
});
test('鱼嘴连续扫掠能吞噬高速路径上的食物，尾部与背后接触不触发', () => {
  const g = new Game(),
    p = g.player;
  p.x = 150;
  p.y = 100;
  p.angle = 0;
  const f = makeFish(1, 'sprat', 122, 100, 0, 0, new Random(1));
  assert(mouthContact(p, { x: 85, y: 100 }, f));
  f.x = 125;
  assert(!mouthContact(p, mouth(p), f));
});
test('同一猎物只奖励一次，消失后不会重复参与下一帧', () => {
  const g = new Game('journey', 17),
    p = g.player;
  p.x = 600;
  p.y = 1100;
  p.angle = 0;
  const f = makeFish(1, 'sprat', 623, 1100, 0, 0, new Random(1));
  f.stun = 10;
  g.world.fish = [f];
  g.update(1 / 60, idle);
  assert.equal(g.stats.eaten, 1);
  const xp = p.xp;
  for (let i = 0; i < 10; i++) g.update(1 / 60, idle);
  assert.equal(g.stats.eaten, 1);
  assert.equal(p.xp, xp);
});
test('受击保护阻止接触连续扣血，护盾优先吸收且不会把生命抬高', () => {
  const g = new Game();
  g.player.invulnerable = 0;
  g.player.shield = 10;
  g.player.shieldTime = 5;
  g.damage(19, '测试');
  assert.equal(g.player.health, 91);
  assert.equal(g.player.shield, 0);
  g.damage(19, '测试');
  assert.equal(g.player.health, 91);
  assert(g.player.invulnerable > 1);
});
test('暂停冻结技能、鱼群、环境、任务与游戏时钟', () => {
  const g = new Game();
  g.useAbility();
  g.screen = 'paused';
  const before = JSON.stringify(g.save()),
    positions = JSON.stringify(g.world.fish);
  for (let i = 0; i < 600; i++) g.update(1 / 60, { ...idle, x: 1, skill: true });
  assert.equal(JSON.stringify(g.save()), before);
  assert.equal(JSON.stringify(g.world.fish), positions);
  assert.equal(g.player.cooldown, 11);
});
test('200 个地图种子保证主通道、奖励安全与出生周围的安全空间', () => {
  for (let seed = 0; seed < 200; seed++) {
    const w = generateWorld(seed);
    for (let x = 300; x < 12800; x += 80)
      assert(!w.rocks.some((r) => insideRock(x, 1100, r, 80)), `主线受阻 seed=${seed},x=${x}`);
    for (const s of w.sites)
      if (s.kind !== 'current')
        assert(!w.rocks.some((r) => insideRock(s.x, s.y, r, 60)), `奖励在实体中 ${seed} ${s.id}`);
    assert(w.fish.filter((f) => f.region === 0 && f.size <= 18).length >= 20);
    assert(
      w.fish.every(
        (f) =>
          !['hunt', 'ambush', 'elite', 'boss'].includes(BY_ID[f.species].behavior) ||
          distance(f, { x: 330, y: 1100 }) > 650,
      ),
    );
  }
});
test('存档精确恢复非顺序信标、待选进化和安全位置', () => {
  const g = new Game('journey', 42);
  const site = g.world.sites.find((s) => s.id === 'mark-0-2')!;
  site.used = true;
  g.progress[0].marks = 1;
  g.evolutionQueue = 2;
  g.player.x = 3700;
  g.player.health = 4;
  const save = g.save();
  assert(validateSave(save));
  const restored = Game.restore(save);
  assert(restored.world.sites.find((s) => s.id === site.id)?.used);
  assert(!restored.world.sites.find((s) => s.id === 'mark-0-0')?.used);
  assert.equal(restored.player.x, 330);
  assert.equal(restored.player.health, 100);
  assert.equal(restored.evolutionQueue, 2);
  assert(restored.player.invulnerable >= 5);
});
test('缺字段、损坏及未知版本存档均拒绝，正常存档保持有效', () => {
  assert(!validateSave(null));
  assert(!validateSave({ version: 2 }));
  const save = new Game().save();
  assert(validateSave(JSON.parse(JSON.stringify(save))));
  for (const bad of [
    { ...save, region: 6 },
    { ...save, player: { ...save.player, xp: NaN } },
    { ...save, progress: [] },
    { ...save, evolutions: ['invalid'] },
    { ...save, usedSites: ['<script>'] },
  ])
    assert(!validateSave(bad));
});
test('胜负结算只执行一次，结算后输入与伤害停止', () => {
  const g = new Game();
  g.finish(true);
  const score = g.stats.score;
  g.finish(true);
  g.player.invulnerable = 0;
  g.damage(1000, '测试');
  g.update(1 / 60, { ...idle, x: 1 });
  assert.equal(g.stats.score, score);
  assert.equal(g.player.health, 100);
  assert.equal(g.screen, 'victory');
  assert.equal(g.events.filter((e) => e.type === 'end').length, 1);
});
test('四种主动能力均实际生效，冷却禁止连续使用', () => {
  for (const ability of ['surge', 'ink', 'pulse', 'armor'] as const) {
    const g = new Game();
    g.player.ability = ability;
    const f = makeFish(900, 'shark', 450, 1100, 0, 0, new Random(4));
    g.world.fish = [f];
    g.useAbility();
    assert(g.player.cooldown > 0);
    g.useAbility();
    assert.equal(g.stats.skillUses, 1);
    if (ability === 'surge') assert(g.player.surge > 0);
    if (ability === 'ink') assert.equal(g.clouds.length, 1);
    if (ability === 'pulse') assert(f.stun > 0);
    if (ability === 'armor') assert.equal(g.player.shield, 45);
  }
});
