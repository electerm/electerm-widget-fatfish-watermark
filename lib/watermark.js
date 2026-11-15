/**
 * Pure, dependency-free helpers shared by main.js and the unit tests.
 *
 * Nothing in this file may require('electron') or '@electerm/widget-api':
 * `npm test` runs it under plain node --test.
 */

function clamp (value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) {
    return fallback
  }
  return Math.min(max, Math.max(min, Math.round(n)))
}

/** `original` is the default; `color` is the only other choice. */
function normalizeStyle (style) {
  return style === 'color' ? 'color' : 'original'
}

/**
 * Fill the placeholders in style.css. The image is a data: URL because the
 * stylesheet is applied to electerm's own document, which cannot resolve a path
 * inside the widget's folder.
 *
 * Only the rule for the selected style is kept: the original sprite is 152KB,
 * and inlining it alongside the pixel sprite would put ~225KB into every
 * window for a rule that never matches. One style, one image, ~15KB or ~205KB.
 */
function buildCss (template, opts = {}) {
  const {
    style = 'original',
    imageDataUrl = '',
    opacity = 20,
    size = 78
  } = opts
  const keep = normalizeStyle(style) === 'color' ? 'COLOR' : 'ORIGINAL'
  if (!imageDataUrl.startsWith('data:image/png;base64,')) {
    throw new Error(`expected a PNG data URL for the ${keep.toLowerCase()} image`)
  }
  let source = template
  for (const block of ['COLOR', 'ORIGINAL']) {
    if (block !== keep) {
      source = source.replace(
        new RegExp(`/\\* BEGIN ${block} \\*/[\\s\\S]*?/\\* END ${block} \\*/`),
        ''
      )
    }
  }
  const css = source
    .replace(/__FATFISH_COLOR_IMAGE__/g, imageDataUrl)
    .replace(/__FATFISH_ORIGINAL_IMAGE__/g, imageDataUrl)
    .replace(/__FATFISH_OPACITY__/g, String(clamp(opacity * 1.4, 7, 84, 28) / 100))
    .replace(/__FATFISH_SIZE__/g, String(clamp(size, 30, 95, 78)))
  if (/__FATFISH_[A-Z_]+__/.test(css)) {
    throw new Error('unfilled placeholder in style.css')
  }
  return css
}

module.exports = {
  buildCss,
  clamp,
  normalizeStyle
}
