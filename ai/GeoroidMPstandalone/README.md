# Georoids

A neon, Geometry Wars–style take on Asteroids, written as a single self-contained HTML file. Glowing vector graphics, a grid that ripples when things explode, synthesized sound, local two-player co-op, and a ship that runs on one shared battery.

**File:** `asteroids.html` (no build step, no dependencies, no assets)

## Running it

Open `asteroids.html` in any modern browser. Click the page once so it receives key presses, then press **Enter** to start. Sound starts after your first key press or tap, as browsers require.

The game fills the whole browser window and resizes with it.

## Modes

| Key / button | Action |
|---|---|
| `1` or `Enter` or tap | Start solo |
| `2` | Start two-player co-op |
| `2` during a solo game | Player 2 drops in |
| Controller Start / A | Start solo (two controllers connected starts co-op) |
| Start on a 2nd controller | Player 2 drops in during a solo game |

In solo mode, both keyboard layouts below control the same ship.

## Controls

| Action | Player 1 | Player 2 | Controller |
|---|---|---|---|
| Turn | ← → | A / D | Left stick or d-pad |
| Thrust | ↑ | W | Right trigger, d-pad up, or stick up |
| Fire laser | Space | F | A or RB |
| Shield | ↓ or X | S | LT, LB, d-pad down, or stick down |
| Warp (teleport) | H or Z | G | B |
| Nova bomb | B | E | Y |
| Gravity well | N | Q | X |
| Blast bomb | V | R | Click a stick |
| Mute | M | | |

The first controller drives player 1 and the second drives player 2. Keyboards keep working alongside controllers. Touch screens get on-screen buttons for player 1.

**Controller troubleshooting:** press **I** in the game to show what the browser sees (device name, mapping, stick values and pressed buttons). Browsers only report a controller after you press a button on it, and the gamepad API needs HTTPS or `localhost`. Controllers with a non-standard mapping use a simple layout: stick steers (up thrusts, down shields), button 1 fires, 2 thrusts, 3 shields, 4 warps, 5 nova, 6 gravity well, 7 blast.

## How it plays

### Hull and battery

Ships have a **hull** (health) instead of lives, and a single **battery** that powers almost everything.

| Drain on the battery | Cost |
|---|---|
| Laser shot | 4 per shot |
| Thrust | 0.2 per frame |
| Shield | 0.6 per frame, plus 10 for each asteroid or enemy it absorbs, 6 for each enemy bullet |

- The battery recharges when you aren't thrusting or shielding.
- With an empty battery you still get about 30% thrust, so you're never stranded.
- Emptying the battery locks the shield until it recovers to 25%.
- **Hull repair:** after about a second without firing or shielding, the hull slowly heals as long as the battery is above 20%. Repair drains a little battery.
- At 0 hull a ship is destroyed. In co-op, a downed player returns at half hull and battery when the next level starts. The game ends when every ship is down.

### Damage

| Source | Hull damage |
|---|---|
| Large / medium / small asteroid | 35 / 22 / 12 |
| Enemy collision (the enemy is destroyed) | 25 |
| Enemy UFO bullet | 15 |

After a hit you get a moment of invincibility. The shield blocks all damage.

### Asteroids and mining

Shooting an asteroid splits it into smaller ones. Each break drops gold **ore** (more from bigger rocks) that drifts toward you when you're close. Each ore orb gives **+12 ore** and **+6 battery**. Ore orbs fade after about 10 seconds.

### Bombs

Ore fills the **ORE** bar (max 100), which pays for three special weapons:

| Bomb | Ore cost | Effect |
|---|---|---|
| **Gravity well** | 40 | Lasts 6 seconds. Pulls in asteroids, enemies, enemy bullets and ore, and destroys anything that reaches the center. |
| **Blast** | 60 | Shockwave that wipes out every asteroid, enemy and enemy bullet within a large radius (about 450 px) of your ship. In online duels it also damages nearby ships. |
| **Nova** | 100 | Destroys every asteroid, enemy and enemy bullet on screen. Clearing all asteroids advances the level. |

The HUD shows `WELL`, `BLAST` and `NOVA` in gold when you can afford them.

### Enemies

Enemies spawn with a pulsing ring, and arrive faster and in greater numbers each level.

| Enemy | Looks like | Behavior | Points | Appears |
|---|---|---|---|---|
| Grunt | Blue diamond | Chases the nearest ship | 50 | Level 1 |
| Weaver | Green square | Chases faster and dodges your bullets | 100 | Level 2 |
| Spinner | Purple pinwheel | Wanders erratically | 75 | Level 3 |
| UFO | Red saucer | Crosses the screen and fires aimed shots (one at a time) | 200 | Level 2 |

### Scoring and combo

Asteroids are worth 20 / 50 / 100 points (small / medium / large) before the multiplier. Every kill within about two seconds of the last one raises the **combo multiplier** up to ×10. It resets when the timer runs out or when you take damage.

### Warp

Teleports your ship to a random spot with a short invincibility window, then needs about two seconds to recharge. It's free, so use it to escape.

## Tuning

All the game-feel numbers are plain constants near the top of the `<script>`, for example:

- Laser cost: `P.en-=4` in `stepP`
- Thrust drain: the `use` line in `stepP`
- Damage values: the `[0,12,22,35]` and `dmg(P,25)` / `dmg(P,15)` calls in `update`
- Ore cost of bombs: `P.ore>=100` (nova) and `P.ore>=40` (well)
- Enemy stats: the `ED` table
- Spawn rate: `spawnT=Math.max(45,170-level*12)` in `update`

## Technical notes

- Plain HTML, CSS and JavaScript on a single `<canvas>`. No libraries.
- Sound is synthesized live with the Web Audio API, so there are no audio files. Press `M` to mute.
- Glow effects use canvas shadow blur, which can be heavy on older phones. The canvas renders at up to 2× resolution on high-density screens.
- Gamepad input uses the browser Gamepad API. Some browsers block it when the page is embedded in another page; if that happens the game falls back to keyboard and touch.

## Limitations

- Multiplayer is local only (one screen, two players). There is no online play.
- There is no persistent high score; "Best" resets when you reload.
- Touch controls only drive player 1.
