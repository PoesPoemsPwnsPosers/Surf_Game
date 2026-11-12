# Surf Game: build notes

An arcade surfing game for desktop browsers, built with Three.js, Vite and TypeScript.
Level 1 is Venice Beach. Mavericks and Pipeline come later as separate levels.

## How to run

```
npm install
npm run dev
```

Open the address Vite prints (normally http://localhost:5173). Click **SURF**. The mouse is
captured for looking around; press **Esc** to pause and release it.

Other commands: `npm run build` (type check and production build), `npm run typecheck`.

## Status

| Milestone | State |
| --- | --- |
| 1. Surfing feel | **Built. Waiting for playtest.** |
| 2. Points, combos, on-screen score | Not started |
| 3. Venice Beach world, walking, shop, saving | Not started |
| 4. Stingray boss | Not started |
| 5. Polish: sound, title and controls screens, performance | Not started |

## What is built (milestone 1)

- **Ocean.** A low-poly animated sea. Waves arrive in sets of 3, one set every 20 seconds. Each
  wave rolls in from the horizon as a swell, stands up at the lineup (marked by orange buoys),
  breaks from a peak and peels sideways in both directions, then fades out at the beach.
- **Set timer.** The panel at the top counts down to the next set reaching the lineup, turns
  yellow while a set is rolling in, and lights one pip for each wave of the set.
- **Paddling.** Lie on the board and paddle anywhere in the water. Waves lift you and pass
  underneath if you do not catch them.
- **Pop up.** When a wave face reaches you, "SPACE: POP UP!" appears. Press Space to stand.
  You ride away from the peak unless you hold A or D to pick a side.
- **Riding.** The wave works like a moving half-pipe. Hands off, the board settles into a
  trim line across the face and builds speed. A and D carve up and down the face. Dropping
  down the face gains speed, climbing costs some.
- **Pumping.** Hold Shift for extra thrust and a higher top speed.
- **Jumping.** Carve up the face with speed and the board launches off the lip by itself.
  Space jumps from anywhere, bigger when you are fast and high on the face.
- **Air tricks.** Q and E spin, W and S flip. Let go and the board levels itself toward the
  nearest clean landing angle. The banner names what you landed. No points yet.
- **Wipeouts.** Landing sideways or mid-flip, or sitting in the whitewater at the crest for
  about a second, wipes you out. You tumble, then come back on your board in the same spot.
- **Follow camera.** Free mouse look while paddling. While riding it swings in behind you on
  the beach side of the wave so the face stays in view, pulls back in the air, and widens the
  view at speed.
- **Pause.** Esc pauses and shows the controls.
- **Backdrop.** Sky, sun, clouds, sand, palms, a row of bright boardwalk shopfronts and
  distant hills. Scenery only for now; you cannot walk on it yet.

## Controls (final layout so far)

| Key | In the water | On a wave | In the air |
| --- | --- | --- | --- |
| W | Paddle forward (away from the camera) | Lean in for a little extra speed | Front flip |
| S | Paddle back | Stall (brake) | Back flip |
| A / D | Paddle left / right | Carve left / right | |
| Space | Pop up when a wave reaches you | Jump | |
| Shift | Sprint paddle | Pump for speed | |
| Q / E | | | Spin left / right |
| Mouse | Look around | Nudge the view | Nudge the view |
| Esc | Pause | Pause | Pause |

Not wired up yet: **F** (interact, milestone 3) and **left click** (shoot, milestone 4).

The same list is on the start and pause screens in the game.

## Tuning

Every tuning number is in `src/config.ts`, with a comment on each one. Useful ones for feel:

- `waves.venice`: set interval, waves per set, wave height, speed, face width, peel speed.
- `surf`: `trimAccel`, `pumpAccel`, `maxSpeed`, `pumpMaxSpeed`, `turnRate`, `climbEase`,
  `autoTrim`, `foamGrace`.
- `air`: `gravity`, `lipLaunchBoost`, `maxLaunchSpeed`, `jumpImpulse`, `spinRate`, `flipRate`,
  `spinLandTolerance`, `flipLandTolerance`, `waveMagnet`.
- `camera`: `distance`, `height`, `shoreBias`, `yawFollow`, `mouseSensitivity`.

Vite reloads the page when the file is saved.

## Code layout

```
src/
  config.ts              every tuning number
  main.ts                game loop, wiring, effects
  core/input.ts          keyboard and mouse
  core/level.ts          what a level has to provide
  levels/index.ts        level list; each level is loaded on demand as its own chunk
  levels/venice/         Venice Beach: wave settings, colours, scenery
  ocean/waves.ts         wave sets and the water height function (shared by physics and visuals)
  ocean/oceanMesh.ts     the low-poly sea
  player/surfer.ts       paddling, riding, air, wipeouts
  player/surferModel.ts  the surfer and board (placeholder model)
  camera/followCamera.ts follow camera
  fx/particles.ts        spray
  ui/hud.ts, style.css   on-screen display
```

Adding a beach: create `src/levels/<name>/index.ts` that default-exports a `LevelDefinition`,
add its wave settings to `config.ts`, and add one line to `src/levels/index.ts`.

## Placeholders and known gaps

- **The surfer, board, palms, buildings and buoys are simple shapes built in code**, not asset
  pack models. Nothing was downloaded for milestone 1 so the feel could be tuned first. The
  plan is to swap in CC0 models (Kenney, Quaternius) when the walkable world is built in
  milestone 3. `CREDITS.md` lists what is used.
- **The wave has no hollow tube yet.** It is a smooth steep face with a foam lip. Barrel
  rides need a curling lip, which is planned with barrel scoring in milestone 2.
- **No sound.** That is milestone 5.
- **The player starts in the water** just inside the lineup. Starting on the pier comes with
  the world in milestone 3.
- **Feel was tuned with scripted playtests, not by hand.** Scripts drove the real game in a
  browser (paddle out, pop up, trim, pump, launch off the lip, backflip, 180 spin, a forced
  wipeout, pause and resume) and checked the results and screenshots. The numbers are a
  starting point: steering feel, camera motion and frame rate on a real graphics card have
  not been judged by a person yet.

## What is left

Milestones 2 to 5 in the table above, in that order.
