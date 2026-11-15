# Fatfish Terminal Watermark

[中文](README_CN.md)

Replaces electerm's built-in white `electerm` wordmark with a line-art
**大肥鱼 / DeepSeek whale-girl** watermark that follows your theme's text
colour — so it stays visible and quiet on dark, light, and coloured terminal
backgrounds.

Open [`preview.html`](preview.html) locally to see the same artwork on six
background colours, with a toggle for "theme colour", "PNG as image" and "no
watermark".

| | |
| --- | --- |
| Shape | instance widget, one switch, two numeric knobs |
| Needs | electerm with **Settings → Widgets** |
| Shipped art | `assets/fatfish-watermark.png` (510 × 680, transparent RGBA) |
| Unit tests | `npm test` — no dependencies, no install |
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
| Opacity (%) | 20 | Strength of the watermark, clamped to 5–60. |
| Height (%) | 78 | Height relative to the terminal pane; width follows the artwork. |
| Apply on launch | on | Puts the widget in electerm's auto-run list. |

## Why it works on every background colour

The built-in watermark is a fixed near-white PNG. On a light theme it is
almost invisible. This widget splits shape from colour:

- `assets/fatfish-watermark.png` is a **shape only** — a line drawing with a
  transparent background, converted from the open-source chibi sprite by
  `tools/build-watermark.js`.
- The injected stylesheet uses it as a CSS `mask-image` and paints the mask
  with `var(--text, #dddddd)`, electerm's own theme text colour. Text colour
  always has to contrast with the terminal background, so the watermark does
  too. No `mix-blend-mode` guessing, no white-on-white.
- The PNG's own ink is a neutral grey (`#8f8f8f`), so if you set the file
  directly as a terminal background image (Settings → Terminal background),
  it is still readable on both black and white. The widget path is the
  adaptive one.

The core of `style.css` (`-webkit-` prefixes omitted; placeholders are filled
in by `main.js`):

```css
:root[data-fatfish-watermark="on"] #container .session-batch-active .xterm-screen::before {
  background-image: none !important;
  background-color: var(--text, #dddddd) !important;
  -webkit-mask-image: url("…png data URL…");
  mask-image: url("…png data URL…");
  mask-size: auto 78%;
  mask-position: center;
  mask-repeat: no-repeat;
  opacity: 0.2;
}
```

### It does not fight your own background setting

A widget's UI is a sandboxed iframe and cannot touch the app's DOM; `main.js`
runs in the main process, so `webContents.insertCSS()` styles electerm's window
from outside. A second, tiny renderer script reads electerm's own
`#css-overwrite-terminal-backgrounds` stylesheet and sets one attribute on
`<html>`:

- built-in default wordmark → `data-fatfish-watermark="on"`, our sheet matches;
- your own background image / text / tab index / "no background" → `"off"`,
  our sheet stops matching entirely.

The switch is a `MutationObserver` on that one `<style>` tag, so changing the
background setting in Settings takes effect immediately without restarting the
widget. Inserted CSS lives in the current document, so every window reload
re-inserts it, and windows opened later are covered too.

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
- To reproduce the PNG, run `npm run build`. `tools/build-watermark.js` is a
  zero-dependency PNG codec (node:zlib), 2× upscaler, Sobel line detector and
  alpha quantiser — it reads `assets/source-front.png` and rewrites
  `assets/fatfish-watermark.png` deterministically.

## License

MIT for the code. See [NOTICE.md](NOTICE.md) for the artwork's upstream MIT
licence and attribution.
