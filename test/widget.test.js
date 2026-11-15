/**
 * Manifest, stylesheet, watermark asset and the renderer switch, checked
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
  rendererScript,
  shouldApplyWatermark
} = require(path.join(ROOT, 'lib', 'watermark'))
const { readPng } = require(path.join(ROOT, 'tools', 'build-watermark'))

const DEFAULT_SHEET = '#container .session-batch-active .xterm-screen::before {' +
  'background-image: url("./images/electerm-watermark.png");' +
  'background-size: min(100%, 766px) auto;}'

test('the id is what the widget folder is called', () => {
  assert.strictEqual(pkg.electerm.id, 'fatfish-watermark')
  assert.strictEqual(pkg.name, pkg.electerm.id)
  assert.match(pkg.electerm.id, /^[a-z0-9-]+$/)
  assert.strictEqual(pkg.main, 'main.js')
})

test('it is an auto-runnable instance widget with the two tuning knobs', () => {
  assert.strictEqual(pkg.electerm.type, 'instance')
  assert.strictEqual(pkg.electerm.singleInstance, true)
  assert.strictEqual(pkg.electerm.persist, true)
  const configs = pkg.electerm.configs
  assert.deepStrictEqual(configs.map(c => c.name), ['opacity', 'size', 'autoRun'])
  assert.deepStrictEqual(configs.map(c => c.type), ['number', 'number', 'boolean'])
  assert.strictEqual(configs[0].default, 20)
  assert.strictEqual(configs[1].default, 78)
  assert.strictEqual(configs[2].default, true)
})

test('main.js parses and uses the main-process injection points', () => {
  new vm.Script(mainSrc, { filename: 'main.js' })
  assert.match(mainSrc, /webContents\.insertCSS/)
  assert.match(mainSrc, /webContents\.executeJavaScript/)
  assert.match(mainSrc, /removeInsertedCSS/)
})

test('style.css masks with --text, never hardcodes a colour', () => {
  assert.match(style, /:root\[data-fatfish-watermark="on"\]/)
  assert.match(style, /background-color: var\(--text, #dddddd\) !important/)
  assert.match(style, /background-image: none !important/)
  assert.match(style, /--fatfish-image: url\("__FATFISH_IMAGE__"\)/)
  assert.match(style, /mask-image: var\(--fatfish-image\)/)
  assert.match(style, /-webkit-mask-image: var\(--fatfish-image\)/)
  assert.match(style, /-webkit-mask-size: auto __FATFISH_SIZE__%/)
  assert.match(style, /opacity: __FATFISH_OPACITY__/)
  assert.doesNotMatch(style, /#[0-9a-f]{6}\s*;/i)
})

test('buildCss fills every placeholder and clamps the numbers', () => {
  const dataUrl = 'data:image/png;base64,AAAA'
  const css = buildCss(style, { dataUrl, opacity: 20, size: 78 })
  assert.doesNotMatch(css, /__FATFISH_/)
  assert.ok(css.includes(`url("${dataUrl}")`))
  assert.match(css, /opacity: 0\.2;/)
  assert.match(css, /mask-size: auto 78%;/)
  assert.match(css, /-webkit-mask-size: auto 78%;/)

  const clamped = buildCss(style, { dataUrl, opacity: 999, size: -3 })
  assert.match(clamped, /opacity: 0\.6;/)
  assert.match(clamped, /mask-size: auto 30%;/)

  const missing = buildCss(style, { dataUrl, opacity: undefined, size: 'nope' })
  assert.match(missing, /opacity: 0\.2;/)
  assert.match(missing, /mask-size: auto 78%;/)

  assert.throws(() => buildCss(style, { dataUrl: 'https://example.com/a.png' }), /PNG data URL/)
  assert.strictEqual(clamp('42', 5, 60, 20), 42)
})

test('the renderer switch only turns on for the built-in default watermark', () => {
  assert.strictEqual(shouldApplyWatermark(''), true)
  assert.strictEqual(shouldApplyWatermark(null), true)
  assert.strictEqual(shouldApplyWatermark(DEFAULT_SHEET), true)
  // a per-tab rule that also uses the default wordmark is still the default
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

test('the renderer script reacts to electerm rewriting its style tag', () => {
  const script = rendererScript()
  assert.ok(script.includes(APP_STYLE_TAG))
  assert.ok(script.includes('shouldApplyWatermark'))
  // self-contained: no closure over module-level helpers
  assert.doesNotMatch(script, /require\(|module\.exports/)

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
  assert.strictEqual(root.dataset.fatfishWatermark, 'on')

  tag.textContent = '#container .session-batch-active .xterm-screen::before {background-image: none;}'
  observer.cb()
  assert.strictEqual(root.dataset.fatfishWatermark, 'off')

  tag.textContent = DEFAULT_SHEET
  observer.cb()
  assert.strictEqual(root.dataset.fatfishWatermark, 'on')

  sandbox.window.__fatfishWatermark.stop()
  assert.strictEqual('fatfishWatermark' in root.dataset, false)
  assert.strictEqual(sandbox.window.__fatfishWatermark, undefined)
})

test('the shipped watermark is a transparent RGBA line drawing', () => {
  const file = path.join(ROOT, 'assets', 'fatfish-watermark.png')
  const { w, h, rgba } = readPng(file)
  assert.strictEqual(w, 510)
  assert.strictEqual(h, 680)
  let transparent = 0
  let opaque = 0
  let ink = 0
  for (let i = 0; i < w * h; i++) {
    const a = rgba[i * 4 + 3]
    if (a === 0) transparent++
    if (a > 0) ink++
    if (a === 255) opaque++
  }
  assert.ok(transparent > w * h * 0.2, 'transparent background')
  assert.ok(ink > w * h * 0.05, 'has a drawing')
  assert.ok(opaque < ink, 'the drawing is translucent')
  assert.ok(fs.statSync(file).size < 120 * 1024, 'small enough to inline as a data URL')
})

test('the source sprite is shipped so the watermark can be rebuilt offline', () => {
  const src = path.join(ROOT, 'assets', 'source-front.png')
  assert.ok(fs.existsSync(src))
  const { w, h } = readPng(src)
  assert.strictEqual(w, 255)
  assert.strictEqual(h, 340)
})
