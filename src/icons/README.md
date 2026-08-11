# Icons

## Table of Contents

- [Summary](#summary)
- [Required files](#required-files)
- [Design brief](#design-brief)
- [How to produce them](#how-to-produce-them)

---

## Summary

All four PNGs are present and the extension loads. The current set is a
first-pass design: a path forking away from a crossed-out route.

It holds up at 128px, which is the size the Chrome Web Store listing displays.
At 16px — the toolbar size — the fork and the X blur together into a single
mark. That is a legibility limit worth revisiting, not a blocker; the silhouette
still reads as a diverging path.

The design brief below is retained for whoever redraws them.

---

## Required files

| File | Size | Used for |
|---|---|---|
| `icon-16.png` | 16×16 | Favicon, context menus |
| `icon-32.png` | 32×32 | Windows display scaling |
| `icon-48.png` | 48×48 | Extensions management page |
| `icon-128.png` | 128×128 | Installation dialog, Web Store listing |

All four must be PNG with transparency. Square, no padding baked in beyond the
optical margin described below.

---

## Design brief

The extension is a calm pause, not an alarm. The icon should not read as a
warning, a block sign, or a prohibition symbol — those signal punishment, which
is the wrong emotional register and also invites Web Store confusion with
security extensions.

**Concept directions, strongest first:**

1. **A curve around an obstacle** — a line that bends smoothly aside rather than
   stopping. Literally steering clear. Reads well at 16px because it is one
   continuous stroke.
2. **A fork in a path** — two divergent lines from one origin, the chosen one
   weighted heavier.
3. **A hand-drawn detour arrow** — softer than a road sign, keeps it human.

**Palette** — matches the UI accent already in the CSS:

- Primary accent: `#2f6f5e` (deep green)
- Dark-mode accent: `#6fbfa5` (light green)
- Background: transparent, or `#f7f6f3` if a filled tile is preferred

**Constraints:**

- Must remain legible at 16×16 — test by scaling down before committing
- Roughly 10% optical margin on all sides at 128px
- No text or lettering; illegible at small sizes and a common rejection reason

---

## How to produce them

**Fastest path** — generate a 1024×1024 master with any image model, then
downscale:

```bash
# From a 1024x1024 master named icon-master.png
for size in 16 32 48 128; do
  magick icon-master.png -resize ${size}x${size} icon-${size}.png
done
```

Requires ImageMagick (`sudo apt install imagemagick`).

**From an SVG** — better results at small sizes, since hinting is preserved:

```bash
for size in 16 32 48 128; do
  rsvg-convert -w ${size} -h ${size} icon.svg -o icon-${size}.png
done
```

Requires `librsvg2-bin`.

**Commissioned** — for a Web Store launch, a $20–50 Fiverr icon is a reasonable
spend given it is the first thing anyone sees on the listing.

---

## Verify

```bash
# All four present and correctly sized
file icon-*.png
```

Expect four lines reporting the correct dimensions. Then load the extension per
the root `README.md`.
