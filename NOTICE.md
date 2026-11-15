# NOTICE — artwork provenance and attribution

## Source of the artwork

| | |
| --- | --- |
| File shipped here | `assets/source-front.png` (255 × 340, RGBA) |
| Upstream | [1190fasheqi/dafeiyu-pet](https://github.com/1190fasheqi/dafeiyu-pet) — `sprites/正面.png` |
| Pinned commit | `5b0e01856116bd2bae82df1f43c32faa5f056196` (2026-08-11) |
| Upstream licence | MIT (GitHub reports `MIT`; full text below) |
| Upstream copyright | `Copyright (c) 2026` (as written in the upstream LICENSE) |

The same sprite is also redistributed as `assets/whale_front.png` by
[DViridescent/dafy-whale-theme](https://github.com/DViridescent/dafy-whale-theme),
whose NOTICE credits the repo above. The copy here was taken directly from the
upstream repository, not from that theme.

## Modifications

Two files here are **modified derivatives** of the sprite, both built by
`tools/build-watermark.js`:

- `assets/fatfish-pixel-art.png` — the sprite reduced to a 51 × 68 grid of
  solid 10px squares, each snapped to one of eight flat colours (blue hair at
  three depths, white headdress/apron, ink outline, skin, gold trim), on a
  transparent background. 510 × 680.
- `assets/fatfish-watermark.png` — the same grid with every colour mapped to
  one of six ink levels in neutral grey (`#8f8f8f`) on transparent pixels.
  510 × 680. It is a shape-only alpha mask, not the original illustration.

Neither is presented as the upstream author's work. The mask is used by the
widget as a CSS `mask-image`; its ink colour is replaced at runtime by
electerm's theme text colour. A `--style=line` build option can still produce
the earlier Sobel line-art look (2× upscale, luminance edge detection, 16-level
alpha quantisation) for comparison; that output is not shipped.

## Character and trademark credits

「大肥鱼 / 鲸鱼娘」 is community fan art derived from DeepSeek's whale logo.
Per community accounts, the underlying original character 「溟月」 is by
上善无形, and the DeepSeek-flavoured chibi / maid redesign was started by Bilibili
creator ZipZipPipe and continued by many other contributors. DeepSeek and its
whale logo belong to their respective owner.

This is an **unofficial, non-commercial fan-art watermark**. It is not endorsed
by, affiliated with, or sponsored by DeepSeek or by the original character
artists. Brand / character rights are separate from the MIT grant on the sprite
files; anyone redistributing this artwork at scale or in a commercial product
should make their own assessment of those rights.

Several other community repositories carry the character under
CC BY-NC-SA or custom attribution terms. Those assets were **deliberately not
used here**; only the MIT-licensed sprite above is shipped.

## Upstream MIT licence (verbatim)

```text
MIT License

Copyright (c) 2026

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Code written for this widget (`main.js`, `lib/`, `tools/`, `test/`,
`style.css`, `preview.html`) is MIT, see [LICENSE](LICENSE).
