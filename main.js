/**
 * Fatfish Terminal Watermark
 *
 * Replaces electerm's built-in white "electerm" wordmark with a line-art
 * 大肥鱼 / DeepSeek whale-girl watermark that follows the theme's text colour.
 *
 * A widget's UI is a sandboxed iframe and cannot touch the app's DOM, but its
 * main.js runs in the main process. This file therefore uses
 * webContents.insertCSS() to style electerm's own window from the outside, and
 * webContents.executeJavaScript() to set a single attribute on <html> that
 * turns the stylesheet on only while the built-in default watermark is
 * showing. See lib/watermark.js for that decision and style.css for the rules.
 *
 * Instance widget on purpose: electerm's auto-run list starts an instance on
 * every launch. Inserted stylesheets live in the current document, so every
 * did-finish-load re-inserts them (and re-installs the renderer switch).
 */

const fs = require('fs')
const path = require('path')
const { app, webContents } = require('electron')
const {
  buildCss,
  normalizeStyle,
  rendererScript
} = require('./lib/watermark')

const RELOAD = 'did-finish-load'
const NOOP = () => {}
const STYLE_FILE = path.join(__dirname, 'style.css')
const IMAGE_FILE = path.join(__dirname, 'assets', 'fatfish-watermark.png')
const COLOR_IMAGE_FILE = path.join(__dirname, 'assets', 'fatfish-pixel-art.png')

// devtools and widget iframes are webContents too; the app renderer is served
// over http://127.0.0.1:<port>, so skipping the widget/devtools schemes is
// what keeps this from styling the wrong document
const SKIP_SCHEME = /^(devtools|electerm-widget|chrome|chrome-extension|about|data):/i

let currentCss = ''
let currentStyle = 'color'
const applied = new Map() // webContents.id -> { wc, onLoad, key, queue }
let onCreated = null

function isAppWindow (wc) {
  if (!wc || wc.isDestroyed() || wc.getType() !== 'window') {
    return false
  }
  return !SKIP_SCHEME.test(wc.getURL() || '')
}

function appWindows () {
  return webContents.getAllWebContents().filter(isAppWindow)
}

// One insert at a time, per window. Two overlapping insertCSS calls both see
// `key === null`, both insert, and only one key is kept — the other stylesheet
// is unremovable, so Stop would leave it applied.
function insert (wc) {
  const entry = applied.get(wc.id)
  if (!entry) {
    return Promise.resolve()
  }
  entry.queue = entry.queue.then(() => applyOnce(entry)).catch(NOOP)
  return entry.queue
}

async function applyOnce (entry) {
  const { wc } = entry
  if (wc.isDestroyed()) {
    return
  }
  if (entry.key) {
    const key = entry.key
    entry.key = null
    await wc.removeInsertedCSS(key).catch(NOOP)
  }
  if (!currentCss) {
    return
  }
  try {
    entry.key = await wc.insertCSS(currentCss)
  } catch (e) {
    // a window still on about:blank has no document yet; did-finish-load
    // gives us another chance
  }
}

async function install (wc) {
  if (wc.isDestroyed()) {
    return
  }
  try {
    await wc.executeJavaScript(rendererScript(currentStyle))
  } catch (e) {
    // the document may not be ready yet; the reload handler retries
  }
}

function attach (wc) {
  if (applied.has(wc.id)) {
    insert(wc)
    install(wc)
    return
  }
  const onLoad = () => {
    insert(wc)
    install(wc)
  }
  const entry = { wc, onLoad, key: null, queue: Promise.resolve() }
  applied.set(wc.id, entry)
  wc.on(RELOAD, onLoad)
  wc.once('destroyed', () => {
    applied.delete(wc.id)
  })
  insert(wc)
  install(wc)
}

async function detachAll () {
  const entries = [...applied.values()]
  applied.clear()
  currentCss = ''
  await Promise.all(entries.map(async entry => {
    try {
      entry.wc.removeListener(RELOAD, entry.onLoad)
    } catch (e) {}
    await entry.queue.catch(NOOP)
    if (!entry.wc.isDestroyed()) {
      await entry.wc.executeJavaScript(
        'if (window.__fatfishWatermark) window.__fatfishWatermark.stop()'
      ).catch(NOOP)
    }
    if (!entry.key) {
      return
    }
    const key = entry.key
    entry.key = null
    if (!entry.wc.isDestroyed()) {
      await entry.wc.removeInsertedCSS(key).catch(NOOP)
    }
  }))
}

function sizeLabel (bytes) {
  return bytes > 1024 ? `${(bytes / 1024).toFixed(1)}KB` : `${bytes}B`
}

function widgetRun (instanceConfig = {}, ctx = {}) {
  const { log = NOOP } = ctx
  const config = instanceConfig && typeof instanceConfig === 'object' ? instanceConfig : {}
  const instanceId = `fatfish-watermark-${Date.now()}`
  let started = false

  function readFiles () {
    const template = fs.readFileSync(STYLE_FILE, 'utf8')
    const png = fs.readFileSync(IMAGE_FILE)
    const colorPng = fs.readFileSync(COLOR_IMAGE_FILE)
    const dataUrl = `data:image/png;base64,${png.toString('base64')}`
    const colorDataUrl = `data:image/png;base64,${colorPng.toString('base64')}`
    return {
      css: buildCss(template, {
        dataUrl,
        colorDataUrl,
        opacity: config.opacity,
        size: config.size
      }),
      imageBytes: png.length + colorPng.length
    }
  }

  return {
    instanceId,

    async start () {
      if (started) {
        throw new Error('This watermark is already applied')
      }
      const { css, imageBytes } = readFiles()
      currentCss = css
      currentStyle = normalizeStyle(config.style)
      started = true
      onCreated = (event, wc) => {
        if (isAppWindow(wc)) {
          attach(wc)
        }
      }
      app.on('web-contents-created', onCreated)
      appWindows().forEach(attach)
      // let the queued inserts land before reporting, so the message and a stop
      // issued right after this both describe the same state
      await Promise.all([...applied.values()].map(entry => entry.queue.catch(NOOP)))

      log('info', `applied ${currentStyle} style to ${applied.size} window(s), ${sizeLabel(imageBytes)} artwork`)
      return {
        msg: `Fatfish watermark applied to ${applied.size} window(s)`
      }
    },

    async stop () {
      if (onCreated) {
        app.removeListener('web-contents-created', onCreated)
        onCreated = null
      }
      await detachAll()
      started = false
      log('info', 'watermark removed')
    }
  }
}

module.exports = { widgetRun }
