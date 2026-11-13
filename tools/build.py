#!/usr/bin/env python3
"""Package the game for upload to CrazyGames: python3 tools/build.py -> dist/starpulse.zip"""
import os, zipfile
root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
out = os.path.join(root, 'dist', 'starpulse.zip')
os.makedirs(os.path.dirname(out), exist_ok=True)
files = ['index.html'] + [os.path.join(d, f) for d in ('css', 'js', 'fonts') for f in sorted(os.listdir(os.path.join(root, d)))]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for f in files:
        z.write(os.path.join(root, f), f)
print(f'{out}: {len(files)} files, {os.path.getsize(out) / 1024:.0f} KB')
