import { Game } from '../src/core/game';
import { JourneyDriver } from './journey-driver';
const game = new Game('journey', Number(process.argv[2] || 73)),
  driver = new JourneyDriver();
let last = 0;
for (let frame = 0; frame < 60 * 2400 && !game.finished; frame++) {
  driver.choose(game);
  game.update(1 / 60, driver.decide(game));
  if (game.time - last > 60) {
    last = game.time;
    console.log(
      JSON.stringify({
        time: Math.round(game.time),
        region: game.region,
        stage: game.player.stage,
        xp: Math.round(game.player.xp),
        hp: Math.round(game.player.health),
        eaten: game.stats.eaten,
        marks: game.progress[game.region].marks,
        champion: game.world.fish
          .filter((f) => f.alive && ['barracuda', 'moray', 'leviathan'].includes(f.species))
          .map((f) => ({
            id: f.species,
            hits: f.hits,
            state: f.state,
            x: Math.round(f.x),
            y: Math.round(f.y),
          })),
        position: { x: Math.round(game.player.x), y: Math.round(game.player.y) },
      }),
    );
  }
}
console.log(
  JSON.stringify({
    result: game.screen,
    time: game.time,
    stats: game.stats,
    progress: game.progress,
    trace: driver.trace,
  }),
);
if (game.screen !== 'victory') process.exitCode = 1;
