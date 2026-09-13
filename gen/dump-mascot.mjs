// dump-mascot.mjs — render icons/mascot-<brand>.svg to a 73x30 ASCII grid.
// Usage: bun run dump-mascot.mjs <brand>
// '#' = ink, '.' = empty. This is the ground-truth visual check for mascot SVGs.
import { Resvg } from '@resvg/resvg-js'
import { readFileSync } from 'node:fs'

const brand = process.argv[2]
if (!brand) { console.error('usage: bun run dump-mascot.mjs <brand>'); process.exit(1) }
const svg = readFileSync(new URL(`./icons/mascot-${brand}.svg`, import.meta.url), 'utf8')
const r = new Resvg(svg, { fitTo: { mode: 'height', value: 1500 } })
const rendered = r.render()
const { width: w, height: h, pixels: px } = rendered
const COLS = 73, ROWS = 30
let minX = 99, maxX = -1, minY = 99, maxY = -1
for (let gy = 0; gy < ROWS; gy++) {
  let row = ''
  for (let gx = 0; gx < COLS; gx++) {
    const x = Math.min(w - 1, Math.floor(gx * w / COLS))
    const y = Math.min(h - 1, Math.floor(gy * h / ROWS))
    const on = px[(y * w + x) * 4 + 3] > 128
    if (on) { if (gx < minX) minX = gx; if (gx > maxX) maxX = gx; if (gy < minY) minY = gy; if (gy > maxY) maxY = gy }
    row += on ? '#' : '.'
  }
  console.log(row)
}
console.log(`ink bbox: x ${minX}..${maxX} (span ${maxX - minX + 1}/73), y ${minY}..${maxY} (span ${maxY - minY + 1}/30)`)
console.log('target: x-span >= 50 cols, y-span >= 26 rows (fills the banner frame)')
