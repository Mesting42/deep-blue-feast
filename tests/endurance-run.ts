import assert from 'node:assert/strict';
import { Game } from '../src/core/game';
const game = new Game('endless', 73),
  start = performance.now();
let maxPopulation = 0;
const input = { x: 0, y: 0, dash: false, skill: false, interact: false };
// 停留在初始安全水域，正常运行 30 分钟逻辑时间，验证事件生成与数量上限。
// 此测试不代表 30 分钟浏览器帧率或真实设备散热测试。
for (let i = 0; i < 45001; i++) {
  if (game.screen === 'evolution') game.chooseEvolution(game.evolutionOptions[0]);
  game.update(0.04, input);
  maxPopulation = Math.max(maxPopulation, game.world.fish.length);
  assert(game.world.fish.every((f) => Number.isFinite(f.x) && Number.isFinite(f.y)));
  assert(Number.isFinite(game.player.size) && game.player.size <= 148);
  if (game.finished) throw new Error(`安全区耐久测试提前结束：${game.time.toFixed(2)}s`);
}
assert(game.time >= 1800);
assert(game.world.fish.length < 380);
console.log(
  JSON.stringify({
    passed: true,
    simulatedMinutes: game.time / 60,
    waves: game.wave,
    aliveFish: game.world.fish.filter((f) => f.alive).length,
    maxPopulation,
    playerHealth: game.player.health,
    wallSeconds: (performance.now() - start) / 1000,
  }),
);
