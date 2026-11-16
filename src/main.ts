import { Game } from './game/game';

// Start-up only. The game itself is in src/game/game.ts.
const game = new Game(document.getElementById('game') as HTMLCanvasElement);
// A handle for the scripted playtests.
(window as unknown as { __surf: Game }).__surf = game;
game.start('venice').catch((err) => {
  console.error(err);
  const sub = document.getElementById('overlay-sub');
  if (sub) sub.textContent = `Could not start the game: ${err}`;
});
