// SVG -> gradient half-block art. Clean rewrite.
// Strategy:
//  1. Normalize SVG to solid silhouette with brand top color.
//  2. Render large: height = targetRows * 2 sub-rows * SS px each, so each
//     half-block sub-row is exactly SS*?px... simpler: render so that ONE
//     GLYPH CELL = (CELL_W*SS, CELL_H*SS) px = (64, 128) with SS=8.
//  3. fitTo mode 'height' => glyph rows = targetRows exactly.
//  4. Coverage per half-cell from alpha. Glyph = ▀▄█ . Color idx from vertical
//     gradient. Partial coverage => +1 darker (edge anti-aliasing effect).
import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'node:fs'

const GRADIENTS = {
  deepseek: ['#8AA6FF', '#1B3AA8'],
  zai: ['#7DE8FA', '#0B6E8A'],
  kimi: ['#FFE1A0', '#B5760C'],
  grok: ['#F2F4F7', '#6B7280'],
  qwen: ['#9D8DF7', '#2C2170'],
  minimax: ['#FC8CAC', '#7C1633'],
  openai: ['#5BE3C4', '#0D5C4A'],
  gemini: ['#8FB4FF', '#1D42A6'],
  claude: ['#F2A488', '#7C3E22'],
  mistral: ['#FF9455', '#7A2000'],
  nvidia: ['#A9E24D', '#1F4E00'],
  stepfun: ['#9DC4FF', '#123C8C'],
  tencent: ['#6FB7FF', '#0E3D7A'],
  bytedance: ['#5EC8FF', '#0C4E82'],
  opencode: ['#9FE8C8', '#1A5C46'],
}

const PALETTE = 12
const GLYPH = { '11': '█', '10': '▀', '01': '▄', '00': ' ' }

const hexToRgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)
const toHex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')

function normalize(svg, color, stretchX = 1) {
  // Preserve author fill tones: any path whose fill is NOT one of the three
  // reserved tone anchors (#fff white hi, #000 black sh) keeps its fill —
  // classified hi/base/sh by luminance vs the brand color. Reserved anchors
  // map to hi/sh explicitly. Everything else (no fill, currentColor, url())
  // becomes base = brand color.
  const brand = hexToRgb(color)
  const tones = new Map() // per-fill resolved tone id
  const brandFill = `#${toHex(brand).slice(1)}`
  // strip any fill on the <svg> root itself (resvg rejects duplicate attrs);
  // path-level fills are preserved for tone classification
  svg = svg.replace(/<svg\s+fill="[^"]*"/, '<svg')
  svg = svg.replace(/<svg(\s)/, `<svg fill="${brandFill}"$1`)
  if (stretchX !== 1) {
    const open = svg.indexOf('>') + 1
    const close = svg.lastIndexOf('</svg>')
    const head = svg.slice(0, open)
    const body = svg.slice(open, close)
    const m = svg.match(/viewBox="([\d.+-]+)[\s,]+([\d.+-]+)[\s,]+([\d.+-]+)[\s,]+([\d.+-]+)"/)
    const cx = m ? (Number(m[1]) + Number(m[3]) / 2) : 12
    svg = `${head}<g transform="translate(${cx},0) scale(${stretchX},1) translate(${-cx},0)">${body}</g></svg>`
  }
  return { svg, tones, brandFill }
}

function classify(fill, brandLum) {
  if (!fill) return 'base'
  const f = fill.toLowerCase()
  if (f === '#fff' || f === '#ffffff' || f === 'white') return 'hi'
  if (f === '#000' || f === '#000000' || f === 'black') return 'sh'
  if (f === 'currentcolor' || f.startsWith('url(')) return 'base'
  try {
    const lum = rgbLum(hexToRgb(f.startsWith('#') ? f : color))
  } catch { return 'base' }
  if (lum > brandLum + 0.18) return 'hi'
  if (lum < brandLum - 0.18) return 'sh'
  return 'base'
}

function rgbLum([r, g, b]) { return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 }

function convert(svgFile, key, targetRows) {
  const [top, bot] = GRADIENTS[key]
  const { svg } = normalize(readFileSync(svgFile, 'utf8'), top, STRETCH[key] ?? 1)
  const SS = 8
  const CELL_W = 8 * SS   // 64 px per glyph cell horizontally
  const CELL_H = 16 * SS  // 128 px per glyph cell vertically
  const renderH = targetRows * CELL_H
  const r = new Resvg(svg, { fitTo: { mode: 'height', value: renderH } })
  const rendered = r.render()
  const w = rendered.width, h = rendered.height, px = rendered.pixels
  const rows = targetRows
  // terminal glyph cell is ~1:2 (w:h); preserve the SVG's visual aspect
  const cols = Math.max(2, Math.round((w / h) * rows * 2 * (STRETCH[key] ?? 1)))
  const colsN = Math.max(1, Math.ceil(w / CELL_W))

  // Per-render classify: sample the rendered fill color of every ink pixel
  // to recover author tones (resvg preserves fills). A cell's tone = the
  // most common ink-pixel color class in its area.
  const inkAt = (x, y) => {
    const a = px[(y * w + x) * 4 + 3]
    if (a < 128) return null
    const r0 = px[(y * w + x) * 4], g0 = px[(y * w + x) * 4 + 1], b0 = px[(y * w + x) * 4 + 2]
    return [r0, g0, b0]
  }
  // brand luminance for tone classification
  const brandLum = rgbLum(hexToRgb(top))

  function covPx(gx, gy, sub) {
    // returns { cov, tone } — coverage fraction + dominant tone letter
    const y0 = gy * CELL_H + sub * CELL_H / 2
    let ink = 0, n = 0
    const toneCount = { hi: 0, base: 0, sh: 0 }
    for (let y = y0; y < y0 + CELL_H / 2; y += SS) {
      if (y >= h) continue
      const yi = Math.floor(y)
      for (let x = gx * CELL_W; x < (gx + 1) * CELL_W; x += SS) {
        if (x >= w) continue
        const xi = Math.floor(x)
        n++
        const c = inkAt(xi, yi)
        if (!c) continue
        ink++
        const lum = rgbLum(c)
        const sat = Math.max(...c) - Math.min(...c)
        // white fill → hi, black fill → sh; otherwise luminance vs brand
        let tone = 'base'
        if (lum > 0.93 && sat < 25) tone = 'hi'
        else if (lum < 0.1) tone = 'sh'
        else if (lum > brandLum + 0.18) tone = 'hi'
        else if (lum < brandLum - 0.18) tone = 'sh'
        toneCount[tone]++
      }
    }
    const tone = ink === 0 ? 'base' :
      (toneCount.hi >= ink * 0.55 ? 'hi' : toneCount.sh >= ink * 0.55 ? 'sh' : 'base')
    return n ? { cov: ink / n, tone } : { cov: 0, tone: 'base' }
  }

  // natural grid (colsN wide) with tone per half-cell
  const grid = []
  for (let gy = 0; gy < rows; gy++) {
    const rowT = [], rowB = []
    for (let gx = 0; gx < colsN; gx++) {
      rowT.push(covPx(gx, gy, 0))
      rowB.push(covPx(gx, gy, 1))
    }
    grid.push([rowT, rowB])
  }

  // horizontal bilinear resize to cols (coverage linear, tone nearest)
  const covGrid = []
  for (let gy = 0; gy < rows; gy++) {
    const topR = [], botR = []
    for (let gx = 0; gx < cols; gx++) {
      const sx = (gx + 0.5) / cols * colsN - 0.5
      const i0 = Math.max(0, Math.min(colsN - 1, Math.floor(sx)))
      const i1 = Math.max(0, Math.min(colsN - 1, i0 + 1))
      const fx = Math.max(0, Math.min(1, sx - i0))
      for (const [srcRow, dst] of [[grid[gy][0], topR], [grid[gy][1], botR]]) {
        const cov = srcRow[i0].cov * (1 - fx) + srcRow[i1].cov * fx
        const tone = fx < 0.5 ? srcRow[i0].tone : srcRow[i1].tone
        dst.push({ cov, tone })
      }
    }
    covGrid.push([topR, botR])
  }

  // ---------- palette: 16 steps + aura ----------
  const PALETTE16 = 16
  const colors = Array.from({ length: PALETTE16 }, (_, i) =>
    toHex(lerp(hexToRgb(top), hexToRgb(bot), i / (PALETTE16 - 1))))

  // diagonal light: light comes from upper-left; brightness rises toward
  // upper-left corner of the ink bbox, falls toward lower-right
  let minX = cols, maxX = -1, minY = rows, maxY = -1
  for (let gy = 0; gy < rows; gy++)
    for (let gx = 0; gx < cols; gx++) {
      const { cov } = covGrid[gy][0][gx]
      if (cov > 0.5) { if (gx < minX) minX = gx; if (gx > maxX) maxX = gx; if (gy < minY) minY = gy; if (gy > maxY) maxY = gy }
    }
  const diag = (gx, gy) => {
    if (maxX < minX) return 0.5
    const nx = (gx - minX) / Math.max(1, maxX - minX)          // 0 left → 1 right
    const ny = (gy - minY) / Math.max(1, maxY - minY)          // 0 top → 1 bottom
    return 1 - (nx + ny) / 2                                    // 1 at upper-left → 0 at lower-right
  }

  // neighbors of an (gx, gy) half-cell (4-neighborhood)
  const ink = (gx, gy, sub) => {
    if (gy < 0 || gy >= rows || gx < 0 || gx >= cols) return 0
    return covGrid[gy][sub][gx].cov
  }

  const runs = []
  for (let gy = 0; gy < rows; gy++) {
    const segs = []
    for (let gx = 0; gx < cols; gx++) {
      const cT = covGrid[gy][0][gx], cB = covGrid[gy][1][gx]
      const onT = cT.cov > 0.5, onB = cB.cov > 0.5
      if (!onT && !onB) {
        // soft aura: ink adjacent (within 1 cell) but this cell empty →
        // sparse ▒ dither in a palette color, else plain blank
        const near = Math.max(
          ink(gx - 1, gy, 0), ink(gx + 1, gy, 0),
          ink(gx - 1, gy, 1), ink(gx + 1, gy, 1),
          ink(gx, gy - 1, 0), ink(gx, gy + 1, 0),
        )
        if (near > 0.5) {
          // gentle: aura only in the darker half of the palette (below top)
          const t = rows <= 1 ? 0.5 : gy / (rows - 1)
          const aidx = Math.min(PALETTE16 - 1, Math.round(t * (PALETTE16 - 1) * 0.6 + PALETTE16 * 0.25))
          segs.push([aidx, '▒'])
        } else {
          segs.push([-1, ' '])
        }
        continue
      }
      // vertical gradient position 0..1 within art
      const t = rows <= 1 ? 0 : gy / (rows - 1)
      // base idx from vertical gradient (like before)
      let idx = Math.round(t * (PALETTE16 - 1))
      // diagonal light bias: brighten toward upper-left, darken toward
      // lower-right — but keep the vertical gradient as the anchor tone
      const d = diag(gx, gy)
      idx = Math.round(idx + (d - 0.5) * 8)
      idx = Math.max(0, Math.min(PALETTE16 - 1, idx))
      // author tone: hi lifts toward top of palette, sh drops toward bottom
      const tone = onT && onB ? (cT.tone === cB.tone ? cT.tone : 'base') : (onT ? cT.tone : cB.tone)
      if (tone === 'hi') idx = Math.max(0, idx - 5)
      else if (tone === 'sh') idx = Math.min(PALETTE16 - 1, idx + 5)
      // rim: edge cell (partial coverage) — upper-left edges get a bright rim,
      // lower-right edges get a dark rim (light direction consistent)
      const edge = onT && onB ? Math.min(cT.cov, cB.cov) : Math.max(cT.cov, cB.cov)
      if (edge < 0.85) {
        if (d > 0.55) idx = Math.max(0, idx - 3)   // lit rim
        else idx = Math.min(PALETTE16 - 1, idx + 2) // shade rim
      }
      segs.push([idx, GLYPH[`${onT ? 1 : 0}${onB ? 1 : 0}`]])
    }
    const merged = []
    for (const s of segs) {
      const last = merged[merged.length - 1]
      if (last && last[0] === s[0]) last[1] += s[1]
      else merged.push(s)
    }
    // trim only TRAILING blanks; leading blanks carry the first ink's column
    while (merged.length && merged[merged.length - 1][0] === -1) merged.pop()
    runs.push(merged)
  }
  while (runs.length && runs[0].length === 0) runs.shift()
  while (runs.length && runs[runs.length - 1].length === 0) runs.pop()
  return { runs, colors }
}

// brand -> [svg, glyph row budget]
// mascot SVGs are authored at banner aspect (730x300) — no stretch needed
const STRETCH = {
  deepseek: 1.0,
  zai: 1.0,
  kimi: 1.0,
  grok: 1.0,
  qwen: 1.0,
  minimax: 1.0,
  gemini: 1.0,
  claude: 1.0,
  mistral: 1.0,
  nvidia: 1.0,
  openai: 1.0,
  stepfun: 1.0,
  tencent: 1.0,
  bytedance: 1.0,
}

const FILES = {
  // hand-authored mascots (730x300 banner aspect, ink fills ~90% height)
  deepseek: ['icons/whale-mockup.svg', 17],
  zai: ['icons/mascot-zai.svg', 17],
  kimi: ['icons/mascot-kimi.svg', 17],
  grok: ['icons/mascot-grok.svg', 17],
  qwen: ['icons/mascot-qwen.svg', 17],
  minimax: ['icons/mascot-minimax.svg', 17],
  openai: ['icons/mascot-openai.svg', 17],
  gemini: ['icons/mascot-gemini.svg', 17],
  claude: ['icons/mascot-claude.svg', 17],
  mistral: ['icons/mascot-mistral.svg', 17],
  nvidia: ['icons/mascot-nvidia.svg', 17],
  stepfun: ['icons/mascot-stepfun.svg', 17],
  tencent: ['icons/mascot-tencent.svg', 17],
  bytedance: ['icons/mascot-bytedance.svg', 17],
  opencode: ['icons/opencode.svg', 16],
}

const out = {}
for (const [key, [file, rows]] of Object.entries(FILES)) {
  out[key] = convert(file, key, rows)
  const maxCols = out[key].runs.reduce((m, r) => Math.max(m, r.reduce((a, [, t]) => a + t.length, 0)), 0)
  console.log(key, out[key].runs.length, 'rows', maxCols, 'cols')
}
writeFileSync(new URL('./art.json', import.meta.url).pathname, JSON.stringify(out))

let prev = ''
for (const key of Object.keys(out)) {
  prev += `=== ${key} ===\n`
  const colors = out[key].colors
  for (const run of out[key].runs) {
    let line = ''
    for (const [idx, text] of run) {
      if (idx === -1) { line += text; continue }
      const c = colors[idx]
      line += `\x1b[38;2;${parseInt(c.slice(1,3),16)};${parseInt(c.slice(3,5),16)};${parseInt(c.slice(5,7),16)}m${text}`
    }
    prev += line + '\x1b[0m\n'
  }
}
writeFileSync(new URL('./preview.ans', import.meta.url).pathname, prev)
console.log('wrote art.json + preview.ans')
