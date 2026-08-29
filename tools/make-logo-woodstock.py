#!/usr/bin/env python3
"""
Regenerate logo/favicon/social assets for Woodstock from the circular badge
master (Woodstock Logo Favicon.png). This master is a single circular lockup
(icon + wordmark combined), unlike the Grimsby two-part master, so it does not
use tools/make-logo.py's split logic. Custom, narrow script for this city only.
"""
from PIL import Image, ImageDraw
from collections import deque
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "Woodstock Logo Favicon.png")
IMG = os.path.join(ROOT, "site", "images")
os.makedirs(IMG, exist_ok=True)

PRIMARY_DARK = (12, 14, 16)  # matches --color-primary-dark in style.css


def clear_outside(img, thresh=235):
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    seen = [[False]*w for _ in range(h)]
    q = deque()

    def is_white(x, y):
        r, g, b, _ = px[x, y]
        return r >= thresh and g >= thresh and b >= thresh

    for x in range(w):
        for y in (0, h-1):
            if is_white(x, y) and not seen[y][x]:
                seen[y][x] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w-1):
            if is_white(x, y) and not seen[y][x]:
                seen[y][x] = True
                q.append((x, y))
    while q:
        x, y = q.popleft()
        r, g, b, a = px[x, y]
        px[x, y] = (r, g, b, 0)
        for nx, ny in ((x+1, y), (x-1, y), (x, y+1), (x, y-1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and is_white(nx, ny):
                seen[ny][nx] = True
                q.append((nx, ny))
    return img


def trim_alpha(img):
    bbox = img.getbbox()
    return img.crop(bbox) if bbox else img


def square_canvas(img, size, pad=0.08):
    """Paste img (any aspect) centered onto a transparent square canvas."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inner = int(size * (1 - pad*2))
    scaled = img.copy()
    scaled.thumbnail((inner, inner), Image.LANCZOS)
    x = (size - scaled.width)//2
    y = (size - scaled.height)//2
    canvas.paste(scaled, (x, y), scaled)
    return canvas


def flat_on_color(img, size, color):
    bg = Image.new("RGB", (size, size), color)
    scaled = img.copy()
    scaled.thumbnail((int(size*0.92), int(size*0.92)), Image.LANCZOS)
    x = (size - scaled.width)//2
    y = (size - scaled.height)//2
    bg.paste(scaled, (x, y), scaled)
    return bg


master = Image.open(SRC).convert("RGB")
badge = clear_outside(master)
badge = trim_alpha(badge)
print("trimmed badge size", badge.size)

# --- favicons / header icon --------------------------------------------
sizes = [16, 32, 48, 64, 96, 180, 192, 512]
pngs = {}
for s in sizes:
    im = square_canvas(badge, s, pad=0.03)
    im.save(os.path.join(IMG, f"icon-{s}.png"))
    pngs[s] = im
    print("wrote icon-%d.png" % s)

# favicon.ico - multi-res
ico_sizes = [16, 32, 48]
pngs[16].save(os.path.join(IMG, "favicon.ico"),
              sizes=[(s, s) for s in ico_sizes])
print("wrote favicon.ico")

# --- logo.jpg (schema, flattened on white) ------------------------------
logo_jpg = flat_on_color(badge, 512, (255, 255, 255))
logo_jpg.save(os.path.join(IMG, "logo.jpg"), quality=90)
print("wrote logo.jpg")

# --- og-image.jpg (1200x630 social share) --------------------------------
og = Image.new("RGB", (1200, 630), PRIMARY_DARK)
badge_for_og = badge.copy()
badge_for_og.thumbnail((520, 520), Image.LANCZOS)
og.paste(badge_for_og, ((1200-badge_for_og.width)//2, (630-badge_for_og.height)//2), badge_for_og)
og.save(os.path.join(IMG, "og-image.jpg"), quality=88)
print("wrote og-image.jpg")

# --- wordmark (light backgrounds, e.g. hero/body) ------------------------
for s in (300, 600):
    im = square_canvas(badge, s, pad=0.04)
    im.save(os.path.join(IMG, f"wordmark-{s}.png"))
    print("wrote wordmark-%d.png" % s)

# --- wordmark-light (dark footer) - badge on a soft white chip -----------
for s in (300, 600):
    chip = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(chip)
    pad = int(s*0.03)
    d.ellipse([pad, pad, s-pad, s-pad], fill=(255, 255, 255, 235))
    badge_scaled = badge.copy()
    badge_scaled.thumbnail((int(s*0.90), int(s*0.90)), Image.LANCZOS)
    chip.paste(badge_scaled, ((s-badge_scaled.width)//2, (s-badge_scaled.height)//2), badge_scaled)
    chip.save(os.path.join(IMG, f"wordmark-light-{s}.png"))
    print("wrote wordmark-light-%d.png" % s)

print("\nDone. All assets written to", IMG)
