# Wren

An original top-down action adventure that grows up as you play. Wren starts out in an 8-bit world, and every level-up moves the whole game into the next era of graphics and gameplay, ending in an open 3D valley with soft shadows, waving grass and gliding.

Everything runs in one browser page with no frameworks or build tools beyond a short Python script. The 3D eras use a small purpose-built WebGL2 engine, and the music is a synthesized band score generated live with Web Audio.

## The four eras

| Level | Era | What changes |
|---|---|---|
| 1 | 8-bit | The 2D game in a limited retro palette, with a stripped-down band |
| 2 | 16-bit | Full color, drop shadows, and choir and pads in the band |
| 3 | Early 3D | Willowmere rebuilt in 3D from the 2D map: low-poly, flat-shaded, wobbly and foggy |
| 4 | Modern | Toon shading, soft shadows, grass that sways in the wind, clouds, shiny water, sprinting and gliding |

XP comes from monsters, bosses and relics. You reach Lv 2 at 40 XP, Lv 3 at 240 and Lv 4 at 380, and each level adds a heart. Beating both 2D dungeons always gets you to Lv 3.

## The adventure

- **2D eras:** a thief has stolen the Ember of the Vale and the Tide Pearl. Explore the overworld, then clear the Sunken Keep and the Tidewater Grotto to bring both relics home.
- **3D eras:** light three waystones to break the seal on the old keep, then face the Bramble King in its courtyard. The third waystone stands on a sea stack you can only reach by gliding.

## Play

Open `index.html` in a modern browser. It works straight from disk, using the copy of the content built into the page.

To serve it the way it's meant to be served, so that edits in `content/` show up without rebuilding:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

To publish it, turn on GitHub Pages for this repo: Settings > Pages > Deploy from a branch > `main` / root. The game will then be at `https://imburk.github.io/wren/`.

The 3D eras need WebGL2, which every current desktop and mobile browser supports. If it isn't available, the game keeps going in 2D.

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Move | WASD or arrow keys | D-pad |
| Sword / talk | Z, J or Space (2D); Z or J (3D) | A |
| Bomb (2D) | X or K | B |
| Jump / glide (3D) | Space, X or K; hold in the air to glide | B |
| Sprint (3D, Lv 4) | Shift | |
| Camera (3D) | Drag the mouse, or Q / E | Drag the screen |
| Pause | Enter or P | START |
| Sound on/off | M | the note button |

## Project layout

```
index.html        built game: open this to play
build.py          rebuilds index.html from src/ and content/
src/game.html     2D engine, menus, audio, save system, levels and eras
src/world3d.js    3D engine and the open-world quest for Lv 3 and Lv 4
content/          the world, as editable JSON
  manifest.json       start position, relics and the list of area files
  overworld.json      the 3x3 overworld and its caves (also the source of the 3D valley)
  sunken-keep.json    dungeon 1
  tidewater-grotto.json  dungeon 2
  soundtrack.json     song titles, style notes and original lyrics
  README.md           the content format: tiles, enemies, items, warps
```

After editing anything in `src/` or `content/`, run `python3 build.py` to refresh `index.html`.

## Making your own dungeons

Each dungeon is a single JSON file. To add one, write a new area file, list it in `content/manifest.json`, and point an overworld tile at it with a warp. To try a dungeon without rebuilding, open the in-game menu (the note button) and choose **Play a dungeon file**. **Copy template** gives you a small working example. The full format is in [`content/README.md`](content/README.md).

## Soundtrack

The built-in score is generated live: stomp-and-clap drums, piano, bass, pads and chanted "whoa-oh" vocals, with a different theme for each area. Each theme also has original English lyrics and a style description in `content/soundtrack.json`. You can make a sung version with any music app and load it into its slot from the in-game menu. Loaded songs are saved in your browser.

---

Made with Claude.
