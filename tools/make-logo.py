#!/usr/bin/env python3
"""
Regenerate every logo asset from the master Logo.png.

    python tools/make-logo.py

Logo.png contains TWO lockups side by side: the stacked wordmark on the left
and the rounded GE app icon on the right. This script splits them, knocks the
white card out from the outside edges only (so the white G inside the icon
survives), and writes every size the site needs into site/images/.

Outputs
    icon-{16,32,48,64,96,180,192,512}.png   header logo + favicons
    favicon.ico                             multi-resolution, legacy browsers
    logo.png                                512px icon, for schema.org
    wordmark-{300,600}.png                  dark lockup, for light backgrounds
    wordmark-light-{300,600}.png            reversed lockup, for the footer
"""
from PIL import Image
from collections import deque
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC  = os.path.join(ROOT, "Logo.png")
IMG  = os.path.join(ROOT, "site", "images")

# Bounds of the artwork inside the master file, and the split between lockups
ARTWORK   = (67, 186, 1471, 799)
SPLIT_END = 951     # wordmark occupies 0..951 of the trimmed artwork
ICON_START = 1079   # icon starts here

BRAND_GREEN = (11, 77, 37)


def clear_outside(img, thresh=232):
    """Flood-fill transparency inward from the border.

    Deliberately NOT a global white-to-alpha swap: the icon's G is solid white
    and would be punched into a hole. Only white connected to an outside edge
    is removed.
    """
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    seen = [[False] * w for _ in range(h)]
    q = deque()

    def is_white(x, y):
        r, g, b, _ = px[x, y]
        return r >= thresh and g >= thresh and b >= thresh

    for x in range(w):
        for y in (0, h - 1):
            if is_white(x, y) and not seen[y][x]:
                seen[y][x] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if is_white(x, y) and not seen[y][x]:
                seen[y][x] = True
                q.append((x, y))

    while q:
        x, y = q.popleft()
        px[x, y] = (255, 255, 255, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and is_white(nx, ny):
                seen[ny][nx] = True
                q.append((nx, ny))

    return img.crop(img.getbbox())


def save_png(img, path, colors=64):
    """Quantise. These are flat-colour marks; 24-bit is wasted bytes."""
    rgba = img.convert("RGBA")
    alpha = rgba.split()[-1]
    out = rgba.convert("RGB").quantize(colors=colors, method=Image.MEDIANCUT).convert("RGBA")
    out.putalpha(alpha)
    out.save(path, optimize=True)


def reverse_colours(img):
    """Green -> white, grey -> light grey, for use on dark backgrounds.
    Keeps the two-tone reading rather than flattening to a silhouette."""
    out = img.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a < 8:
                continue
            if g > r + 12 and g > b + 12:
                px[x, y] = (255, 255, 255, a)
            else:
                px[x, y] = (200, 206, 200, a)
    return out


def main():
    os.makedirs(IMG, exist_ok=True)
    art = Image.open(SRC).convert("RGBA").crop(ARTWORK)
    wordmark = art.crop((0, 0, SPLIT_END, art.height))
    icon = art.crop((ICON_START, 0, art.width, art.height))

    # --- icon, squared on a transparent canvas ---
    ic = clear_outside(icon)
    side = max(ic.size)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(ic, ((side - ic.width) // 2, (side - ic.height) // 2), ic)

    for size in (512, 192, 180, 96, 64, 48, 32, 16):
        save_png(sq.resize((size, size), Image.LANCZOS),
                 os.path.join(IMG, "icon-%d.png" % size))
        print("  icon-%d.png" % size)

    save_png(sq.resize((512, 512), Image.LANCZOS), os.path.join(IMG, "logo.png"))
    sq.resize((256, 256), Image.LANCZOS).save(
        os.path.join(IMG, "favicon.ico"),
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("  favicon.ico, logo.png")

    # --- wordmark, dark and reversed ---
    wm = clear_outside(wordmark)
    light = reverse_colours(wm)
    for w in (600, 300):
        h = round(w * wm.height / wm.width)
        save_png(wm.resize((w, h), Image.LANCZOS),
                 os.path.join(IMG, "wordmark-%d.png" % w))
        save_png(light.resize((w, h), Image.LANCZOS),
                 os.path.join(IMG, "wordmark-light-%d.png" % w))
        print("  wordmark-%d.png, wordmark-light-%d.png" % (w, w))

    print("\nDone. Run 'python build.py' to refresh the cache fingerprints.")


if __name__ == "__main__":
    main()
