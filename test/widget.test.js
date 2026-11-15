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
  INK_LEVELS,
  pixelate,
  readPng
} = require(path.join(ROOT, 'tools', 'build-watermark'))

const MASK_URL = 'data:image/png;base64,AAAA'
const COLOR_URL = 'data:image/png;base64,BBBB'
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
  assert.deepStrictEqual(configs[0].choices.map(c => c.value), ['color', 'mono'])
  assert.strictEqual(configs[0].default, 'color')
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
})

test('style.css has one rule per artwork style, both theme-safe', () => {
  assert.match(style, /\[data-fatfish-watermark="on"\]\[data-fatfish-style="color"\]/)
  assert.match(style, /\[data-fatfish-watermark="on"\]\[data-fatfish-style="mono"\]/)
  assert.match(style, /background-image: url\("__FATFISH_COLOR_IMAGE__"\) !important/)
  assert.match(style, /background-color: var\(--text, #dddddd\) !important/)
  assert.match(style, /--fatfish-image: url\("__FATFISH_IMAGE__"\)/)
  assert.match(style, /mask-image: var\(--fatfish-image\)/)
})

test('buildCss fills every placeholder and clamps the numbers', () => {
  const css = buildCss(style, {
    dataUrl: MASK_URL,
    colorDataUrl: COLOR_URL,
    opacity: 20,
    size: 78
  })
  assert.doesNotMatch(css, /__FATFISH_[A-Z_]+__/)
  assert.ok(css.includes(`url("${MASK_URL}")`))
  assert.ok(css.includes(`url("${COLOR_URL}")`))
  // exactly one copy of each data URL: no placeholder leaked into a comment
  assert.strictEqual((css.match(/data:image\/png;base64/g) || []).length, 2)
  assert.match(css, /opacity: 0\.2;/) // mono
  assert.match(css, /opacity: 0\.28;/) // colour = 1.4 x 20
  assert.match(css, /background-size: auto 78% !important;/)
  assert.match(css, /mask-size: auto 78%;/)

  const clamped = buildCss(style, {
    dataUrl: MASK_URL, colorDataUrl: COLOR_URL, opacity: 999, size: -3
  })
  assert.match(clamped, /opacity: 0\.6;/)
  assert.match(clamped, /opacity: 0\.84;/)
  assert.match(clamped, /mask-size: auto 30%;/)

  const missing = buildCss(style, {
    dataUrl: MASK_URL, colorDataUrl: COLOR_URL, opacity: undefined, size: 'nope'
  })
  assert.match(missing, /opacity: 0\.2;/)
  assert.match(missing, /mask-size: auto 78%;/)

  assert.throws(() => buildCss(style, { dataUrl: MASK_URL }), /colour sprite image/)
  assert.throws(() => buildCss(style, { colorDataUrl: COLOR_URL }), /mask image/)
  assert.strictEqual(clamp('42', 5, 60, 20), 42)
  assert.strictEqual(normalizeStyle('mono'), 'mono')
  assert.strictEqual(normalizeStyle(undefined), 'color')
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
  const script = rendererScript('mono')
  assert.ok(script.includes(APP_STYLE_TAG))
  assert.ok(script.includes('shouldApplyWatermark'))
  assert.ok(script.includes('"mono"'))
  assert.doesNotMatch(script, /require\(|module\.exports/)

  const { tag, root, sandbox, fire } = runRenderer(script)
  assert.strictEqual(root.dataset.fatfishWatermark, 'on')
  assert.strictEqual(root.dataset.fatfishStyle, 'mono')

  tag.textContent = '#container .session-batch-active .xterm-screen::before {background-image: none;}'
  fire()
  assert.strictEqual(root.dataset.fatfishWatermark, 'off')
  assert.strictEqual(root.dataset.fatfishStyle, 'mono')

  tag.textContent = DEFAULT_SHEET
  fire()
  assert.strictEqual(root.dataset.fatfishWatermark, 'on')

  sandbox.window.__fatfishWatermark.stop()
  assert.strictEqual('fatfishWatermark' in root.dataset, false)
  assert.strictEqual('fatfishStyle' in root.dataset, false)
  assert.strictEqual(sandbox.window.__fatfishWatermark, undefined)
  assert.ok(rendererScript().includes('"color"'))
})

test('the watermark is a transparent, six-level pixel mask', () => {
  const file = path.join(ROOT, 'assets', 'fatfish-watermark.png')
  const { w, h, rgba } = readPng(file)
  assert.strictEqual(w, 510)
  assert.strictEqual(h, 680)
  const levels = new Set()
  let transparent = 0
  let ink = 0
  for (let i = 0; i < w * h; i++) {
    const a = rgba[i * 4 + 3]
    levels.add(a)
    if (a === 0) transparent++
    if (a > 0) ink++
  }
  assert.ok(transparent > w * h * 0.2, 'transparent background')
  assert.ok(ink > w * h * 0.1, 'has a sprite')
  assert.ok(levels.size <= INK_LEVELS.length + 1, 'limited pixel-art palette')
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

test('the intermediate colour pixel art is shipped too', () => {
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
  assert.ok(transparent > w * h * 0.2)
  assert.ok(colors.size >= 5 && colors.size <= 10, 'an 8-ish colour palette')
})

test('the pixel grid is deterministic and the source sprite is shipped', () => {
  const src = path.join(ROOT, 'assets', 'source-front.png')
  assert.ok(fs.existsSync(src))
  const image = readPng(src)
  assert.strictEqual(image.w, 255)
  assert.strictEqual(image.h, 340)
  const a = pixelate(image, 51, 68)
  const b = pixelate(image, 51, 68)
  assert.deepStrictEqual(
    a.cells.map(c => [c.tone, c.color, Math.round(c.cov * 100)]),
    b.cells.map(c => [c.tone, c.color, Math.round(c.cov * 100)])
  )
})
