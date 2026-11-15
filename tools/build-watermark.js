#!/usr/bin/env node
/**
 * Pixel-art pipeline for the fatfish terminal watermark.
 *
 * `assets/source-front.png` is reduced to a 51 x 68 grid of flat colour blocks
 * (10px each), each snapped to one of eight colours, and written to
 * `assets/fatfish-pixel-art.png`. The widget can show that sprite directly, or
 * show the untouched source PNG; this script only builds the pixel version.
 *
 * No dependencies: PNG decode/encode is node:zlib, everything else is plain
 * arithmetic. Run `npm run build` to reproduce. `--grid=51x68` and `--cell=10`
 * change the pixel size.
 */

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const ROOT = path.join(__dirname, '..')
const SOURCE = path.join(ROOT, 'assets', 'source-front.png')
const PIXEL_ART = path.join(ROOT, 'assets', 'fatfish-pixel-art.png')

// eight flat colours for the pixel sprite (white headdress / apron, blue hair
// at three depths, ink outline, skin, gold trim)
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

// ---------------------------------------------------------------- pixel art

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
 * coverage, and the nearest palette index.
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
        color: nearestColor(cr * 255, cg * 255, cb * 255)
      })
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

function paintColor (grid, cell) {
  return paintCells(grid, cell, c => {
    if (c.cov <= 0.45) {
      return [0, 0, 0, 0]
    }
    const [r, g, b] = COLORS[c.color]
    return [r, g, b, 255]
  })
}

// ---------------------------------------------------------------- CLI

function parseArgs (argv) {
  const opt = { gw: 51, gh: 68, cell: 10 }
  for (const arg of argv) {
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
  const { gw = 51, gh = 68, cell = 10 } = opts
  const src = readPng(SOURCE)
  const grid = pixelate(src, gw, gh)
  const art = paintColor(grid, cell)
  writePng(PIXEL_ART, art.w, art.h, art.rgba)
  return { w: art.w, h: art.h, bytes: fs.statSync(PIXEL_ART).size }
}

if (require.main === module) {
  const r = build(parseArgs(process.argv.slice(2)))
  console.log(`wrote ${path.relative(ROOT, PIXEL_ART)} (${r.w}x${r.h}, ${(r.bytes / 1024).toFixed(1)}KB)`)
}

module.exports = {
  build,
  paintColor,
  pixelate,
  readPng,
  writePng
}
