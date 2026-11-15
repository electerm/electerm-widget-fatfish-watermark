# Fatfish Terminal Watermark

[中文](README_CN.md)

Replaces electerm's built-in white `electerm` wordmark with a **大肥鱼 / DeepSeek
whale-girl** watermark. Two artwork styles: the original MIT-licensed sprite
(the default) and an 8-colour pixel-art version of it.

Open [`preview.html`](preview.html) locally to compare both styles against a
no-watermark baseline, across six terminal themes.

| | |
| --- | --- |
| Shape | instance widget, one switch, two numeric knobs, two artwork styles |
| Needs | electerm with **Settings → Widgets** |
| Art | `assets/source-front.png` (original, default) + `assets/fatfish-pixel-art.png` (pixel) |
| Unit tests | `npm test` — 9 specs, no dependencies, no install |
| Rebuild art | `npm run build` — no dependencies, no network |

## Install

In electerm, open **Settings → Widgets → Online** and install *Fatfish Terminal
Watermark* from the list. The registry pins one commit and the app verifies the
hash of every file before copying anything.

Alternatively, **Settings → Widgets → Import** and paste:

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
| Artwork style | Original PNG | The untouched source sprite, or its 8-colour pixel version (see below). |
| Opacity (%) | 20 | Strength, clamped to 5–60; drawn at 1.4× the number so it reads as strongly as a mask did. |
| Height (%) | 78 | Height relative to the terminal pane; width follows the artwork. |
| Apply on launch | on | Puts the widget in electerm's auto-run list. |

## The artwork

`tools/build-watermark.js` is a zero-dependency PNG codec (node:zlib) plus a
small reduction pass over an RGBA buffer. Only the pixel version is generated;
the original sprite is shipped as-is.

**Pixelate.** `assets/source-front.png` (the MIT-licensed chibi sprite) is
reduced to a 51 × 68 grid. Each cell keeps its average colour, composited onto
white, and is snapped to one of eight flat colours: deep blue hair, bright blue
tips, white headdress/apron, ink outline, skin, gold trim. Cells are expanded to
solid 10px squares — crisp pixel art on a transparent background →
`assets/fatfish-pixel-art.png` (510 × 680, about 7.6 KB).

Want a different pixel size? `npm run build -- --grid=64x85 --cell=8`.

### Original PNG (default)

`Original PNG` skips the reduction and paints `assets/source-front.png` itself
(255 × 340), capped at its own 340px height so a tall terminal window never
upscales it into a blur.

Both styles are full-colour, so neither uses a CSS mask: the sprite's ink spans
white headdress and apron to near-black outline, and that light-to-dark range is
what keeps it legible. Inlining the selected PNG only — never both — keeps the
injected sheet at **12 KB** for the pixel style and **201 KB** for the original,
instead of 213 KB in every window.

## Why it works on every background colour

The built-in watermark is a fixed near-white PNG, almost invisible on a light
theme. Both styles fix that the same way: the illustration already contains
whites and near-blacks, so on a dark, light or coloured terminal background some
part of the sprite always contrasts. It stays at 28% opacity, behind the text,
and the app's own `background-color: transparent !important` on that layer is
preserved.

Pick the pixel style if you want a chunkier, flatter look and a 12 KB sheet; the
original is the default because it is the actual illustration.

### It does not fight your own background setting

The stylesheet is applied to electerm's own document, and its selectors require
`<html data-terminal-background="default">` — the attribute electerm sets while
it paints its built-in wordmark. Your own background image, text, tab index or
"no background" makes it `custom`, and every rule here stops matching. Plain
css, no script in the app document.

The stylesheet lives with the running instance, so the host re-applies it to
every window that loads while the widget runs, and removes it on **Stop**.

### What it needs from the host

`main.js` is a plain node module that reads its own files and calls
`require('@electerm/widget-api').css.apply(css)`. It does not `require`
`electron`, so nothing here is desktop-only: the same folder works in
electerm-web, where the app document belongs to a browser.

## Artwork

The chibi whale-girl is community fan art, **not** an official DeepSeek asset.
Source, licence, modification notes and the required attribution are in
[NOTICE.md](NOTICE.md). Code in this repository is MIT; the artwork keeps its
upstream MIT licence.

## Notes

- Standalone: it does not read or write the built-in **Settings → Common →
  Custom CSS** setting, nor any terminal-background setting. The only thing
  electerm stores is the widget's own auto-run entry and form values.
- **Stop removes it properly**: the stylesheet belongs to the running instance,
  so stopping it, deleting the widget or quitting the app cannot leave one
  behind.
- One image per style, chosen before substitution: switching the form re-reads
  one file and rebuilds the sheet, so a window never carries artwork it is not
  showing.

## License

MIT for the code. See [NOTICE.md](NOTICE.md) for the artwork's upstream MIT
licence and attribution.
