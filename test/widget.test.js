/**
 * Manifest, stylesheet, pixel artwork and the renderer switch, checked
 * without an Electron runtime. Run: npm test
 */

const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const ROOT = path.join(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const style = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8')
const mainSrc = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8')
const {
  APP_STYLE_TAG,
  buildCss,
  clamp,
  normalizeStyle,
  rendererScript,
  shouldApplyWatermark
} = require(path.join(ROOT, 'lib', 'watermark'))
const {
  pixelate,
  readPng
} = require(path.join(ROOT, 'tools', 'build-watermark'))

const PNG_URL = 'data:image/png;base64,AAAA'
const DEFAULT_SHEET = '#container .session-batch-active .xterm-screen::before {' +
  'background-image: url("./images/electerm-watermark.png");' +
  'background-size: min(100%, 766px) auto;}'

test('the id is what the widget folder is called', () => {
  assert.strictEqual(pkg.electerm.id, 'fatfish-watermark')
  assert.strictEqual(pkg.name, pkg.electerm.id)
  assert.match(pkg.electerm.id, /^[a-z0-9-]+$/)
  assert.strictEqual(pkg.main, 'main.js')
})

test('it is an auto-runnable instance widget with style and two knobs', () => {
  assert.strictEqual(pkg.electerm.type, 'instance')
  assert.strictEqual(pkg.electerm.singleInstance, true)
  assert.strictEqual(pkg.electerm.persist, true)
  const configs = pkg.electerm.configs
  assert.deepStrictEqual(configs.map(c => c.name), ['style', 'opacity', 'size', 'autoRun'])
  assert.deepStrictEqual(configs.map(c => c.type), ['select', 'number', 'number', 'boolean'])
  assert.deepStrictEqual(configs[0].choices.map(c => c.value), ['original', 'color'])
  assert.deepStrictEqual(configs[0].choices.map(c => c.label), ['Original PNG', 'Colour pixel art'])
  assert.strictEqual(configs[0].default, 'original')
  assert.strictEqual(configs[1].default, 20)
  assert.strictEqual(configs[2].default, 78)
  assert.strictEqual(configs[3].default, true)
})

test('main.js parses and uses the main-process injection points', () => {
  new vm.Script(mainSrc, { filename: 'main.js' })
  assert.match(mainSrc, /webContents\.insertCSS/)
  assert.match(mainSrc, /webContents\.executeJavaScript/)
  assert.match(mainSrc, /removeInsertedCSS/)
  assert.match(mainSrc, /fatfish-pixel-art\.png/)
  assert.match(mainSrc, /source-front\.png/)
  // the default artwork is the untouched sprite, not the pixel version
  assert.match(mainSrc, /let currentStyle = 'original'/)
})

test('style.css has one fenced rule per artwork style and nothing else', () => {
  assert.match(style, /\[data-fatfish-watermark="on"\]\[data-fatfish-style="original"\]/)
  assert.match(style, /\[data-fatfish-watermark="on"\]\[data-fatfish-style="color"\]/)
  assert.match(style, /background-image: url\("__FATFISH_ORIGINAL_IMAGE__"\) !important/)
  assert.match(style, /background-image: url\("__FATFISH_COLOR_IMAGE__"\) !important/)
  // no masks anywhere: both artworks are full-colour, so a theme-colour mask
  // would only throw the colour away
  assert.match(style, /-webkit-mask-image: none;/)
  assert.match(style, /mask-image: none;/)
  assert.doesNotMatch(style, /mask-mode|--fatfish-image/)
  assert.doesNotMatch(style, /data-fatfish-style="mono"/)
  // the original rule is capped at the sprite's own height, never upscaled
  assert.match(style, /background-size: auto min\(__FATFISH_SIZE__%, 340px\) !important/)
  // exactly two fenced blocks, one per style, and they are closed
  assert.strictEqual((style.match(/\/\* BEGIN [A-Z]+ \*\//g) || []).length, 2)
  assert.strictEqual((style.match(/\/\* END [A-Z]+ \*\//g) || []).length, 2)
  assert.match(style, /\/\* BEGIN ORIGINAL \*\//)
  assert.match(style, /\/\* END COLOR \*\//)
})

test('buildCss fills the placeholders and keeps only the selected rule', () => {
  const css = buildCss(style, { style: 'original', imageDataUrl: PNG_URL, opacity: 20, size: 78 })
  assert.doesNotMatch(css, /__FATFISH_[A-Z_]+__/)
  assert.ok(css.includes(`url("${PNG_URL}")`))
  // exactly one copy: the unselected rule is stripped before the data URL is
  // substituted, so a 152KB sprite never rides along with the pixel sprite
  assert.strictEqual((css.match(/data:image\/png;base64/g) || []).length, 1)
  assert.doesNotMatch(css, /BEGIN COLOR|END COLOR/)
  assert.doesNotMatch(css, /data-fatfish-style="color"/)
  assert.match(css, /\[data-fatfish-style="original"\]/)
  assert.match(css, /background-size: auto min\(78%, 340px\) !important;/)
  assert.match(css, /opacity: 0\.28;/) // 20 x 1.4, so the sprite reads as strongly as the old mask

  const pixel = buildCss(style, { style: 'color', imageDataUrl: PNG_URL, opacity: 20, size: 78 })
  assert.strictEqual((pixel.match(/data:image\/png;base64/g) || []).length, 1)
  assert.doesNotMatch(pixel, /BEGIN ORIGINAL|END ORIGINAL/)
  assert.doesNotMatch(pixel, /data-fatfish-style="original"/)
  assert.match(pixel, /\[data-fatfish-style="color"\]/)
  assert.match(pixel, /background-size: auto 78% !important;/)
  // no height cap on the pixel grid — it is generated at 510x680, so upscaling
  // it is the whole point of a chunkier look
  assert.doesNotMatch(pixel, /background-size: auto min\(/)
})

test('buildCss clamps the knobs and rejects a non-PNG image', () => {
  const clamped = buildCss(style, { imageDataUrl: PNG_URL, opacity: 999, size: -3 })
  assert.match(clamped, /opacity: 0\.84;/)
  assert.match(clamped, /background-size: auto min\(30%, 340px\) !important;/)

  const missing = buildCss(style, { imageDataUrl: PNG_URL, opacity: undefined, size: 'nope' })
  assert.match(missing, /opacity: 0\.28;/)
  assert.match(missing, /background-size: auto min\(78%, 340px\) !important;/)

  assert.throws(() => buildCss(style, {}), /PNG data URL for the original image/)
  assert.throws(() => buildCss(style, { style: 'color', imageDataUrl: 'data:image/jpeg;base64,AA' }),
    /PNG data URL for the color image/)

  assert.strictEqual(clamp('42', 5, 60, 20), 42)
  assert.strictEqual(normalizeStyle('color'), 'color')
  assert.strictEqual(normalizeStyle('original'), 'original')
  assert.strictEqual(normalizeStyle('mono'), 'original') // removed style falls back to the default
  assert.strictEqual(normalizeStyle(undefined), 'original')
})

test('the renderer switch only turns on for the built-in default watermark', () => {
  assert.strictEqual(shouldApplyWatermark(''), true)
  assert.strictEqual(shouldApplyWatermark(null), true)
  assert.strictEqual(shouldApplyWatermark(DEFAULT_SHEET), true)
  assert.strictEqual(shouldApplyWatermark(DEFAULT_SHEET + '\n' +
    '#container .sessions .session-abc .xterm-screen::before {background-image: url("./images/electerm-watermark.png");}'), true)

  assert.strictEqual(shouldApplyWatermark(
    '#container .session-batch-active .xterm-screen::before {background-image: none;}'), false)
  assert.strictEqual(shouldApplyWatermark(
    '#container .session-batch-active .xterm-screen::before {background-image: url(data:image;base64,AAAA);}'), false)
  assert.strictEqual(shouldApplyWatermark(
    '#container .session-batch-active .xterm-screen::before {background-image: url(https://x/y.jpg);}'), false)
  assert.strictEqual(shouldApplyWatermark(
    "#container .session-batch-active .xterm-screen::before {content: 'hello';}"), false)
  assert.strictEqual(shouldApplyWatermark(DEFAULT_SHEET + '\n' +
    '#container .sessions .session-abc .xterm-screen::before {background-image: none;}'), false)
})

function runRenderer (script) {
  const tag = { id: APP_STYLE_TAG, textContent: DEFAULT_SHEET }
  const root = { dataset: {} }
  let observer
  const sandbox = {
    document: {
      documentElement: root,
      head: {},
      getElementById: id => (id === tag.id ? tag : null)
    },
    window: {},
    MutationObserver: class {
      constructor (cb) {
        this.cb = cb
        observer = this
      }

      observe () {}
      disconnect () {}
    }
  }
  vm.runInNewContext(script, sandbox)
  return { tag, root, sandbox, fire: () => observer.cb() }
}

test('the renderer script sets the chosen style and reacts to style-tag rewrites', () => {
  const script = rendererScript()
  assert.ok(script.includes(APP_STYLE_TAG))
  assert.ok(script.includes('shouldApplyWatermark'))
  assert.ok(script.includes('"original"'))
  assert.doesNotMatch(script, /require\(|module\.exports/)

  const { tag, root, sandbox, fire } = runRenderer(script)
  assert.strictEqual(root.dataset.fatfishWatermark, 'on')
  assert.strictEqual(root.dataset.fatfishStyle, 'original')

  tag.textContent = '#container .session-batch-active .xterm-screen::before {background-image: none;}'
  fire()
  assert.strictEqual(root.dataset.fatfishWatermark, 'off')
  assert.strictEqual(root.dataset.fatfishStyle, 'original')

  tag.textContent = DEFAULT_SHEET
  fire()
  assert.strictEqual(root.dataset.fatfishWatermark, 'on')

  sandbox.window.__fatfishWatermark.stop()
  assert.strictEqual('fatfishWatermark' in root.dataset, false)
  assert.strictEqual('fatfishStyle' in root.dataset, false)
  assert.strictEqual(sandbox.window.__fatfishWatermark, undefined)
  assert.ok(rendererScript('color').includes('"color"'))
})

test('the pixel art is a transparent, eight-colour, solid-square sprite', () => {
  const file = path.join(ROOT, 'assets', 'fatfish-pixel-art.png')
  assert.ok(fs.existsSync(file))
  const { w, h, rgba } = readPng(file)
  assert.strictEqual(w, 510)
  assert.strictEqual(h, 680)
  const colors = new Set()
  let transparent = 0
  for (let i = 0; i < w * h; i++) {
    const d = i * 4
    if (rgba[d + 3] === 0) transparent++
    else colors.add(`${rgba[d]},${rgba[d + 1]},${rgba[d + 2]}`)
  }
  assert.ok(transparent > w * h * 0.2, 'transparent background')
  assert.ok(colors.size >= 5 && colors.size <= 10, 'an 8-ish colour palette')
  assert.ok(fs.statSync(file).size < 20 * 1024, 'small enough to inline as a data URL')

  // every 10x10 cell is one solid square — that is what makes it pixel art
  for (let gy = 0; gy < 68; gy += 7) {
    for (let gx = 0; gx < 51; gx += 9) {
      const first = rgba[((gy * 10) * w + gx * 10) * 4 + 3]
      for (let y = gy * 10; y < (gy + 1) * 10; y += 3) {
        for (let x = gx * 10; x < (gx + 1) * 10; x += 3) {
          assert.strictEqual(rgba[(y * w + x) * 4 + 3], first)
        }
      }
    }
  }
})

test('the pixel grid is deterministic and the source sprite is shipped', () => {
  const src = path.join(ROOT, 'assets', 'source-front.png')
  assert.ok(fs.existsSync(src))
  const image = readPng(src)
  assert.strictEqual(image.w, 255)
  assert.strictEqual(image.h, 340)
  const a = pixelate(image, 51, 68)
  const b = pixelate(image, 51, 68)
  assert.strictEqual(a.cells.length, 51 * 68)
  assert.deepStrictEqual(
    a.cells.map(c => [c.color, Math.round(c.cov * 100)]),
    b.cells.map(c => [c.color, Math.round(c.cov * 100)])
  )
})

test('the removed theme-colour mask is gone from every shipped file', () => {
  const files = ['main.js', 'style.css', 'package.json', 'preview.html',
    'README.md', 'README_CN.md', 'NOTICE.md', 'lib/watermark.js']
  for (const rel of files) {
    const file = path.join(ROOT, rel)
    if (!fs.existsSync(file)) continue
    const text = fs.readFileSync(file, 'utf8')
    assert.doesNotMatch(text, /fatfish-watermark\.png/, `${rel} still references the mask PNG`)
    assert.doesNotMatch(text, /--style=line/, `${rel} still documents the line-art option`)
    assert.doesNotMatch(text, /Theme-colour mask/, `${rel} still offers the mask style`)
  }
  assert.strictEqual(fs.existsSync(path.join(ROOT, 'assets', 'fatfish-watermark.png')), false)
})
