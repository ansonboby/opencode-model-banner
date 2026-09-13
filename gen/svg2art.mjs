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
  svg = svg.replace(/ fill="[^"]*"/g, '').replace(/ stroke="[^"]*"/g, '').replace(/ style="[^"]*"/g, '')
  svg = svg.replace('<svg', `<svg fill="${color}"`)
  if (stretchX !== 1) {
    // scale content horizontally around center: wrap all children in <g>
    const open = svg.indexOf('>') + 1
    const close = svg.lastIndexOf('</svg>')
    const head = svg.slice(0, open)
    const body = svg.slice(open, close)
    // scale around viewBox center so content stays in frame
    const m = svg.match(/viewBox="([\d.+-]+)[\s,]+([\d.+-]+)[\s,]+([\d.+-]+)[\s,]+([\d.+-]+)"/)
    const cx = m ? (Number(m[1]) + Number(m[3]) / 2) : 12
    svg = `${head}<g transform="translate(${cx},0) scale(${stretchX},1) translate(${-cx},0)">${body}</g></svg>`
  }
  return svg
}

function convert(svgFile, key, targetRows) {
  const [top, bot] = GRADIENTS[key]
  const svg = normalize(readFileSync(svgFile, 'utf8'), top, STRETCH[key] ?? 1)
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
  // natural alpha grid: colsN x rows*2 sub-cells
  const colsN = Math.max(1, Math.ceil(w / (CELL_W)))
  const grid = []
  for (let gy = 0; gy < rows; gy++) {
    const rowT = [], rowB = []
    for (let gx = 0; gx < colsN; gx++) {
      rowT.push(covPx(gx, gy, 0))
      rowB.push(covPx(gx, gy, 1))
    }
    grid.push([rowT, rowB])
  }
  // vertical scale ok (fitTo height matches rows). horizontal bilinear to cols:
  const covGrid = []
  for (let gy = 0; gy < rows; gy++) {
    const topR = [], botR = []
    for (let gx = 0; gx < cols; gx++) {
      const sx = (gx + 0.5) / cols * colsN - 0.5
      const i0 = Math.max(0, Math.min(colsN - 1, Math.floor(sx)))
      const i1 = Math.max(0, Math.min(colsN - 1, i0 + 1))
      const fx = Math.max(0, Math.min(1, sx - i0))
      for (const [srcRow, dst] of [[grid[gy][0], topR], [grid[gy][1], botR]]) {
        dst.push(srcRow[i0] * (1 - fx) + srcRow[i1] * fx)
      }
    }
    covGrid.push([topR, botR])
  }
  function covPx(gx, gy, sub) {
    const y0 = gy * CELL_H + sub * CELL_H / 2
    let tot = 0, n = 0
    for (let y = y0; y < y0 + CELL_H / 2; y += SS) {
      if (y >= h) continue
      for (let x = gx * CELL_W; x < (gx + 1) * CELL_W; x += SS) {
        if (x >= w) continue
        tot += px[(y * w + x) * 4 + 3] > 128 ? 1 : 0
        n++
      }
    }
    return n ? tot / n : 0
  }

  const colors = Array.from({ length: PALETTE }, (_, i) => toHex(lerp(hexToRgb(top), hexToRgb(bot), i / (PALETTE - 1))))

  const runs = []
  for (let gy = 0; gy < rows; gy++) {
    const segs = []
    for (let gx = 0; gx < cols; gx++) {
      const cT = covGrid[gy][0][gx], cB = covGrid[gy][1][gx]
      const onT = cT > 0.5, onB = cB > 0.5
      if (!onT && !onB) {
        // blank cell: emit a space run so internal gaps (Z cutouts, fluke
        // notches, ring holes) survive run-length compression and keep ink
        // at its true column offset
        segs.push([-1, ' '])
        continue
      }
      const t = rows <= 1 ? 0 : gy / (rows - 1)
      let idx = Math.round(t * (PALETTE - 1))
      const edge = onT && onB ? Math.min(cT, cB) : Math.max(cT, cB)
      if (edge < 0.85) idx = Math.min(PALETTE - 1, idx + 1)
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
const STRETCH = {
  deepseek: 1.0,   // hand-authored mockup whale already wide
  zai: 1.4,
  kimi: 1.3,
  grok: 1.5,
  qwen: 1.4,
  minimax: 2.0,
  gemini: 1.2,
  claude: 1.2,
  mistral: 1.4,
  nvidia: 1.3,
  openai: 1.3,
  stepfun: 1.4,
  tencent: 1.2,
  bytedance: 1.4,
}

const FILES = {
  deepseek: ['icons/whale-mockup.svg', 17],
  zai: ['icons/zai.svg', 16],
  kimi: ['icons/kimi.svg', 16],
  grok: ['icons/grok.svg', 16],
  qwen: ['icons/qwen.svg', 16],
  minimax: ['icons/minimax.svg', 16],
  openai: ['icons/openai.svg', 16],
  gemini: ['icons/gemini.svg', 16],
  claude: ['icons/claude.svg', 16],
  mistral: ['icons/mistral.svg', 16],
  nvidia: ['icons/nvidia.svg', 16],
  stepfun: ['icons/stepfun.svg', 16],
  tencent: ['icons/tencent.svg', 16],
  bytedance: ['icons/bytedance.svg', 16],
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
