# Parley

Drop-in multiplayer for browser games. Players connect **directly to each other**, with no server of your own and no installs. One file, no dependencies.

```html
<script src="parley.js"></script>
```

Parley gives you four ways to get two players connected. Every one of them hands you the same `Connection` object, so your game code doesn't care how they met.

| Way to connect | What players do | Needs |
|---|---|---|
| **Code** | Host gets a 4-letter code like `KLYX`; friend types it in | Internet (free PeerJS matchmaking) |
| **Invite link** | Host sends a link; friend opens it and sends back a reply link | Nothing at all; works on a home network with no internet |
| **Lobby** | Everyone opens the same lobby link; see who's there, chat, challenge, quick match | Internet (free PeerJS matchmaking) |
| **Quick match** | Press a button in a lobby; Parley pairs you with someone | Same as lobby |

Open `demo.html` to see all of it in a tiny two-player game.

---

## Quick start

```js
const net = Parley.create({ app: 'mygame', name: 'Arthur' });

// Player 1
const game = await net.host();
showCode(game.code);                       // "KLYX"
game.on('join', conn => startMatch(conn));

// Player 2 (another computer)
const conn = await net.join('KLYX');
startMatch(conn);

function startMatch(conn) {
  // conn.isHost is true on exactly one side: let that side run the simulation.
  conn.state({ x: 10, y: 20 });            // share your latest state (fast, lossy, auto-resent)
  conn.on('state', s => drawOpponent(s));  // their latest state

  conn.send('hit', { damage: 3 });         // reliable, in order
  conn.handle('hit', d => takeDamage(d.damage));

  conn.chat('Good luck!');
  conn.on('chat', text => showChat(conn.name, text));

  conn.on('close', reason => backToMenu()); // 'left' | 'timeout' | 'closed'
}
```

`app` keeps your game's players separate from other games using Parley. Pick a short, unique word and keep it the same across versions that should be able to play each other.

---

## Parley.create(options) → net

| Option | Default | |
|---|---|---|
| `app` | **required** | Your game's id (letters and numbers). |
| `name` | `'Player'` | The name others see. Change later with `net.setName(name)`. |
| `broker` | free PeerJS service | Matchmaking server for codes and lobbies. Use your own [PeerJS server](https://github.com/peers/peerjs-server) URL, or `false` to allow invite links only. |
| `iceServers` | Google STUN + PeerJS TURN | WebRTC address-discovery and relay servers. |

`Parley.supported` is `false` in browsers without WebRTC.

---

## Codes

### `await net.host({ meta, maxPlayers = 1, code })` → HostedGame
- `game.code`: share this.
- `game.on('join', conn => …)`: a player arrived. `conn.meta` is what they sent.
- `game.on('leave', conn => …)`
- `game.close()`: stop accepting players (existing connections stay open).
- `meta` is shared with joiners (e.g. `{ mode: 'duel' }`).

### `await net.join(code, { meta, timeout })` → Connection
Rejects with `err.code`: `'not-found'`, `'timeout'`, `'network'`.

**Practice while you wait:** `host()` returns immediately with the code; keep your solo game running and start the match in the `'join'` handler.

---

## Invite links (no service at all)

```js
// Host
const invite = await net.invite({ meta: { mode: 'duel' } });
share(invite.link || invite.code);         // link when your page is on the web, code when opened from a file
invite.on('connect', conn => startMatch(conn));
// when the friend's reply arrives (pasted in):
await invite.accept(replyText);            // accepts a code, a whole link, or either inside other text

// Friend
const reply = await net.answer(inviteText);
share(reply.link || reply.code);           // send back to the host
startMatch(await reply.connection);
```

**Arriving by link.** Put this at startup:

```js
const link = Parley.readLink();            // { kind: 'invite' | 'reply' | 'lobby', value } or null
if (link) {
  Parley.clearLink();
  if (link.kind === 'invite') answerFlow(link.value);
  if (link.kind === 'reply') {
    // Hands the reply to the host's waiting tab in this same browser.
    if (!(await Parley.deliverReply('mygame', link.value))) askToPaste(link.value);
  }
  if (link.kind === 'lobby') net.lobby(link.value);
}
```

`await Parley.inspect(text)` tells you whether pasted text is an `'invite'` or a `'reply'`.

Invite links need no matchmaking service. On a home network they work with no internet; over the internet the two computers use a public STUN server to find each other's address. Some strict networks block direct connections.

---

## Lobby

```js
const lobby = await net.lobby();           // new lobby; or net.lobby('6QUY95') to join one
share(lobby.link || lobby.code);

lobby.on('players', list => render(list)); // [{ id, name, status, seeking, state, me }]
lobby.on('join',  p => note(`${p.name} joined`));
lobby.on('leave', p => note(`${p.name} left`));

lobby.set({ status: 'playing', vs: 'Cai', score: 3 });  // anything small; others see it in p.state

lobby.chat('Anyone for a duel?');
lobby.on('chat', ({ from, text, me }) => addLine(from.name, text));

// Challenges
const conn = await lobby.challenge(player.id, { mode: 'duel' });  // rejects 'declined' | 'left' | 'timeout'
lobby.cancelChallenge();
lobby.on('challenge', ch => {              // ch.from.name, ch.meta
  ask(`${ch.from.name} challenges you`).then(yes => yes ? ch.accept() : ch.decline());
  ch.on('cancelled', closeDialog);
});

// Quick match: pairs players searching with the same key
lobby.quickMatch('duel');
lobby.cancelQuickMatch();

// Every match from a lobby, challenge or quick match, arrives here on both sides:
lobby.on('match', conn => startMatch(conn));

lobby.leave();
```

Nobody runs the lobby. The first player to open it holds it, and if they leave, the next player to reconnect takes over (`lobby.on('status', s => …)`: `'holding'`, `'connected'`, `'reconnecting'`, `'left'`). Matches are direct connections between the two players, so they don't depend on the holder.

---

## Connection

| | |
|---|---|
| `conn.name`, `conn.meta` | The other player's name and the meta they shared. |
| `conn.isHost` | `true` on exactly one side (host, inviter, challenger, quick-match lead). |
| `conn.state(patch)` / `conn.remoteState` / `'state'` | Latest-state sync. Fast and lossy, resent until it arrives. Best for positions and inputs. `null` removes a field. |
| `conn.send(type, data)` / `conn.handle(type, fn)` | Reliable, in-order messages. Also `'message'` events `(type, data)`. |
| `conn.sendFast(type, data)` | Fast, may drop. Good for 30-per-second snapshots. |
| `conn.chat(text)` / `'chat'` | Chat line (cleaned, max 200 characters). |
| `conn.rtt` / `'ping'` | Round-trip time in ms, updated every second. |
| `conn.close()` / `'close'` | Reason: `'left'`, `'timeout'`, `'closed'`. Closes automatically if the other side goes silent for 8 seconds or closes their page. |

Messages are JSON; keep each under about 64 KB. Types starting with `$` are reserved.

**A good pattern for action games:** the `isHost` side runs the simulation and sends a snapshot with `sendFast` 20–30 times a second; the other side sends its input with `state()` and draws the snapshots. That's how `demo.html` and Lancewing work.

---

## Errors

Promises reject with a `ParleyError` whose `code` is one of: `unsupported`, `network`, `no-broker`, `not-found`, `id-taken`, `timeout`, `bad-invite`, `wrong-game`, `wrong-invite`, `declined`, `cancelled`, `closed`, `left`. `err.message` is a plain sentence you can show players.

## Safety

Everything other players send is untrusted. Parley strips invisible characters from names and chat and caps their length, but always display them with `textContent`, never `innerHTML`.

## Files

- `parley.js`: the library (works as a `<script>` global `Parley`, or `require('./parley.js')`).
- `demo.html`: a two-player paddle game using codes, invite links, the lobby, chat and state sync.
