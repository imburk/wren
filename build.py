#!/usr/bin/env python3
"""Build index.html from src/ and content/.

    python3 build.py

src/game.html   the 2D engine, menus, audio and level system
src/world3d.js  the 3D engine used for the Lv 3 and Lv 4 eras
content/*.json  the world: overworld, dungeons, relics, soundtrack

The built index.html loads content/ at runtime when it's served over HTTP,
and also embeds a copy of it so the game still works when opened as a file.
"""
import json
import os

root = os.path.dirname(os.path.abspath(__file__))
content = os.path.join(root, 'content')

manifest = json.load(open(os.path.join(content, 'manifest.json')))
names = manifest['areas'] + ([manifest['soundtrack']] if manifest.get('soundtrack') else [])
files = {name: json.load(open(os.path.join(content, name))) for name in names}

builtin = json.dumps({'manifest': manifest, 'files': files}, separators=(',', ':')).replace('</', '<\\/')
game = open(os.path.join(root, 'src', 'game.html')).read()
world3d = open(os.path.join(root, 'src', 'world3d.js')).read().replace('</script', '<\\/script')

assert '/*BUILTIN*/' in game and '<script>/*W3D*/</script>' in game, 'placeholders missing from src/game.html'
out = game.replace('/*BUILTIN*/', builtin).replace('<script>/*W3D*/</script>', '<script>' + world3d + '</script>')

with open(os.path.join(root, 'index.html'), 'w') as f:
    f.write(out)
print(f'built index.html ({len(out):,} bytes) from {len(files)} content files')
