/**
 * Pure, dependency-free helpers shared by main.js and the unit tests.
 *
 * Nothing in this file may require('electron') — `npm test` runs it under plain
 * node --test, and the renderer script below is serialised into a string.
 */

const DEFAULT_MARK = 'electerm-watermark.png'
const APP_STYLE_TAG = 'css-overwrite-terminal-backgrounds'

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
 * Fill the placeholders in style.css. The image is a data: URL because an
 * inserted stylesheet lives in the app renderer, which cannot resolve a path
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

/**
 * True only while electerm is painting its built-in default watermark.
 *
 * `#css-overwrite-terminal-backgrounds` is rewritten by electerm's
 * CssOverwrite component on every background-setting change. Its default
 * branch is the only one that references electerm-watermark.png; a custom
 * image, a text/index background, or an explicit "no background" all produce
 * different declarations. A missing/empty sheet means the app has not
 * overridden anything yet (older electerm builds too), which is also the
 * default state.
 *
 * This function must stay self-contained: rendererScript() serialises it.
 */
function shouldApplyWatermark (appCss) {
  const mark = 'electerm-watermark.png'
  const css = typeof appCss === 'string' ? appCss : ''
  if (!css.trim()) {
    return true
  }
  // text / tab-index backgrounds paint their content with `content:`
  if (/\bcontent\s*:/i.test(css)) {
    return false
  }
  const images = []
  const re = /background-image\s*:\s*([^;}]+)/gi
  let m
  while ((m = re.exec(css)) !== null) {
    images.push(m[1].trim())
  }
  if (!images.length) {
    return true
  }
  return images.every(value => value.includes(mark))
}

/**
 * Renderer-side switch. Statically inserted CSS cannot tell which background
 * rule electerm generated, so a tiny MutationObserver on the app's own
 * <style> tag decides whether our sheet matches. It only writes two attributes
 * on <html>; it never touches the DOM the app manages.
 */
function rendererScript (style = 'original') {
  return `(() => {
  const TAG = ${JSON.stringify(APP_STYLE_TAG)};
  const STYLE = ${JSON.stringify(normalizeStyle(style))};
  const shouldApplyWatermark = ${shouldApplyWatermark.toString()};
  const root = document.documentElement;
  if (window.__fatfishWatermark) window.__fatfishWatermark.stop();
  const observer = new MutationObserver(observeAndSync);
  function observeAndSync () {
    observer.disconnect();
    if (document.head) observer.observe(document.head, { childList: true });
    const tag = document.getElementById(TAG);
    if (tag) observer.observe(tag, { childList: true, characterData: true, subtree: true });
    const css = tag ? (tag.textContent || '') : '';
    root.dataset.fatfishWatermark = shouldApplyWatermark(css) ? 'on' : 'off';
    root.dataset.fatfishStyle = STYLE;
  }
  window.__fatfishWatermark = {
    stop () {
      observer.disconnect();
      delete root.dataset.fatfishWatermark;
      delete root.dataset.fatfishStyle;
      delete window.__fatfishWatermark;
    }
  };
  observeAndSync();
})()`
}

module.exports = {
  APP_STYLE_TAG,
  DEFAULT_MARK,
  buildCss,
  clamp,
  normalizeStyle,
  rendererScript,
  shouldApplyWatermark
}
