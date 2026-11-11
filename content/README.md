# Wren — content files

The game engine lives in `index.html`. Everything you'd want to edit lives in this folder:

| File | What it holds |
|---|---|
| `manifest.json` | Start position, the relics needed to win, and the list of area files to load |
| `overworld.json` | The 3x3 overworld, the merchant's cave and the secret cave |
| `sunken-keep.json` | Dungeon 1 |
| `tidewater-grotto.json` | Dungeon 2 |
| `soundtrack.json` | Song titles, style notes and original lyrics for each music slot |

To add a third dungeon: write a new area file, add its name to `"areas"` in `manifest.json`, and give an overworld tile a warp to it (`{"dungeon": "<id>", "back": {...}}`). To test a dungeon file without republishing, open the in-game menu (the music-note button) and choose **Play a dungeon file**.

## Levels and eras

Wren earns XP from monsters, bosses and relics. Each level moves the whole game into a new era: Lv 1 is 8-bit, Lv 2 is 16-bit, Lv 3 is early 3D and Lv 4 is the modern 3D age. The 3D world is built from `overworld.json`: every tree, rock, house, river and sign in the 2D map shows up in 3D at the same spot, so editing the overworld changes both. Dungeon files stay 2D.

## Area file

```json
{
  "id": "my-dungeon",            // unique, lowercase
  "name": "My Dungeon",          // shown as a banner on entry
  "kind": "dungeon",             // "dungeon" (cleared rooms stay cleared) or "overworld" (enemies respawn)
  "theme": "grotto",             // tileset: "dun", "grotto", "cave" or "over"
  "music": "grotto",             // music slot: over, dun, grotto, boss, calm, win
  "bossMusic": "boss",
  "kit": { "bombs": 8, "hearts": 4 },   // optional: minimum gear when played from a file
  "start": { "room": "1,2", "x": 7.5, "y": 8, "dir": "up" },
  "rooms": { "1,2": { ... }, "1,1": { ... } }
}
```

Rooms named `"x,y"` sit on a grid: walking off an edge leads to the neighbouring room, so door gaps on touching edges must line up. Rooms with any other name (like `"shop"`) stand alone and are reached by warps.

## Room

```json
{
  "map": [ 11 strings of 16 characters ],
  "enemies": [["slime", 4, 3], ["eel", 3, 3]],          // [type, tileX, tileY]
  "items":   [{ "item": "key", "x": 7.5, "y": 5, "id": "k1", "afterClear": true }],
  "chests":  [{ "x": 7, "y": 5, "item": "bigkey", "id": "c1" }],
  "npcs":    [{ "type": "tablet", "x": 2, "y": 1, "text": "Hello!" }],
  "warps":   { "E": { "exit": true } },
  "shutters": "clear",          // Z tiles open when the room is cleared ("clear") or a block hits a plate ("plate")
  "boss": true, "bossName": "OLD SHELLBACK",
  "shut": [[7, 10], [8, 10]],   // boss rooms: bars that close behind you until the boss falls
  "bombSupply": true            // drops bombs if you run out (needed for bomb-only bosses)
}
```

Every `id` must be unique within its file. `afterClear` items and chests appear once every enemy in the room is beaten.

## Tiles

| Char | Tile | Char | Tile |
|---|---|---|---|
| `#` | wall | `_` | floor |
| `o` | stone block | `t` | brazier |
| `W` | deep water (eels live here) | `=` | bridge |
| `L` | locked door (small key) | `K` | boss door (big key) |
| `X` | cracked wall (bomb it) | `Z` | shutter door |
| `P` | push block | `+` | pressure plate |
| `E` | stairs (use a warp) | | |

Overworld only: `.` grass, `,` path, `S` sand, `F` flowers, `T` tree, `R` rock, `B` bush, `q` healing spring, `^` cliff, `C`/`c` cave mouth, `M` castle wall, `D` keep door, `r` roof, `w` house wall, `d` house door.

## Enemies, items, NPCs, warps

- Enemies: `slime`, `bat`, `skel`, `pod` (shoots seeds), `crab`, `eel` (place on a `W` tile), bosses `warden` and `shellback` (only bombs crack its shell).
- Floor items: `coin`, `bigcoin`, `heart`, `bomb`, `key`, `heartc` (heart container), `relic` (add `"relic": "<id>"`).
- Chest items: `key`, `bigkey`, `bombs`, `coins20`.
- NPC types: `sign`, `tablet`, `elder`, `merchant`.
- Warps are keyed by the tile you step on: `{"to": "shop", "x": 7.5, "y": 8, "dir": "up"}` (same area), `{"to": "overworld:2,1", ...}` (another area), `{"dungeon": "<id>", "back": {"x":..,"y":..,"dir":..}}` (enter a dungeon), `{"exit": true}` (leave the dungeon).

Relics listed in `manifest.json` are the win condition: collect them all to finish the game.
