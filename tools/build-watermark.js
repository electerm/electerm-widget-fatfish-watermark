#!/usr/bin/env node
/**
 * Two-step artwork pipeline for the fatfish terminal watermark:
 *
 *   1. PIXELATE  assets/source-front.png into a small grid of flat colour
 *      blocks (51 x 68 cells, 10px each) -> assets/fatfish-pixel-art.png
 *   2. WATERMARK map every cell's tone to one of six ink levels, all painted
 *      in neutral grey on transparent pixels -> assets/fatfish-watermark.png
 *
 * Only the alpha channel of the second file matters to the widget: it uses the
 * PNG as a CSS mask and paints it with the theme's --text colour, so the
 * watermark adapts to any background. The neutral grey ink also keeps the PNG
 * readable on black and white if it is used directly as a background image.
 *
 * No dependencies: PNG decode/encode is node:zlib, everything else is plain
 * arithmetic. Run `npm run build` to reproduce. `--style=line` falls back to
 * the earlier Sobel line-art look; `--grid=51x68` and `--cell=10` change the
 * pixel size.
 */

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const ROOT = path.join(__dirname, '..')
const SOURCE = path.join(ROOT, 'assets', 'source-front.png')
const PIXEL_ART = path.join(ROOT, 'assets', 'fatfish-pixel-art.png')
const OUTPUT = path.join(ROOT, 'assets', 'fatfish-watermark.png')

const INK = 143 // neutral grey (#8f8f8f): visible on both #000 and #fff

// six ink levels, from "empty" to "solid". A limited palette is what makes the
// result read as pixel art rather than a blurred downscale.
const INK_LEVELS = [0, 0.13, 0.34, 0.58, 0.82, 0.98]

// eight flat colours for the intermediate pixel sprite (white headdress /
// apron, blue hair at three depths, ink outline, skin, gold trim)
const COLORS = [
  [250, 250, 252],
  [228, 236, 248],
  [150, 200, 238],
  [86, 146, 214],
  [44, 88, 158],
  [22, 34, 68],
  [252, 226, 214],
  [186, 154, 104]
]

// legacy line-art constants, used only by --style=line
const SCALE = 2
const FILL = 0.09
const OUTLINE = 0.95
const DETAIL = 0.42
const OVERALL = 0.9

// ---------------------------------------------------------------- PNG codec

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    }
    t[n] = c
  }
  return t
})()

function crc32 (buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ -1) >>> 0
}

function chunk (type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function paeth (a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

/** Decode a non-interlaced 8-bit RGB or RGBA PNG into a packed RGBA buffer. */
function readPng (file) {
  const buf = fs.readFileSync(file)
  if (buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error(`${file}: not a PNG`)
  }
  let w = 0
  let h = 0
  let colorType = 0
  const idat = []
  let off = 8
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.subarray(off + 4, off + 8).toString('ascii')
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') {
      w = data.readUInt32BE(0)
      h = data.readUInt32BE(4)
      if (data[8] !== 8 || data[12] !== 0) {
        throw new Error('expected 8-bit, non-interlaced PNG')
      }
      colorType = data[9]
      if (colorType !== 2 && colorType !== 6) {
        throw new Error(`unsupported PNG colour type ${colorType} (need RGB or RGBA)`)
      }
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    off += 12 + len
  }

  const bpp = colorType === 6 ? 4 : 3
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = w * bpp
  const rgba = Buffer.alloc(w * h * 4)
  let prev = Buffer.alloc(stride)
  let pos = 0

  for (let y = 0; y < h; y++) {
    const filter = raw[pos++]
    const line = Buffer.from(raw.subarray(pos, pos + stride))
    pos += stride
    for (let x = 0; x < stride; x++) {
      const left = x >= bpp ? line[x - bpp] : 0
      const up = prev[x]
      const upLeft = x >= bpp ? prev[x - bpp] : 0
      let v = line[x]
      if (filter === 1) v += left
      else if (filter === 2) v += up
      else if (filter === 3) v += (left + up) >> 1
      else if (filter === 4) v += paeth(left, up, upLeft)
      else if (filter !== 0) throw new Error(`unsupported PNG filter ${filter}`)
      line[x] = v & 0xff
    }
    for (let x = 0; x < w; x++) {
      const s = x * bpp
      const d = (y * w + x) * 4
      rgba[d] = line[s]
      rgba[d + 1] = line[s + 1]
      rgba[d + 2] = line[s + 2]
      rgba[d + 3] = bpp === 4 ? line[s + 3] : 255
    }
    prev = line
  }
  return { w, h, rgba }
}

function writePng (file, w, h, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const stride = w * 4
  const raw = Buffer.alloc((stride + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]))
}

// ---------------------------------------------------------------- step 1

/** Classify an average cell colour into one of the six ink levels. */
function tone (r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const sat = max === 0 ? 0 : (max - min) / max
  const lum = 0.299 * r + 0.587 * g + 0.114 * b
  const blue = b > r * 1.06 && b > g * 1.02
  if (lum < 0.2) return 5 // eyes / ink outlines
  if (blue && sat > 0.18 && lum < 0.55) return 4 // deep blue hair / dress
  if (blue && sat > 0.18) return 3 // bright blue hair tips
  if (lum > 0.82) return 1 // white apron / headdress / skin
  return 2 // mid greys and shadows
}

function nearestColor (r, g, b) {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < COLORS.length; i++) {
    const c = COLORS[i]
    const dr = (r - c[0]) * 1.0
    const dg = (g - c[1]) * 1.0
    const db = (b - c[2]) * 0.85
    const dist = dr * dr + dg * dg + db * db
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  }
  return best
}

/**
 * Reduce the sprite to a grid of flat cells. Each cell keeps its average
 * colour (composited onto white, so transparent black does not leak in), its
 * coverage, and the resulting tone / palette indices.
 */
function pixelate (src, gw, gh) {
  const { w, h, rgba } = src
  const cells = []
  for (let gy = 0; gy < gh; gy++) {
    const y0 = Math.floor(gy * h / gh)
    const y1 = Math.max(y0 + 1, Math.floor((gy + 1) * h / gh))
    for (let gx = 0; gx < gw; gx++) {
      const x0 = Math.floor(gx * w / gw)
      const x1 = Math.max(x0 + 1, Math.floor((gx + 1) * w / gw))
      let r = 0
      let g = 0
      let b = 0
      let cov = 0
      let n = 0
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const d = (y * w + x) * 4
          const a = rgba[d + 3] / 255
          // composite onto white before averaging
          r += (rgba[d] * a + 255 * (1 - a)) / 255
          g += (rgba[d + 1] * a + 255 * (1 - a)) / 255
          b += (rgba[d + 2] * a + 255 * (1 - a)) / 255
          cov += a
          n++
        }
      }
      const cr = r / n
      const cg = g / n
      const cb = b / n
      cells.push({
        cov: cov / n,
        tone: tone(cr, cg, cb),
        color: nearestColor(cr * 255, cg * 255, cb * 255)
      })
    }
  }
  // a cell on the silhouette edge gets a slightly darker outline, the way
  // hand-drawn pixel sprites do. Only a strong coverage jump counts.
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const c = cells[gy * gw + gx]
      let edge = 0
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = gx + dx
        const ny = gy + dy
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue
        edge = Math.max(edge, Math.abs(c.cov - cells[ny * gw + nx].cov))
      }
      if (edge > 0.6 && c.cov > 0.35) {
        c.tone = Math.max(c.tone, 4)
      }
    }
  }
  return { gw, gh, cells }
}

/** Expand a cell grid into an RGBA buffer: every cell is one solid square. */
function paintCells (grid, cell, writer) {
  const { gw, gh, cells } = grid
  const W = gw * cell
  const H = gh * cell
  const out = Buffer.alloc(W * H * 4)
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const [r, g, b, a] = writer(cells[gy * gw + gx])
      for (let y = gy * cell; y < (gy + 1) * cell; y++) {
        for (let x = gx * cell; x < (gx + 1) * cell; x++) {
          const d = (y * W + x) * 4
          out[d] = r
          out[d + 1] = g
          out[d + 2] = b
          out[d + 3] = a
        }
      }
    }
  }
  return { w: W, h: H, rgba: out }
}

// ---------------------------------------------------------------- step 2

function paintColor (grid, cell) {
  return paintCells(grid, cell, c => {
    if (c.cov <= 0.45) {
      return [0, 0, 0, 0]
    }
    const [r, g, b] = COLORS[c.color]
    return [r, g, b, 255]
  })
}

function paintWatermark (grid, cell) {
  return paintCells(grid, cell, c => {
    const level = c.cov > 0.45 ? c.tone : 0
    return [INK, INK, INK, Math.round(INK_LEVELS[level] * 255)]
  })
}

// ---------------------------------------------------------------- legacy

function scale2x (src, w, h) {
  const W = w * SCALE
  const H = h * SCALE
  const out = Buffer.alloc(W * H * 4)
  for (let y = 0; y < H; y++) {
    const sy = y / SCALE
    const y0 = Math.floor(sy)
    const y1 = Math.min(h - 1, y0 + 1)
    const fy = sy - y0
    for (let x = 0; x < W; x++) {
      const sx = x / SCALE
      const x0 = Math.floor(sx)
      const x1 = Math.min(w - 1, x0 + 1)
      const fx = sx - x0
      const d = (y * W + x) * 4
      for (let c = 0; c < 4; c++) {
        const a = src[(y0 * w + x0) * 4 + c] * (1 - fx) + src[(y0 * w + x1) * 4 + c] * fx
        const b = src[(y1 * w + x0) * 4 + c] * (1 - fx) + src[(y1 * w + x1) * 4 + c] * fx
        out[d + c] = Math.round(a * (1 - fy) + b * fy)
      }
    }
  }
  return { w: W, h: H, rgba: out }
}

function buildLineArt () {
  const { w: sw, h: sh, rgba: src } = readPng(SOURCE)
  const { w, h, rgba } = scale2x(src, sw, sh)
  const n = w * h
  const lum = new Float32Array(n)
  const alpha = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const d = i * 4
    const a = rgba[d + 3] / 255
    const r = (rgba[d] * a + 255 * (1 - a)) / 255
    const g = (rgba[d + 1] * a + 255 * (1 - a)) / 255
    const b = (rgba[d + 2] * a + 255 * (1 - a)) / 255
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b
    alpha[i] = a
  }
  const smooth = new Float32Array(n)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0
      let count = 0
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= w) continue
          sum += lum[yy * w + xx]
          count++
        }
      }
      smooth[y * w + x] = sum / count
    }
  }
  const out = Buffer.alloc(n * 4)
  for (let i = 0; i < n; i++) {
    out[i * 4] = INK
    out[i * 4 + 1] = INK
    out[i * 4 + 2] = INK
  }
  const at = (x, y) => (Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x)))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const a = alpha[i]
      let max = 0
      let min = 1
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const v = alpha[at(x + dx, y + dy)]
          if (v > max) max = v
          if (v < min) min = v
        }
      }
      const outline = max - min
      const tl = smooth[at(x - 1, y - 1)]
      const tc = smooth[at(x, y - 1)]
      const tr = smooth[at(x + 1, y - 1)]
      const ml = smooth[at(x - 1, y)]
      const mr = smooth[at(x + 1, y)]
      const bl = smooth[at(x - 1, y + 1)]
      const bc = smooth[at(x, y + 1)]
      const br = smooth[at(x + 1, y + 1)]
      const gx = (tr + 2 * mr + br) - (tl + 2 * ml + bl)
      const gy = (bl + 2 * bc + br) - (tl + 2 * tc + tr)
      const detail = Math.min(1, Math.sqrt(gx * gx + gy * gy) * 1.8)
      const visible = Math.max(a, outline)
      const ink = Math.min(1, (FILL * a + OUTLINE * outline + DETAIL * detail * a) * OVERALL)
      out[i * 4 + 3] = Math.round(ink * visible * 16) * 16
    }
  }
  return { w, h, rgba: out }
}

// ---------------------------------------------------------------- CLI

function parseArgs (argv) {
  const opt = { style: 'pixel', gw: 51, gh: 68, cell: 10 }
  for (const arg of argv) {
    if (arg === '--style=line') opt.style = 'line'
    const grid = /^--grid=(\d+)x(\d+)$/.exec(arg)
    if (grid) {
      opt.gw = Number(grid[1])
      opt.gh = Number(grid[2])
    }
    const cell = /^--cell=(\d+)$/.exec(arg)
    if (cell) opt.cell = Number(cell[1])
  }
  return opt
}

function build (opts = {}) {
  const { style = 'pixel', gw = 51, gh = 68, cell = 10 } = opts
  if (style === 'line') {
    const { w, h, rgba } = buildLineArt()
    writePng(OUTPUT, w, h, rgba)
    return { style, w, h, bytes: fs.statSync(OUTPUT).size }
  }
  const src = readPng(SOURCE)
  const grid = pixelate(src, gw, gh)
  const art = paintColor(grid, cell)
  const mark = paintWatermark(grid, cell)
  writePng(PIXEL_ART, art.w, art.h, art.rgba)
  writePng(OUTPUT, mark.w, mark.h, mark.rgba)
  return {
    style,
    w: mark.w,
    h: mark.h,
    bytes: fs.statSync(OUTPUT).size,
    artBytes: fs.statSync(PIXEL_ART).size
  }
}

if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2))
  const r = build(opts)
  if (r.style === 'pixel') {
    console.log(`wrote ${path.relative(ROOT, PIXEL_ART)} (${r.w}x${r.h}, ${(r.artBytes / 1024).toFixed(1)}KB)`)
  }
  console.log(`wrote ${path.relative(ROOT, OUTPUT)} (${r.w}x${r.h}, ${(r.bytes / 1024).toFixed(1)}KB, ${r.style} style)`)
}

module.exports = {
  INK_LEVELS,
  build,
  buildLineArt,
  paintColor,
  paintWatermark,
  pixelate,
  readPng,
  writePng
}
