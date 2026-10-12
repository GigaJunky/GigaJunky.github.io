# Adventure JSON format (`gta-1`)

An adventure is one JSON file. The engine knows nothing about any particular game: rooms, items, puzzles, scoring, pictures and endings all live in the data. Look at `adventures/*.json` for complete working examples.

```json
{
  "format": "gta-1",
  "id": "my-game",                 // used for save slots (defaults to a slug of the title)
  "title": "MY GAME",
  "author": "You",
  "intro": "Text shown at the start.",
  "help": "Text for the HELP command.",
  "start": "hall",                 // starting room id (required)
  "maxScore": 50,
  "maxCarry": 8,                   // optional inventory limit
  "theme": "coco",                 // phosphor | coco | amber | infocom | paper
  "showExits": true,               // print "Exits: ..." after room descriptions (default true)
  "ranks": [[0, "Novice"], [50, "Master"]],
  "messages": { "dark": "...", "noExit": "...", "won": "...", "died": "..." },
  "verbs": { "take": ["nab"], "dance": ["boogie", "cut a rug"] },
  "directions": { "downstream": "downstream" },
  "flags": ["door_painted"],       // flags that start true
  "vars": { "gold": 0 },
  "colors": { "slime": "#4f8" },   // extra named colours for art
  "artLib": { "tree2": [ ...art commands... ] },
  "imageBase": "https://example.com/pics/",   // base for relative image URLs
  "overlayItems": false,           // draw item art on top of image-URL rooms too
  "darkArt": [ ...art shown in dark rooms... ],
  "rooms":   { "<id>": { ... } },
  "items":   { "<id>": { ... } },
  "actions": [ ... ],
  "events":  [ ... ]
}
```

## Rooms

```json
"hall": {
  "name": "Great Hall",
  "desc": "Text, or a list of parts (see Conditional text).",
  "dark": false,                   // needs a lit item to see
  "image": "https://.../hall.jpg", // picture from any URL (falls back to "art" if it fails)
  "art": [ ...vector art commands... ],
  "exits": {
    "north": "kitchen",
    "east":  { "to": "vault", "door": "vault_door" },             // blocked while the door item is closed
    "up":    { "to": "tower", "if": "has:rope", "msg": "Too high to climb." },
    "down":  { "to": "pit", "say": "You slide down...", "do": [ ...effects... ] },
    "west":  { "msg": "A wall of fire blocks the way." },         // no "to": always blocked
    "south": { "to": "x", "if": "flag:a", "else": [ ...effects run when blocked... ] }
  },
  "noExit": "Custom 'can't go that way' text for this room.",
  "onEnter": [ { "if": "first", "do": [ { "score": 5 } ] } ],
  "on": { "dig": "You dig a hole. It fills with water." }        // room-only verbs
}
```

Directions: `north south east west northeast northwest southeast southwest up down in out` (and abbreviations), plus anything you add in `"directions"`.

## Items

```json
"lamp": {
  "name": "brass lantern",          // last word becomes a noun, earlier words adjectives
  "nouns": ["lamp", "light"], "adj": ["brass"],
  "article": "a",                   // "a" / "an" / "some" / "the" / "" (default a/an)
  "at": "hall",                     // room id, "player", another item id (inside it), null (nowhere)
                                    // or a list of rooms for scenery seen in several places
  "desc": "Shown by EXAMINE.",
  "here": "A lantern sits on the mantelpiece.",   // room line while it is in its starting place
  "text": "Shown by READ.",
  "scenery": true,                  // not listed, can't be taken (describe it in the room text)
  "fixed": true, "fixedMsg": "It's bolted down.",  // listed but can't be taken
  "points": 5,                      // score the first time it is taken
  "deposit": { "in": "trophy_case", "points": 10 },   // score when PUT into that container
  "container": true, "surface": true, "transparent": true,
  "open": false, "locked": true, "key": "brass_key",  // OPEN/CLOSE/UNLOCK/LOCK work automatically
  "openMsg": "...", "unlockMsg": "...",
  "lightable": true, "lit": false, "lightWith": "matches",  // LIGHT / EXTINGUISH
  "wearable": true, "edible": true, "drinkable": true,
  "hidden": true,                   // invisible until an effect shows it
  "goes": "in",                     // GO <item> / ENTER <item> moves this direction
  "art": [ ...drawn on the room picture while the item is lying there... ],
  "artAt": [128, 170], "artScale": 1,
  "on": { "push,pull": "It won't budge.", "rub": { "if": "has:cloth", "do": [...], "else": "..." } }
}
```

## Actions

Actions are checked before the built-in verbs, in order. The first match runs.

```json
{ "verb": "pour,throw", "noun": "water", "noun2": "fire", "prep": "on",
  "room": "kitchen", "if": ["has:water", "!flag:fire_out"],
  "do":   [ "The fire hisses out.", { "set": "fire_out", "score": 10 } ],
  "else": "Nothing happens.",       // run when the conditions fail (otherwise the search continues)
  "once": true,                     // only ever fires once
  "continue": true,                 // also run the built-in verb afterwards
  "turn": false }                   // doesn't count as a move
```

- `verb`: one or more verbs, comma-separated. Unknown verbs become new words automatically.
- `noun`/`noun2`: an item id (matches that item), any other word (matches the typed word), `"*"` (any noun), `"-"` (no noun), or a list of these. Omit to match anything.

## Conditions

A condition is a string, a list (all must hold), or `{ "any": [...] }` / `{ "not": ... }`. Prefix `!` to negate.

| condition | true when |
|---|---|
| `has:item` | carried (even inside a carried container) |
| `present:item` | visible (carried or in the room) |
| `here:item` | visible in the room, not carried |
| `near:item` | in the room or carried, even in the dark |
| `in:room` / `in:a\|b` | the player is in that room |
| `flag:name` | flag is set |
| `var:gold>=3` | compare a variable (`turns`, `score`, `carried` are built in) |
| `lit:item` `open:item` `locked:item` `hidden:item` `worn:item` | item state |
| `at:item:place` | item is exactly at that room / item / `player` / `nowhere` |
| `visited:room`, `first` | room was visited / first visit to this room |
| `dark` | the current room is dark |
| `chance:30` | random 30% |

## Effects

A string prints text. An object does one or more things:

| effect | does |
|---|---|
| `{"say": "text"}` | print |
| `{"set": "f"}` `{"unset": "f"}` `{"toggle": "f"}` | flags (names or lists) |
| `{"var": "gold", "add": 1}` / `{"var": "gold", "value": 0}` | variables |
| `{"move": "item", "to": "room"}` | `to`: room, `here`, `player`, item id, or `nowhere` |
| `{"give": "item"}` `{"destroy": "item"}` | to inventory / remove from play |
| `{"show": "item"}` `{"hide": "item"}` | reveal / conceal |
| `{"prop": "item", "key": "open", "value": true}` | change any item property (desc, name, art...) |
| `{"roomProp": "room", "key": "desc", "value": "..."}` | change any room property |
| `{"exit": "room", "dir": "down", "to": "cellar"}` | add, change or (`"to": null`) remove an exit |
| `{"goto": "room"}` | move the player |
| `{"score": 10}` | add points |
| `{"look": true}` | redescribe the room |
| `{"if": cond, "then": [...], "else": [...]}` | branch |
| `{"random": [[...], [...]]}` | run one option at random |
| `{"win": "text"}` / `{"die": "text"}` | end the game |

## Events

Run after every move:

```json
{ "if": ["in:cellar", "!lit:lamp"], "do": ["Something growls."], "once": true, "room": "cellar" }
```

## Conditional text

Anywhere text is allowed (`desc`, `here`, `text`, `say`), you can use a list:

```json
"desc": ["A small room.", { "if": "open:door", "text": "The door is open.", "else": "The door is shut." }]
```

`{score}`, `{max}`, `{turns}` and `{var.name}` are substituted.

## Pictures

A room shows `image` (any URL: `https://`, `data:`, or a path relative to the JSON file or `imageBase`) if it loads; otherwise its vector `art`. Art is drawn on a 256x192 canvas, the Color Computer's PMODE 4 resolution, with coordinates in that space. Colours are names (`black green yellow blue red buff cyan magenta orange white gray brown tan darkgreen navy purple gold silver stone wood sky grass water` and more) or `#hex`.

Each command is an array `[op, ...args]`:

| op | args |
|---|---|
| `bg` | colour |
| `gradient` | y0, y1, colourTop, colourBottom |
| `rect` | x, y, w, h, fill, stroke |
| `poly` | [x,y,x,y...], fill, stroke |
| `line` | [x,y,x,y...], colour, width |
| `circle` / `ellipse` | x, y, r (or rx, ry), fill, stroke |
| `arc` | x, y, r, startDeg, endDeg, colour, width |
| `text` | x, y, "text", colour, size |
| `dither` | x, y, w, h, colour1, colour2, `checker`/`lines`/`brick`/`sparse` |
| `dpoly` | points, colour1, colour2, kind (dithered polygon) |
| `glow` | x, y, r, colour, alpha |
| `stars` | count, colour, seed, maxY |
| `ground` / `hills` / `mountains` | y, colour, seed |
| `water` | y, colour, waveColour |
| `path` | colour, topY, bottomWidth, topWidth |
| `tree` / `pine` | x, y, height, colours |
| `forest` | y, colour, seed, count |
| `house` | x, y, w, h, wall, roof |
| `room` | wall, floor, ceiling, lineColour (one-point-perspective interior) |
| `wall` | side (`back`/`left`/`right`/`floor`/`ceiling`), u1, u2, v1, v2, fill, stroke |
| `texture` | side, colour1, colour2, kind |
| `door` / `arch` / `window` / `stainedglass` | side, position (0-1), ... |
| `stairs` | `up`/`down`, colour, position, side |
| `table` `bookcase` `candle` `torch` `altar` `cross` `pentagram` `coffin` `skull` `bones` `well` `statue` `bell` `gate` `grate` `rocks` | see `render.js` |
| `cave` / `tunnel` | rock, dark, floor / colour, depth |
| `use` | artLib name, dx, dy, scale |
| `group` | dx, dy, scale, [commands] |
| `if` | condition, [commands], [else commands]: pictures can follow game state |

Item `art` is drawn around (0,0) = the point where the item rests, and placed in a free floor slot unless `artAt` is given.

## Loading

- Put the file anywhere that serves it with CORS (GitHub raw, a Gist, most static hosts) and paste the URL into **Menu → Load from anywhere**, or link straight to `index.html?adv=https://.../game.json`.
- Or use **Open file** or drag and drop the .json onto the page.
- To add it to the built-in library, put it in `adventures/`, list it in `adventures/index.json`, and run `node tools/bundle.js`.
- Test from the command line: `node tools/play.js adventures/game.json "n" "take lamp"` or `-f walkthrough.txt`.
