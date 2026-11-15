#!/usr/bin/env node
/**
 * Build assets/fatfish-watermark.png from the MIT-licensed chibi whale-girl
 * sprite in assets/source-front.png.
 *
 * No dependencies: PNG decode/encode is done with node:zlib, and the drawing
 * is plain arithmetic over an RGBA buffer. Run `npm run build` to reproduce.
 *
 * The output is an alpha-only line drawing on a transparent canvas:
 *   - neutral grey ink, so the PNG is readable on both light and dark
 *     backgrounds when used directly as an electerm background image;
 *   - only its alpha channel matters to the widget, which uses it as a CSS
 *     mask and paints it with the theme's --text colour. See README.md.
 */

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const ROOT = path.join(__dirname, '..')
const SOURCE = path.join(ROOT, 'assets', 'source-front.png')
const OUTPUT = path.join(ROOT, 'assets', 'fatfish-watermark.png')

const SCALE = 2
const INK = 143 // neutral grey (#8f8f8f): visible on both #000 and #fff
const FILL = 0.09 // faint body volume
const OUTLINE = 0.95 // silhouette edge
const DETAIL = 0.42 // interior lines
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

// ---------------------------------------------------------------- drawing

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

function build () {
  const { w: sw, h: sh, rgba: src } = readPng(SOURCE)
  const { w, h, rgba } = scale2x(src, sw, sh)
  const n = w * h

  const lum = new Float32Array(n)
  const alpha = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const d = i * 4
    // composite onto white before measuring edges, so a transparent black
    // pixel does not look like a dark line next to the character
    const a = rgba[d + 3] / 255
    const r = (rgba[d] * a + 255 * (1 - a)) / 255
    const g = (rgba[d + 1] * a + 255 * (1 - a)) / 255
    const b = (rgba[d + 2] * a + 255 * (1 - a)) / 255
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b
    alpha[i] = a
  }

  // 3x3 box blur tames hair highlights before the Sobel pass
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

      // silhouette edge: dilate - erode of the alpha channel over 3x3
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

      // interior detail: Sobel gradient of the smoothed luminance
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

      // the fill gives the silhouette some volume; lines sit on top of it.
      // `visible` keeps the outer half of the outline, which lies on a=0.
      const visible = Math.max(a, outline)
      const ink = Math.min(1,
        (FILL * a + OUTLINE * outline + DETAIL * detail * a) * OVERALL
      )
      // 16 alpha levels are indistinguishable at watermark opacity and cut
      // the PNG (and the base64 CSS the widget injects) to a third of the size
      out[i * 4 + 3] = Math.round(ink * visible * 16) * 16
    }
  }

  writePng(OUTPUT, w, h, out)
  return { w, h, bytes: fs.statSync(OUTPUT).size }
}

if (require.main === module) {
  const { w, h, bytes } = build()
  console.log(`wrote ${path.relative(ROOT, OUTPUT)} (${w}x${h}, ${(bytes / 1024).toFixed(1)}KB)`)
}

module.exports = { build, readPng, writePng }
