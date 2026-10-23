import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../src/render/renderer';
import { Game } from '../src/core/game';
import { movePlayer } from '../src/systems/movement';
test('最终出口进入镜头时，绘制分支仍成对恢复 Canvas 状态，连续绘制不泄漏栈', () => {
  Object.assign(globalThis, {
    window: { innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1, addEventListener: () => {} },
    Image: class {
      src = '';
      complete = false;
      naturalWidth = 0;
    },
  });
  let depth = 0,
    minDepth = 0;
  const gradient = { addColorStop: () => {} };
  const context = new Proxy(
    {
      globalAlpha: 1,
      save: () => {
        depth++;
      },
      restore: () => {
        depth--;
        minDepth = Math.min(minDepth, depth);
      },
      createLinearGradient: () => gradient,
      createRadialGradient: () => gradient,
      measureText: () => ({ width: 80 }),
    },
    {
      get: (target, key) => (key in target ? target[key as keyof typeof target] : () => {}),
      set: (target, key, value) => {
        (target as Record<PropertyKey, unknown>)[key] = value;
        return true;
      },
    },
  );
  const canvas = {
    style: {},
    width: 0,
    height: 0,
    getContext: () => context,
  } as unknown as HTMLCanvasElement;
  const renderer = new Renderer(canvas),
    game = new Game('practice', 73, 4);
  game.region = 2;
  game.player.x = 12250;
  game.player.y = 1100;
  renderer.setGame(game);
  for (let i = 0; i < 120; i++) {
    movePlayer(
      game.player,
      {
        x: Math.floor(i / 15) % 2 ? -1 : 1,
        y: Math.sin(i / 12),
        dash: false,
        skill: false,
        interact: false,
      },
      1 / 60,
      () => false,
    );
    renderer.render(1 / 60);
    assert.equal(depth, 0);
  }
  assert.equal(minDepth, 0);
});
