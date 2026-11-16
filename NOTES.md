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
| 2. Points, combos, on-screen score | Built and playtested |
| 3. Venice Beach world, walking, shop, saving | Built and playtested |
| 3.5. Air update: tricks on the arrow keys, booster, faster drop-ins | **Built. Waiting for playtest.** |
| 4. Stingray boss | **Built. Waiting for playtest.** |
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
- **Air control.** A and D steer the flight. (Shift+W and Shift+S used to stretch and shorten it; see the air update below for the booster and air brake that replaced them.)
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

### Changes after the milestone 2 playtest

- **Tail lights are subtle now.** They are almost invisible at cruising speed and only light up
  fully well past the board's pumped top speed, so mostly on big launches and air kicks
  (`trail.startFraction`, `trail.fullFraction`).
- **Landings skim.** A landing keeps all of its speed, and for 3 seconds afterwards flat-water
  drag is cut to 12%, easing back (`air.landGlideTime`, `air.landGlideDrag`). Landing against an
  oncoming face still costs speed, and climbing a slope still slows the board.
- **The barrel is a real curl.** The lip is now an arch that rises off the crest, goes over the
  face and hangs down in front, with ribs and a ragged falling edge. It is slightly see-through
  so the rider stays visible.
- **No jumping through the barrel.** Jumping or launching while the lip is overhead is a
  wipeout ("HIT THE LIP!"). Everywhere else on the wave jumps work as before.
- **Waves vary.** Each wave is up to 10% bigger or smaller, and has three taller bowl sections
  at random spots along it. Bowls glow a sunlit green. On a bowl the board accelerates harder
  and its top speed rises with the extra height (`surf.bowlSpeed`), so hunting for bowls is how
  to build speed for a big launch. Settings are with the wave tuning (`bowlGain`, `bowlWidth`...).
- **More wave detail.** Finer sea mesh, ribs down the wave faces, colour streaks, and a ragged
  edge on the whitewater. Sea plus lip update costs about 5 ms a frame on the test machine's CPU.
- Scripts re-run after these changes: out-the-back launches and wave hops on all four boards,
  the barrel (3 s), a jump inside the barrel (wipes out), the five wave tricks, the banked combo,
  and the points-per-minute session (still about 1,100 on the Foamie).

## What is built (milestone 3, world, shop, saving)

First, one more change from the playtest:

- **The lip is solid on top.** The lip's shape now lives in one file (`ocean/lip.ts`) that both
  the picture and the physics use. Come at it from the crest (a floater, W+E, is the easy way)
  or land on it from the air and the board rides along the top of the arch ("ON THE LIP",
  30 points a second). Running off the end of it is a launch. From underneath it is still the
  barrel, and jumping up into it is still a wipeout.

The world:

- **You start on Venice Pier**, standing next to the surf shop, with the board under your arm.
- **Walking.** WASD walks, Shift runs, Space hops. You can walk the pier, down its ramp to the
  boardwalk, across the sand and under the pier.
- **Getting in the water.** Jump or walk off the pier (the sea end has no railing) and you
  splash in and start paddling. Or wade in from the beach. Paddle or ride into the shallows and
  the surfer stands up and walks. A ride that reaches the beach ends on the sand.
- **Scenery.** The pier with pilings, railings and lamps, the shop hut with its sign and a
  yellow mat in front of the counter, a boardwalk strip with benches, and three lifeguard
  towers. All simple shapes (see `CREDITS.md`).

The shop (stand on the yellow mat, press F; the game pauses while it is open):

| Item | Price | What it does |
| --- | --- | --- |
| Foamie | free | The starter board |
| Fish | 1,500 | |
| Shortboard | 4,000 | |
| Pro Gun | 8,000 | |
| Extra heart, 3 levels | 1,000 / 2,500 / 4,500 | 3 hearts to start, up to 6. For the boss fight |
| Super Squirter | 5,000 | 6 shots a second, 1 damage each |
| Coconut Cannon | 6,000 | 1 shot a second, 9 damage |
| Trident Launcher | 7,000 | 3 shots in a spread, 2.5 times a second, 1.4 damage each |
| Booster I / II / III | 2,000 / 5,000 / 9,000 | Hold Shift in the air: 0.9 / 1.5 / 2.4 s of thrust. Refills on touching down |
| Stingray Showdown | 12,000 | The boss fight. Bought once; after that the row is a Fight! button, as often as you like |

- **Boards replace the Speed and Balance upgrades**, as recommended after milestone 1.5: each
  board is faster and more forgiving than the last. Health stays as its own upgrade. Owned
  boards and weapons can be switched in the shop for free.
- Prices are in `shop` in the config. At the measured 1,100 points a minute a weapon is about
  5 minutes, and everything in the shop is about 45 minutes of modest play.
- **Saving.** Points, boards, hearts, weapons and the boss ticket are saved in the browser
  (`localStorage`) every time the banked total changes or something is bought. "Reset progress"
  at the bottom of the shop wipes it (two clicks). If the browser blocks storage the game still
  runs and the shop says so.
- The 1 to 4 board keys are now off. `debug.boardKeys` in the config turns them back on, and
  `debug.startPoints` gives a new save some points to test the shop with.

### Modularity review

What was wrong and what changed:

- `main.ts` had grown to 350 lines doing six jobs. It is now 10 lines of start-up. The loop and
  the modes (start, playing, paused, shop) are in `game/game.ts`; spray, the light trail and the
  flight markers moved to `fx/surfEffects.ts`.
- The lip's shape was written twice (once to draw it, once for the barrel rule). It is now one
  description in `ocean/lip.ts`.
- Each new feature went in as its own part with one job, and none of them reach into another's
  insides: `game/save.ts` (reading and writing the save), `game/shop.ts` (the shop's rules, no
  screen code), `ui/shopPanel.ts` (the shop screen, no rules), `player/walker.ts` (walking, knows
  nothing about surfing), `levels/venice/layout.ts` (where things are; scenery and walking rules
  both read it), `levels/venice/pier.ts` (pier scenery).
- A level now provides its own land (`LandMap` in `core/level.ts`), so Mavericks and Pipeline can
  have different beaches without touching the player code.
- The camera no longer needs the wave system, only a "how low can I go here" function.
- **Still too big:** `player/surfer.ts` is about 1,050 lines holding paddling, riding, flying and
  wiping out. They share a lot of state (speed, heading, the wave being ridden), so splitting
  them is a bigger job with more risk to the feel. The natural cut is one file per state
  (ride, air, paddle) behind the same `Surfer` class. Worth doing before the boss fight adds
  shooting, if you want it.
- **Also noted:** `ui/hud.ts` builds its hint text from the surfer's state with a switch; fine at
  this size, but the boss fight's health bar should be its own small class, not more of the HUD.

## What is built (milestone 3.5, air update)

Changes asked for after the milestone 3 playtest. Numbers are in `air`, `surf`, `booster` and
`keys` in `src/config.ts`.

- **Spins and flips are on the arrow keys.** Left and right spin, up and down flip. W, S, Q and
  E no longer do tricks in the air, so steering (A / D) and tricks do not fight each other.
- **Booster.** The old Shift+W stretch is now something you buy. Three levels in the shop.
  Hold Shift in the air for thrust along the flight and some lift; the tank refills the moment
  the board touches water or land. A bar next to the air kicks shows what is left. The light
  trail burns at full strength while boosting. Scripted flights off the same wave: no booster
  26 m, Booster I 57 m, Booster III 115 m.
- **S is an air brake**, to drop short on purpose.
- **Dropping back in is fast.** Riding down the face gives extra drive (`surf.dropBoost`), more
  again for the first seconds after a landing (`surf.landDropBoost`), and the speed limit is
  lifted for a moment after landing (`surf.landTopSpeed`), so a landing flows into the next launch.

## What is built (milestone 4, the Stingray)

Numbers are in `boss` and `shop.weapons` in `src/config.ts`. Rules are in `src/game/boss.ts`,
drawing in `src/fx/bossView.ts`.

- **Starting it.** Buy the Stingray Showdown and at least one weapon at the shop. The boss row
  then becomes a Fight! button. It puts the surfer in the water by the buoys and the Stingray
  rises out of the sea.
- **The Stingray** hovers about 28 m ahead of the surfer and weaves from side to side. It has
  260 health, shown in a bar under the set timer.
- **Shooting.** Hold the left mouse button while riding a wave or in the air. Shots aim
  themselves and lead the target. Shots from the air do 1.5 times the damage. No shooting while
  paddling, so staying up on waves is the fight.
- **Tail strikes.** A red ring appears on the water and fills in; when it is full the strike
  lands. A surfer inside the ring and near the water loses a heart. Carve out of it, or be
  1.8 m or more in the air. After a hit there are 1.6 s of safety. It only attacks a surfer who
  is riding.
- **Phase 1:** one strike every 3.2 s with a 1.25 s warning.
  **Phase 2** (at half health): it turns red, comes closer, moves faster, and lands three
  rings in a row every 2.1 s with a 1.0 s warning.
- **Hearts** are the ones bought in the shop (3 to 6), shown bottom right, and they are full again for each fight.
- **Losing** (no hearts left): "The Stingray wins. You keep your points." Nothing is lost and
  the Fight! button is still there.
- **Winning:** "VICTORY! MAVERICKS UNLOCKED", 3,000 cool points, and the save records Mavericks
  as unlocked (the shop shows it). Mavericks itself is not built. The fight can be replayed.
- Scripted checks: a hands-off rider with the Squirter loses all 3 hearts by phase 2 and keeps
  their points; a rider who cannot die wins with the Trident in about a minute of riding and
  gets the reward and the unlock. The Fight! button in the shop was clicked by a script and starts the fight.
  Dodging by carving or jumping was not driven by a script, and no person has played the fight yet, so the
  difficulty is a first guess.

## Controls (final layout so far)

On land: WASD walk, Shift run, Space hop, F opens the shop from the yellow mat on the pier.

| Key | In the water | On a wave | In the air |
| --- | --- | --- | --- |
| W | Paddle forward (away from the camera) | Lean in for a little extra speed | |
| S | Paddle back | Stall (brake). Next to the whitewater this is how to get barrelled | Air brake: slow the flight and drop short |
| A / D | Paddle left / right | Carve left / right | Steer the flight |
| Space | Pop up when a wave reaches you | Jump | Air kick (needs a charge) |
| Shift | Sprint paddle | Pump for speed | Booster, if one is owned |
| Q | | Cutback. W+Q hang ten, S+Q tail slide | |
| E | | Snap. W+E floater | |
| Left / Right arrow | | | Spin left / right |
| Up / Down arrow | | | Front flip / back flip |
| Left mouse (hold) | | Shoot, during the boss fight | Shoot, during the boss fight |
| F or right mouse | | | Grab |
| Mouse | Look around | Nudge the view | Nudge the view |
| Esc | Pause | Pause | Pause |

Left click shoots, which is why the grab is on F and the right button.
The trick, booster and air brake keys are named in `keys` in `src/config.ts` and can be changed there.

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
  config.ts               every tuning number, shop prices included
  main.ts                 start-up only
  game/game.ts            game loop, modes (start, playing, paused, shop), wiring
  game/score.ts           cool points, combo, multiplier, banking
  game/shop.ts            what the shop sells and what buying does
  game/save.ts            reading and writing the save in the browser
  game/boss.ts            the Stingray fight: health, phases, strikes, shots, hearts
  core/input.ts           keyboard and mouse
  core/level.ts           what a level has to provide (waves, colours, land, scenery)
  levels/index.ts         level list; each level is loaded on demand as its own chunk
  levels/venice/          Venice Beach: wave settings, layout, scenery, pier and shop hut
  ocean/waves.ts          wave sets and the water height function (shared by physics and visuals)
  ocean/lip.ts            the shape of the curling lip (shared by physics and visuals)
  ocean/oceanMesh.ts      the low-poly sea
  ocean/lipMesh.ts        draws the lip
  player/surfer.ts        paddling, riding, air, wipeouts
  player/walker.ts        walking on land
  player/surferModel.ts   the surfer and board (placeholder model)
  camera/followCamera.ts  follow camera
  fx/surfEffects.ts       spray, light trail, shadow and landing ring
  fx/particles.ts         spray particles
  fx/trail.ts             tail light trails
  fx/bossView.ts          draws the Stingray, the shots and the warning rings
  ui/hud.ts, style.css    on-screen display
  ui/shopPanel.ts         the shop screen
```

Adding a beach: create `src/levels/<name>/index.ts` that default-exports a `LevelDefinition`
(waves, sea colours, a `LandMap` for its beach, and scenery),
add its wave settings to `config.ts`, and add one line to `src/levels/index.ts`.

## Placeholders and known gaps

- **The surfer, board, palms, buildings and buoys are simple shapes built in code**, not asset
  pack models, and so are the pier, the shop and the lifeguard towers. Nothing has been
  downloaded yet. Swapping in CC0 models (Kenney, Quaternius) is now a polish job for
  milestone 5. `CREDITS.md` lists what is used.
- **The barrel is simple.** The lip is a curved sheet over the pocket and the scoring is a zone
  check. The lip you see is not a solid object: the only thing it does to the rider is wipe out a jump made underneath it.
- **No sound.** That is milestone 5.
- **Nothing on land is solid except the ground.** Railings, the shop hut, palms and towers can
  be walked through, and a surfer can ride straight through the pier's pilings.
- **Shots aim themselves.** Holding the left mouse button fires at the Stingray wherever the
  camera points. Free aiming with the mouse is not built; say if you want it.
- **The Stingray is a placeholder model built in code**, like everything else.
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
- Milestone 3 scripts: riding on top of the lip for 2.3 s and launching off its end; starting on
  the pier; opening the shop with no points (nothing can be bought) and with 25,000 (bought a
  board, a heart, a weapon and the boss fight, total and save checked, save found in
  `localStorage`); running off the pier into the sea; paddling ashore and walking up the beach;
  wading back in. All the earlier surfing scripts were re-run afterwards.
- **Not covered by a script:** reloading the page to see the save come back in a real browser
  session, and whether saving works inside the hosted preview link.
- **Also not covered by a script:** the "big lip throws you back" rule right at the peak and in the
  pocket by the whitewater (the scripted launches were all on the open face), Shift+S
  shortening a flight, and the right mouse button for grabs (F was used).
- **Boards and the shop (recommendation for milestone 3):** let boards replace the separate
  Speed and Balance upgrades. A board already carries both, the player can see it grow, and one
  purchase track is easier to price. Keep Health as its own upgrade for the boss fight.

## What is left

Milestone 5 (polish: sound, title and controls screens, performance).
