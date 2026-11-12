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
| 1. Surfing feel | Built and playtested |
| 1.5. Feel update: boards, wave tricks, flying out the back | Built and playtested |
| 2. Points, combos, on-screen score | **Built. Waiting for playtest.** |
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

## What is built (milestone 1.5, feel update)

Added after the first playtest. The idea: the wave and the board are the launch pad, and most
of the fun happens in the air.

- **Four boards.** Foamie, Fish, Shortboard and Pro Gun. Each tier is faster, pumps harder,
  turns quicker, gets bigger air, forgives rougher landings and looks bigger. You start on the
  Foamie (`startingBoardTier` in `config.ts`). Until the shop exists, number keys **1 to 4**
  swap boards. The board name is shown bottom right.
- **Wave tricks on autopilot.** While the board trims by itself: **Q** cutback, **E** snap,
  **W+Q** hang ten (hold), **S+Q** tail slide (hold), **W+E** floater (hold). Each has its own
  motion and pose and shows a banner. A floater is safe in the whitewater.
- **Flying out the back.** Point the board nearly straight out to sea when it leaves the lip and
  it flies over the back of the wave toward the ocean. A big lip still throws you back onto the
  face: that means the tallest part of the peak, or the pitching section right next to the
  whitewater. A diagonal hit also drops back onto the face, as before.
- **Air control.** A and D steer the flight. Shift+W stretches it and Shift+S shortens it.
  **F** or the right mouse button grabs the rail. Spins and flips are unchanged.
- **Air kick.** Space in the air gives extra height and distance. It costs one charge. You
  start with one, and earn more by landing air tricks, doing wave tricks, and pumping past the
  board's normal top speed. The meter is bottom right.
- **Wave hopping.** A launch out the back can land on the next wave of the set and the ride
  carries on ("WAVE HOP!"). On the slower boards, a flight that would sail past the next wave
  is eased off so it comes down on the face. It is never sped up, and holding Shift turns the
  help off.
- **Guiderails per board** (`guide` in each board's settings, 0 to 1). The Foamie and Fish
  (1) keep the help: airs are pulled back over the face, flights out the back are eased onto
  the next wave, and you only fly out the back from a near-straight take-off over a small lip.
  The Shortboard (0.5) gets half the pull, wider take-off angles, and ignores the big-lip rule.
  The Pro Gun (0) has none: any take-off leaning out to sea flies out the back, nothing pulls
  the flight, and air steering is much stronger. You choose where you land; Shift+S shortens
  the flight to drop onto the next wave.
- **Soft landings.** Coming down on flat water behind the wave is not a wipeout. The board
  coasts to a stop and you are back to paddling, usually in time for the next wave.
- **Flight camera and markers.** When flying out to sea the camera swings in behind the flight
  and looks ahead. There is a shadow under the surfer and a yellow ring where the flight will land.

How the boards compare in scripted playtests (same wave, same inputs):

| Board | Trim speed | Pumped speed | Air time off the lip | Reaches the next wave |
| --- | --- | --- | --- | --- |
| Foamie | 26 mph | 38 mph | about 1.6 s | Only with a pump and an air kick |
| Fish | 32 mph | 46 mph | about 1.7 s | With a pump |
| Shortboard | 38 mph | 56 mph | about 1.9 s | Yes, without pumping |
| Pro Gun | 43 mph | 66 mph | about 2.1 s | Flies past it unless you aim: hold Shift+S for about 0.7 s |

Speeds are along the board; the speed readout in the game also includes the wave carrying you.

## What is built (milestone 2, points)

Two feel changes asked for after the 1.5 playtest came first:

- **Landings keep their momentum.** The board lands going the way it was flying, at the speed it
  was flying, and the hands-off autopilot then carves it back into a trim line over about a
  second. Nothing snaps round any more. Landing against an oncoming face soaks up part of the
  speed (`air.landFaceAbsorb`), which is what keeps wave hops sticking.
- **Tail light trails.** Two glowing red streaks follow the tail of the board and fade over
  about a second, like tail lights in a long-exposure photo. They get brighter with speed and
  float on top of waves that roll through them. Settings are under `trail` in the config.

Points:

- **Cool points.** Every move pops up on the left with its value ("Backflip +100") and goes
  into a combo pot. Every two moves raise the multiplier by one, up to x10. Ending the ride
  cleanly (riding out or to the beach) banks pot times multiplier into the total. A wipeout
  loses the pot and 5% of the banked total (`points.wipeoutPenalty`).
- **What scores** (all in `points` in the config):

| Move | Points |
| --- | --- |
| Riding flat out (pumping past top speed) | 5 every 1.5 s. Adds to the pot, not the multiplier |
| Air of 0.6 s or more | 20 + 10 per second. Big air (6 m or higher) adds 50 |
| Spin | 30 per 180 |
| Flip | 100 each |
| Grab | 25 + 20 per second held |
| Air kick | 10 each |
| Out the back | 30 |
| Wave hop (land on a different wave) | 150 |
| Cutback / Snap | 40 / 50 |
| Hang ten / Tail slide / Floater | 20 / 40 / 60, plus 15 / 10 / 15 per second held |
| Barrel | 40 per second, paid on the way out |

  Repeating the same wave trick in one ride is worth 70% of the last time, down to 25%.
- **Barrels.** Each breaking wave now throws a curling lip over the pocket just ahead of the
  whitewater. Stall with S (or tail slide) to let it catch up, stay under it, and "IN THE
  BARREL" shows while the clock runs. The lip is visual; the rule and the lip share the
  numbers under `barrel` in the config.
- **Whitewater is more forgiving.** It only wipes the board out close to the crest
  (`surf.foamZone`). Lower on the face it can be ridden to the beach, so a ride that the
  whitewater catches still banks. This was needed: before it, the hands-off ride after a
  combo often ended in a foam wipeout that threw the combo away.
- **Fixed:** the cutback was being cancelled before it counted when done at speed.
- **Points per minute, measured.** A scripted "average" player (per ride: one cutback, one
  snap, one jump with a 180, a hang ten every other ride, then riding in; one ride per set, no
  wipeouts) banked about **1,100 points per minute** on the Foamie and about the same on the
  Shortboard, roughly 500 to 600 per ride. So a weapon that should take 5 minutes costs about
  5,500. A player who chains hops, flips and barrels will earn several times that, because the
  multiplier grows with the number of moves; that is worth watching in the playtest before
  shop prices are set.
- Points are not saved yet. Saving comes with the shop in milestone 3.

## Controls (final layout so far)

| Key | In the water | On a wave | In the air |
| --- | --- | --- | --- |
| W | Paddle forward (away from the camera) | Lean in for a little extra speed | Front flip |
| S | Paddle back | Stall (brake). Next to the whitewater this is how to get barrelled | Back flip |
| A / D | Paddle left / right | Carve left / right | Steer the flight |
| Space | Pop up when a wave reaches you | Jump | Air kick (needs a charge) |
| Shift | Sprint paddle | Pump for speed | With W / S: stretch or shorten the flight |
| Q | | Cutback. W+Q hang ten, S+Q tail slide | Spin left |
| E | | Snap. W+E floater | Spin right |
| F or right mouse | | | Grab |
| 1 to 4 | Swap boards (test keys until the shop exists) | same | same |
| Mouse | Look around | Nudge the view | Nudge the view |
| Esc | Pause | Pause | Pause |

Not wired up yet: **F on land** (interact, milestone 3) and **left click** (shoot, milestone 4).
Left click is kept free for shooting, which is why the grab is on F and the right button.

The same list is on the start and pause screens in the game.

## Tuning

Every tuning number is in `src/config.ts`, with a comment on each one. Useful ones for feel:

- `waves.venice`: set interval, waves per set, wave height, speed, face width, peel speed.
- `boards`: one block per board with its speeds, pump, turn rate, `launchPower` (air size),
  landing tolerances, air steering and model size. `startingBoardTier` picks the first board.
- `surf`: `climbEase`, `autoTrim`, `trimLine`, drag and stall numbers shared by all boards.
- `tricks`: timing, angles and speed changes for each wave trick.
- `air`: `gravity`, `lipLaunchBoost`, `jumpImpulse`, `spinRate`, `flipRate`, `waveMagnet`,
  flying out the back (`seawardAim`, `lipOverwhelmHeight`, `pocketWidth`, `seawardFling`,
  `hopAssist`) and the air kick (`kickUp`, `kickForward`, how charges are earned).
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
  fx/trail.ts            tail light trails
  game/score.ts          cool points, combo, multiplier, banking
  ocean/lipMesh.ts       the curling lip over the barrel
  ui/hud.ts, style.css   on-screen display
```

Adding a beach: create `src/levels/<name>/index.ts` that default-exports a `LevelDefinition`,
add its wave settings to `config.ts`, and add one line to `src/levels/index.ts`.

## Placeholders and known gaps

- **The surfer, board, palms, buildings and buoys are simple shapes built in code**, not asset
  pack models. Nothing was downloaded for milestone 1 so the feel could be tuned first. The
  plan is to swap in CC0 models (Kenney, Quaternius) when the walkable world is built in
  milestone 3. `CREDITS.md` lists what is used.
- **The barrel is simple.** The lip is a curved sheet over the pocket and the scoring is a zone
  check. There is no closed tube to see down, and nothing knocks the rider off for touching the lip.
- **No sound.** That is milestone 5.
- **The player starts in the water** just inside the lineup. Starting on the pier comes with
  the world in milestone 3.
- **Feel was tuned with scripted playtests, not by hand.** Scripts drove the real game in a
  browser and checked the results and screenshots. Milestone 1: paddle out, pop up, trim, pump,
  launch off the lip, backflip, 180 spin, a forced wipeout, pause and resume. Milestone 1.5:
  trim, pump and lip launch on all four boards; all five wave tricks; launches out the back
  on every board with and without pumping; a grab; an air kick; steering in the air; wave hops
  and flat-water landings. The numbers are a starting point: how it feels in the hand, camera
  motion and frame rate on a real graphics card have not been judged by a person yet.
- Milestone 2 scripts: a full combo banked at the end of a ride, a wipeout losing the pot, a
  3 second barrel, all five wave tricks scoring, wave hops on the first three boards after the
  landing change, and two 4.5 minute sessions for points per minute. The pop-up fade timing and
  how the trail looks in motion were only seen in still screenshots.
- **Not covered by a script:** the "big lip throws you back" rule right at the peak and in the
  pocket by the whitewater (the scripted launches were all on the open face), Shift+S
  shortening a flight, and the right mouse button for grabs (F was used).
- **Boards and the shop (recommendation for milestone 3):** let boards replace the separate
  Speed and Balance upgrades. A board already carries both, the player can see it grow, and one
  purchase track is easier to price. Keep Health as its own upgrade for the boss fight.

## What is left

Milestones 3 to 5 in the table above, in that order.
