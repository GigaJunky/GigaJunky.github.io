# Super Off Road Remix

Four-truck stadium off-road racing for 1–4 players: local, online, or both at once. A modern take on the 1989 arcade game, with lit 3D-looking tracks, jumps, mud, water, nitro, a speed shop between races, and synthesized engine sound and music.

## Running it

Needs [Node.js](https://nodejs.org) 18 or newer. There is nothing to install.

```bash
cd ~/projects/super-off-road
node server.js
```

Your browser opens at `http://localhost:8766`. Press `Ctrl+C` in the terminal to stop.

| Option | Example |
|---|---|
| Different port | `PORT=9000 node server.js` |
| Don't open a browser | `NO_OPEN=1 node server.js` |
| npm style | `npm start` |

The server prints your network address too (like `http://192.168.0.152:8766`). Others on your Wi-Fi can open that address to play.

## Online play

The server has a built-in matchmaking broker, so online games don't depend on any outside service.

1. One player picks **Online → Host a game** and gets a 4-letter code (or **Copy link**).
2. Friends open the **same server address** and pick **Online → Join** with the code.
3. Up to 4 trucks total. The host can also seat local players on keyboards and controllers. Empty seats are CPU.

Races are peer to peer (WebRTC): the server only introduces players. On a home network this needs no internet. For friends on the internet, they must be able to reach your server, so forward the port on your router or host the folder on a public machine.

If you serve the folder some other way (any static web server, GitHub Pages), the game falls back to Parley's free public matchmaking service.

## Controls

| Device | Steer | Gas | Nitro | Brake / reverse |
|---|---|---|---|---|
| Keyboard A | A D | W | Space | S |
| Keyboard B | ← → | ↑ | Right Shift, Enter | ↓ |
| Mouse (spinner) | move left / right | left button | right button | middle button |
| Gamepad / joystick | stick, d-pad | A, RT, stick forward | X Y LB RB | B, LT, stick back |
| Touch | slide the left pad | GAS | NITRO | BRAKE |

On the **Drivers** screen, press gas on any keyboard or controller to take a seat. Click **Mouse** or **Touch** on a seat for those. `Q` / `Backspace` / B leaves a seat; `Enter` or Start begins. `Esc` pauses, `M` mutes music.

**Controller not responding?** Go to **Options → Controller setup**. It shows exactly what the browser reads from each controller, and lets you press the buttons, pedals or axes you want for gas, brake and nitro. Bindings are saved per controller. Browsers only report a controller after you press a button on it, and gamepads only work on `localhost` or HTTPS pages (not over a plain network address).

## Files

| File | What it is |
|---|---|
| `server.js` | Standalone web server and matchmaking broker (zero dependencies) |
| `index.html` | Page, menus and styles |
| `config.js` | Placeholder; `server.js` replaces it to point online play at its broker |
| `parley.js` | Parley peer-to-peer networking library |
| `js/game.js` | Menus, seats, season, shop, online host/guest flow, main loop |
| `js/sim.js` | Truck physics, jumps, collisions, AI, pickups, laps |
| `js/render.js` | Drawing, particles, tire marks, night lighting, HUD |
| `js/tracks.js` | The 8 track layouts and the track baker (height map, lighting, props) |
| `js/audio.js` | Synthesized engines, effects, crowd and music |
| `js/input.js` | Keyboard, mouse, gamepad and touch input |
| `js/util.js` | Math, noise and formatting helpers |
