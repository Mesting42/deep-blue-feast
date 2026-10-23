import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FixedStepClock } from '../src/core/clock';
import { Game } from '../src/core/game';
test('60/120/144Hz 渲染下均推进十秒逻辑，游动距离一致', () => {
  const results = [];
  for (const hz of [60, 120, 144]) {
    const clock = new FixedStepClock(),
      game = new Game('practice', 73);
    let ticks = 0;
    for (let i = 0; i < hz * 10; i++)
      clock.advance(1 / hz, true, () => {
        ticks++;
        game.update(clock.stepSeconds, { x: 1, y: 0, dash: false, skill: false, interact: false });
      });
    assert.equal(ticks, 600);
    assert(Math.abs(game.time - 10) < 1e-8);
    results.push(game.player.x);
  }
  assert(Math.max(...results) - Math.min(...results) < 1e-8);
});
test('暂停清除余量，后台长帧只补算有限时间，边沿标记每批仅一次', () => {
  const clock = new FixedStepClock();
  let ticks = 0,
    firsts = 0;
  clock.advance(0.005, true, () => ticks++);
  clock.advance(20, false, () => ticks++);
  assert.equal(ticks, 0);
  clock.advance(20, true, (first) => {
    ticks++;
    if (first) firsts++;
  });
  assert(ticks <= 5);
  assert.equal(firsts, 1);
});
