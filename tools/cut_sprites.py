"""Turns generated sprite renders into game-ready transparent PNGs.

Usage: python3 tools/cut_sprites.py RAW_DIR

RAW_DIR holds the raw AI renders named after the sprite they become
(cube0.png ... cube4.png, box.png, box2.png, rocket.png, bomb.png, disco.png,
hammer.png, shuffle.png, bg.png), as rendered by tools/gen_sprites.py. The
background colour is read from the image border and flood-filled away from
the edges, so a plain white or grey studio backdrop and its soft
shadow are removed while light areas inside the object are kept.
"""

import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "www" / "img"
SIZE = 256


def largest_blobs(fg, keep=0.05):
    """Drops foreground specks: keeps components at least `keep` of the largest."""
    h, w = fg.shape
    labels = np.zeros((h, w), np.int32)
    sizes = [0]
    for sy, sx in zip(*np.nonzero(fg)):
        if labels[sy, sx]:
            continue
        label = len(sizes)
        labels[sy, sx] = label
        queue = deque([(sy, sx)])
        count = 0
        while queue:
            y, x = queue.popleft()
            count += 1
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and fg[ny, nx] and not labels[ny, nx]:
                    labels[ny, nx] = label
                    queue.append((ny, nx))
        sizes.append(count)
    sizes = np.array(sizes)
    good = sizes >= sizes.max() * keep
    good[0] = False
    return good[labels]


def background_mask(rgb, tolerance, shadows=True):
    h, w, _ = rgb.shape
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, axis=0)
    px = rgb.astype(float)
    close = np.linalg.norm(px - bg, axis=2) < tolerance
    # Soft drop shadows: colourless pixels a bit darker than the backdrop.
    chroma = px.max(axis=2) - px.min(axis=2)
    value = px.mean(axis=2)
    bg_value = bg.mean()
    if shadows:
        close |= (chroma < 28) & (value > bg_value * 0.55) & (value < bg_value + 15)
    mask = np.zeros((h, w), bool)
    queue = deque()
    for x in range(w):
        for y in (0, h - 1):
            if close[y, x] and not mask[y, x]:
                mask[y, x] = True
                queue.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if close[y, x] and not mask[y, x]:
                mask[y, x] = True
                queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and close[ny, nx] and not mask[ny, nx]:
                mask[ny, nx] = True
                queue.append((ny, nx))
    return mask


def rounded_rect_mask(shape, box, radius):
    h, w = shape
    x0, y0, x1, y1 = box
    yy, xx = np.mgrid[:h, :w]
    # Distance outside the inner rectangle, compared with the corner radius.
    dx = np.maximum(np.maximum(x0 + radius - xx, xx - (x1 - radius)), 0)
    dy = np.maximum(np.maximum(y0 + radius - yy, yy - (y1 - radius)), 0)
    return dx * dx + dy * dy <= radius * radius


def cut(path, tolerance=40, circle=False, saturate=1.0, shadows=True, keep=0.05, rounded=False):
    img = Image.open(path).convert("RGB")
    # Work at 1024px: plenty for a 256px sprite and keeps the flood fill fast.
    img.thumbnail((1024, 1024))
    if saturate != 1.0:
        img = ImageEnhance.Color(img).enhance(saturate)
    rgb = np.asarray(img)
    fg = largest_blobs(~background_mask(rgb, tolerance, shadows), keep)
    alpha = np.where(fg, 255, 0).astype(np.uint8)

    if circle:
        # Keep only the ball: find its widest extent and mask a circle, which
        # drops stands, strings and spikes that stick out of it.
        rows = (alpha > 0).sum(axis=1)
        # Look for the widest row in the upper part only, so a flat shadow or
        # stand under the ball is never mistaken for its equator.
        ys = np.nonzero(rows)[0]
        upper = rows.copy()
        upper[int(ys[0] + (ys[-1] - ys[0]) * 0.8):] = 0
        widest = int(np.argmax(upper))
        xs = np.nonzero(alpha[widest] > 0)[0]
        cx = (xs[0] + xs[-1]) / 2
        radius = (xs[-1] - xs[0]) / 2
        cy = widest  # a sphere is widest at its centre
        yy, xx = np.mgrid[: alpha.shape[0], : alpha.shape[1]]
        outside = (yy - cy) ** 2 + (xx - cx) ** 2 > (radius * 0.98) ** 2
        if circle == "keep_top":
            outside &= yy > cy - radius * 0.7  # keep a fuse sticking out on top
        alpha[outside] = 0

    if rounded:
        # Cubes are rounded squares: clip to the box around the strongly
        # coloured pixels, which cuts away any leftover shadow or halo.
        px = rgb.astype(float)
        vivid = (px.max(axis=2) - px.min(axis=2) > 70) & (alpha > 0)
        ys, xs = np.nonzero(vivid)
        box = (np.percentile(xs, 0.2), np.percentile(ys, 0.2), np.percentile(xs, 99.8), np.percentile(ys, 99.8))
        radius = min(box[2] - box[0], box[3] - box[1]) * 0.2
        alpha[~rounded_rect_mask(alpha.shape, box, radius)] = 0

    a = Image.fromarray(alpha).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    rgba = img.copy()
    rgba.putalpha(a)
    bbox = a.point(lambda v: 255 if v > 40 else 0).getbbox()
    rgba = rgba.crop(bbox)

    # Fit into a square canvas with a small margin, centred.
    side = max(rgba.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(rgba, ((side - rgba.width) // 2, (side - rgba.height) // 2))
    return canvas.resize((SIZE, SIZE), Image.LANCZOS)


def main(raw):
    raw = Path(raw)
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = {f"cube{i}": {"rounded": True} for i in range(5)}
    jobs["cube4"]["saturate"] = 1.6  # the purple render came out pastel
    jobs.update({
        "box": {},
        "box2": {},
        "rocket": {"tolerance": 30},
        "bomb": {"tolerance": 30, "shadows": False, "keep": 0.3, "circle": "keep_top"},
        "disco": {"circle": True, "shadows": False},
        "hammer": {"tolerance": 30},
        "shuffle": {"tolerance": 30},
    })
    for name, opts in jobs.items():
        src = raw / f"{name}.png"
        if not src.exists():
            print(f"skip {name} (missing)")
            continue
        cut(src, **opts).save(OUT / f"{name}.png", optimize=True)
        print(f"wrote img/{name}.png")

    bg = raw / "bg.png"
    if bg.exists():
        img = Image.open(bg).convert("RGB").resize((720, 1280), Image.LANCZOS)
        img = ImageEnhance.Brightness(img).enhance(0.9)
        img.save(OUT / "bg.jpg", quality=80, optimize=True)
        print("wrote img/bg.jpg")


if __name__ == "__main__":
    main(sys.argv[1])
