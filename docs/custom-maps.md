# Making arenas with custom-shaped walls and art

An arena has two layers:

1. **A tile grid** for the basics: walls, boxes, pits, grass, ice, teleporters and spawns.
2. **Custom shapes** (optional) for anything that isn't a square: long curves, round tables, angled walls, odd islands. **You decide exactly what's solid**, and each shape can carry its own art.

Players, boomerangs (bounces, getting stuck), CPU route-finding and spawn placement all understand shapes automatically.

## Where arenas live

In `sim.js`, the `MAPS` list. Each entry looks like:

```js
{ name: 'Curvy Cafe',
  q: [                // top-left QUARTER of the arena; it's mirrored to make the rest
    '##########',
    '#S........',
    '#.........',
    '#.....c...',
    '#.........',
    '#.........'],
  shapes: [ ... ],    // optional, see below
  big: true,          // optional: use this arena for 5–8 player games
  shapeColor: '#8d93a3', // optional: default colour for this arena's shapes
}
```

Tile letters: `#` wall, `c` breakable box, `t` tree, `o` hot-sauce pit, `g` tall grass, `i` ice, `p` teleporter pad, `S` spawn, `.` floor.
A 10×6 quarter makes a 20×12 arena, and a 14×9 quarter makes a 28×18 one.

## Shapes

All numbers are in **tiles** (1 tile = 48 px). (0, 0) is the top-left corner of the whole arena. A 20×12 arena runs to (20, 12).

| Shape | Fields | Good for |
|---|---|---|
| `circle` | `x, y, r` | round tables, pillars, barrels |
| `poly` | `points: [[x, y], ...]` | any outline: angled walls, islands, counters. Concave is fine |
| `path` | `points: [[x, y], ...], width` | a thick line through the points: winding walls, fences, rails |
| `arc` | `x, y, r, from, to, width` | curved walls. `from`/`to` are degrees (0 = right, 90 = down) |

Options on any shape:
- `mirror: false`: place it exactly once. The default `true` copies it into all four quarters, like the tiles, so arenas stay fair. A shape sitting on the centre line isn't duplicated.
- `color: '#7a4a2a'`: fill colour when there's no art.
- `art: { src: 'art/maps/cafe/table.png', x, y, w, h }`: an image drawn instead of the plain shape. `x, y, w, h` is the box it fills, in tiles. Mirrored copies flip the image automatically.

### Example

```js
shapes: [
  { type: 'arc', x: 1, y: 1, r: 4.2, from: 15, to: 75, width: 0.45 },              // curved wall around each corner
  { type: 'circle', x: 6.5, y: 2.5, r: 0.75,                                         // round table with art
    art: { src: 'art/maps/cafe/table.png', x: 5.6, y: 1.6, w: 1.8, h: 1.8 } },
  { type: 'arc', x: 10, y: 6, r: 2.4, from: 205, to: 335, width: 0.45, mirror: false }, // one crescent in the middle
  { type: 'poly', points: [[2.6, 5], [4.2, 5.6], [4.2, 6.4], [2.6, 7]] },           // wedge island
  { type: 'path', points: [[8, 2], [9, 3], [11, 3], [12, 2]], width: 0.4 },          // a bent fence
]
```

## Checking a new arena

- `node tests/maps.test.js` checks every arena: spawns are clear of walls and shapes, every spawn can reach every other, and nearly all the floor is reachable.
- `node tests/map-view.js "Arena Name"` prints the arena as text so you can see blocked spots. `X` means covered by a shape, `?` means unreachable, and `|` marks a blocked step between tiles.
- `docs/arenas.png` is a preview sheet of every arena.

## Workflow for custom art

1. Paint the arena piece (for example a long curved counter) as a PNG with a transparent background.
2. Put it in `art/maps/<arena>/` in the repo. Add the folder to the server's file list if you host with `server.js` (I can do this when the first art arrives).
3. Add a shape that traces the solid part (it can be simpler than the art), with `art` pointing at the PNG and a box covering where it should appear.
4. Play it. If a boomerang bounces off thin air or passes through the art, adjust the shape's points.

Tip: keep at least about 0.9 tiles of space between shapes and walls where players should fit through. Fighters are about 0.7 tiles wide.

## How shapes behave

- **Players** slide along the surface.
- **Boomerangs going out** bounce off the surface at the correct angle (curves included).
- **Boomerangs coming back**, or being called back, stop against a shape in the way and drop there.
- **CPUs** route around shapes. If a weird shape ever traps one, it shuffles to a nearby open spot and carries on.
- **Spawns and power-ups** avoid tiles covered by shapes.
