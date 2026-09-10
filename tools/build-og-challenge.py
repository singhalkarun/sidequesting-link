#!/usr/bin/env python3
"""Crop the app's challenge hero into the 1200x630 card unfurlers want.

The card image for /c/<slug> is the same photograph the app shows at the top of
the challenge page, so the link and the screen agree. Source is 1290x750
(1.72:1); og wants 1.91:1, so height is what gives. The two walkers sit in the
upper two thirds and the bottom of the frame is cobblestone, so the crop is
taken from the TOP — it loses pavement, never people.

    python3 tools/build-og-challenge.py

Re-run only if assets/images/challenge-hero.jpg changes in the app repo.
"""
from PIL import Image
import pathlib, sys

SRC = pathlib.Path.home() / 'Desktop/projects/sidequesting/assets/images/challenge-hero.jpg'
OUT = pathlib.Path(__file__).resolve().parent.parent / 'og-challenge.jpg'

if not SRC.exists():
    sys.exit(f'hero not found: {SRC}')

src = Image.open(SRC)
W, H = src.size
crop_h = round(W / (1200 / 630))
if crop_h > H:
    sys.exit(f'source {W}x{H} is too short to crop to 1.91:1 (needs {crop_h})')

out = src.crop((0, 0, W, crop_h)).resize((1200, 630), Image.LANCZOS).convert('RGB')
out.save(OUT, 'JPEG', quality=86, optimize=True, progressive=True)
print(f'{OUT.name}  {out.size[0]}x{out.size[1]}  {OUT.stat().st_size // 1024}KB')
