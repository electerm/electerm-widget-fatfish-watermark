# Fatfish Terminal Watermark

[中文](README_CN.md)

Replaces electerm's built-in white `electerm` wordmark with a **pixel-art
大肥鱼 / DeepSeek whale-girl**. The sprite is pixelated first, then turned into
a low-contrast watermark — no hand-drawn line art, no blurry downscale.

Open [`preview.html`](preview.html) locally to compare the two widget styles
across six terminal themes, or see the intermediate 8-colour sprite.

| | |
| --- | --- |
| Shape | instance widget, one switch, two numeric knobs, two artwork styles |
| Needs | electerm with **Settings → Widgets** |
| Art | `assets/fatfish-pixel-art.png` (colour) + `assets/fatfish-watermark.png` (mask) |
| Unit tests | `npm test` — 10 specs, no dependencies, no install |
| Rebuild art | `npm run build` — no dependencies, no network |

## Install

**Settings → Widgets → Import**, then paste:

```text
electerm/electerm-widget-fatfish-watermark
```

Or use **Import folder** against a local clone.

## Use

**Settings → Widgets → Fatfish Terminal Watermark** → **Start widget**. Leave
*Apply on launch* on and electerm's auto-run list re-applies it at every start;
**Stop** in *Running instances* takes it off.

| Option | Default | Meaning |
| --- | --- | --- |
| Artwork style | Colour pixel art | The 8-colour sprite, or a theme-colour mask (see below). |
| Opacity (%) | 20 | Strength, clamped to 5–60. The colour style is drawn 1.4× stronger. |
| Height (%) | 78 | Height relative to the terminal pane; width follows the artwork. |
| Apply on launch | on | Puts the widget in electerm's auto-run list. |

## The two-step artwork

`tools/build-watermark.js` is a zero-dependency PNG codec (node:zlib) plus two
small passes over an RGBA buffer. Both outputs are 510 × 680 and reproducible.

1. **Pixelate.** `assets/source-front.png` (the MIT-licensed chibi sprite) is
   reduced to a 51 × 68 grid. Each cell keeps its average colour, composited
   onto white, and is snapped to one of eight flat colours: deep blue hair,
   bright blue tips, white headdress/apron, ink outline, skin, gold trim. Cells
   are expanded to solid 10px squares — crisp pixel art with a transparent
   background → `assets/fatfish-pixel-art.png`.
2. **Watermark.** Every cell's colour maps to one of six ink levels
   (`0 / .13 / .34 / .58 / .82 / .98`) in neutral grey `#8f8f8f`. The result is
   a shape-only alpha mask → `assets/fatfish-watermark.png` (about 7 KB).

Want a different pixel size? `npm run build -- --grid=64x85 --cell=8`.
`node tools/build-watermark.js --style=line` rebuilds the earlier Sobel
line-art look for comparison (it overwrites the mask only).

## Why it works on every background colour

The built-in watermark is a fixed near-white PNG, almost invisible on a light
theme. Two ways out, both shipped:

- **Colour pixel art (default).** Its ink spans white headdress and apron to
  near-black outlines, so on a dark, light, or coloured terminal background
  some part of the sprite always contrasts. It stays at 28% opacity, behind the
  text.
- **Theme-colour mask.** The mono PNG is used as a CSS `mask-image` and painted
  with `var(--text, #dddddd)`, electerm's own theme text colour. Text colour
  always has to contrast with the terminal background, so the watermark does
  too — strict theme matching, no `mix-blend-mode` guessing.

The mono PNG's neutral-grey ink also means the file itself is readable on black
and white if you set it directly as a terminal background image.

### It does not fight your own background setting

A widget's UI is a sandboxed iframe and cannot touch the app's DOM; `main.js`
runs in the main process, so `webContents.insertCSS()` styles electerm's window
from outside. A second, tiny renderer script reads electerm's own
`#css-overwrite-terminal-backgrounds` stylesheet and sets two attributes on
`<html>`: `data-fatfish-style` (chosen in the form) and
`data-fatfish-watermark`:

- built-in default wordmark → `"on"`, our sheet matches;
- your own background image / text / tab index / "no background" → `"off"`,
  our sheet stops matching entirely.

The switch is a `MutationObserver` on that one `<style>` tag, so changing the
background setting takes effect immediately. Inserted CSS lives in the current
document, so every window reload re-inserts it, and later windows are covered.

## Artwork

The chibi whale-girl is community fan art, **not** an official DeepSeek asset.
Source, licence, modification notes and the required attribution are in
[NOTICE.md](NOTICE.md). Code in this repository is MIT; the artwork keeps its
upstream MIT licence.

## Notes

- Standalone: it does not read or write the built-in **Settings → Common →
  Custom CSS** setting, nor any terminal-background setting. The only thing
  electerm stores is the widget's own auto-run entry and form values.
- **Stop removes it properly**: each `insertCSS` key is kept per window and
  inserts are queued, so two overlapping inserts cannot leave an unremovable
  stylesheet behind.
- Both PNGs are inlined as data URLs, so the whole injected stylesheet is only
  ~22 KB — the pixel palette compresses far better than a line drawing did.

## License

MIT for the code. See [NOTICE.md](NOTICE.md) for the artwork's upstream MIT
licence and attribution.
