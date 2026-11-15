#!/usr/bin/env python3
"""Build the CrazyGames upload folder.

    python3 tools/build.py

Creates:
    crazygames-upload/game/            the game, exactly as it should be uploaded (index.html at the root)
    crazygames-upload/starpulse.zip    the same files zipped, for the developer portal's upload field

Cover images are rendered separately with: node tools/covers.cjs   (needs the dev server running)
"""
import os, re, shutil, zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'crazygames-upload')
GAME = os.path.join(OUT, 'game')
ZIP = os.path.join(OUT, 'starpulse.zip')
SDK_TAG = '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>'

shutil.rmtree(GAME, ignore_errors=True)
os.makedirs(GAME)

# index.html: load the CrazyGames SDK with a plain script tag in <head>, as the SDK docs show.
# js/sdk.js sees it is already loaded and goes straight to SDK.init().
html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
if SDK_TAG not in html:
    html = re.sub(r'(<link rel="stylesheet")', SDK_TAG + '\n\\1', html, count=1)
open(os.path.join(GAME, 'index.html'), 'w', encoding='utf-8').write(html)

for d in ('css', 'js', 'fonts'):
    shutil.copytree(os.path.join(ROOT, d), os.path.join(GAME, d))

files = []
for base, _, names in os.walk(GAME):
    for n in sorted(names):
        full = os.path.join(base, n)
        files.append((full, os.path.relpath(full, GAME).replace(os.sep, '/')))
files.sort(key=lambda f: f[1])

if os.path.exists(ZIP):
    os.remove(ZIP)
with zipfile.ZipFile(ZIP, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for full, rel in files:
        z.write(full, rel)

raw = sum(os.path.getsize(f) for f, _ in files)
print(f'{GAME}: {len(files)} files, {raw / 1024:.0f} KB')
print(f'{ZIP}: {os.path.getsize(ZIP) / 1024:.0f} KB')
