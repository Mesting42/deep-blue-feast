import './style.css';
import { Renderer } from './render/renderer';
import { Input } from './platform/input';
import { Audio } from './platform/audio';
import { Storage } from './platform/storage';
import { initOffline } from './platform/offline';
import { UI } from './ui/ui';
import type { Game } from './core/game';
import { FixedStepClock } from './core/clock';
import type { InputFrame } from './core/types';
const canvas = document.getElementById('ocean') as HTMLCanvasElement;
const renderer = new Renderer(canvas),
  input = new Input(),
  audio = new Audio(),
  storage = new Storage();
const ui = new UI(document.getElementById('app')!, storage, input, audio, renderer);
let game: Game | null = null,
  last = performance.now();
const clock = new FixedStepClock();
// Match control visibility: an iframe width cannot identify a touch device.
const touchPointer = matchMedia('(pointer: coarse)');
const portraitTouch = () => touchPointer.matches && innerHeight > innerWidth;
ui.onGame = (g) => {
  game = g;
  renderer.setGame(g);
  clock.reset();
};
/** 固定 60Hz 逻辑步长，渲染独立；大卡顿不补算整段后台时间。 */
function frame(now: number) {
  const elapsed = Math.min(0.08, (now - last) / 1000);
  last = now;
  const portrait = portraitTouch();
  if (portrait && game?.screen === 'playing') ui.pause(true);
  let controls: InputFrame | null = null;
  if (game) game.spawnView = renderer.spawnBounds();
  clock.advance(elapsed, !!game && game.screen === 'playing', (first) => {
    if (first) controls = input.frame(renderer.toScreen(game!.player.x, game!.player.y));
    game!.update(clock.stepSeconds, {
      ...controls!,
      skill: first && controls!.skill,
      interact: first && controls!.interact,
    });
  });
  renderer.render(elapsed);
  ui.update(elapsed);
  audio.update(
    game?.region || 0,
    !document.hidden && (!game || game.screen === 'playing'),
    game ? Math.hypot(game.player.vx, game.player.vy) : 0,
  );
  requestAnimationFrame(frame);
}
window.addEventListener('blur', () => ui.pause(true));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    ui.pause(true);
    if (game?.mode === 'journey' && !game.finished) storage.save(game.save());
  }
  audio.background(document.hidden);
  last = performance.now();
  clock.reset();
});
window.addEventListener('resize', () => {
  if (portraitTouch()) ui.pause(true);
});
requestAnimationFrame(frame);
// 生产构建预缓存全部本地资源；开发模式不注册，避免热更新被旧缓存干扰。
if (import.meta.env.PROD) initOffline();
/**
 * 只读诊断快照供测试和交接定位问题，不暴露写入状态或跳关接口。
 * 实际操控必须经过键盘/触屏，自动化不能用它直接加成长或调用结算。
 */
Object.defineProperty(window, 'deepBlueSnapshot', {
  get: () =>
    game
      ? structuredClone({
          screen: game.screen,
          mode: game.mode,
          time: game.time,
          region: game.region,
          player: game.player,
          progress: game.progress,
          stats: game.stats,
          evolutions: game.evolutions,
          objective: game.objective(),
          target: game.objectiveTarget(),
          nearby: game.nearby,
          fish: game.world.fish
            .filter((f) => f.alive && Math.hypot(f.x - game!.player.x, f.y - game!.player.y) < 1000)
            .map((f) => ({
              uid: f.uid,
              species: f.species,
              x: f.x,
              y: f.y,
              size: f.size,
              angle: f.angle,
              state: f.state,
              timer: f.timer,
              hits: f.hits,
            })),
          viewport: { width: innerWidth, height: innerHeight },
          camera: renderer.camera,
        })
      : { screen: 'menu' },
});
