/**
 * Fatfish Terminal Watermark
 *
 * Replaces electerm's built-in white "electerm" wordmark with a 大肥鱼 /
 * DeepSeek whale-girl watermark: the original MIT sprite by default, or an
 * 8-colour pixel version of it.
 *
 * Read style.css and the artwork, fill the template, hand the result to the
 * host with `api.css.apply()`. The stylesheet switches itself off when the user
 * picks their own terminal background, so this file makes no decision about the
 * app's DOM — which is why it needs neither electron nor any renderer bridge,
 * and why the same widget works in electerm's desktop and web builds alike.
 *
 * Instance widget on purpose: electerm's auto-run list starts an instance on
 * every launch, and the host re-applies the stylesheet to every window that
 * loads while an instance runs.
 */

const fs = require('fs')
const path = require('path')
const {
  buildCss,
  normalizeStyle
} = require('./lib/watermark')

const STYLE_FILE = path.join(__dirname, 'style.css')
const COLOR_IMAGE_FILE = path.join(__dirname, 'assets', 'fatfish-pixel-art.png')
const ORIGINAL_IMAGE_FILE = path.join(__dirname, 'assets', 'source-front.png')

// Resolved at run time, not at load time: the host writes the api module into
// this folder before the entry is required (app/widgets/api-entry.js), and
// `npm test` runs without a host.
function widgetApi () {
  return require('@electerm/widget-api')
}

function sizeLabel (bytes) {
  return bytes > 1024 ? `${(bytes / 1024).toFixed(1)}KB` : `${bytes}B`
}

function widgetRun (instanceConfig = {}, ctx = {}) {
  const { log = () => {} } = ctx
  const config = instanceConfig && typeof instanceConfig === 'object' ? instanceConfig : {}
  const instanceId = `fatfish-watermark-${Date.now()}`
  let started = false

  function readFiles () {
    const style = normalizeStyle(config.style)
    const template = fs.readFileSync(STYLE_FILE, 'utf8')
    // one image per style: the source sprite is 152KB, the pixel sprite 8KB
    const imageFile = style === 'original' ? ORIGINAL_IMAGE_FILE : COLOR_IMAGE_FILE
    const png = fs.readFileSync(imageFile)
    return {
      style,
      css: buildCss(template, {
        style,
        imageDataUrl: `data:image/png;base64,${png.toString('base64')}`,
        opacity: config.opacity,
        size: config.size
      }),
      imageBytes: png.length
    }
  }

  return {
    instanceId,

    async start () {
      if (started) {
        throw new Error('This watermark is already applied')
      }
      const { css, imageBytes, style } = readFiles()
      // the host keeps this on the running instance and the app's renderer
      // applies it: one <style> tag per widget, rebuilt on every window load
      widgetApi().css.apply(css)
      started = true
      const msg = `applied ${style} style, ${sizeLabel(imageBytes)} artwork`
      log('info', msg)
      return { msg: `Fatfish watermark applied (${style})` }
    },

    async stop () {
      // the host drops the instance's css on stop; this makes it explicit and
      // keeps the instance usable if a host ever stops one without doing that
      widgetApi().css.remove()
      started = false
    }
  }
}

module.exports = { widgetRun }
