import fs from "node:fs"
import path from "node:path"
import sharp from "sharp"

const ROOT = path.resolve(import.meta.dirname, ".")
const OUT_DIR = path.join(ROOT, "img", "icons")

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function svgWrap({ bg1, bg2, symbol, stroke = "rgba(255,255,255,.22)" } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="96" height="96" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg1}"/>
      <stop offset="1" stop-color="${bg2}"/>
    </linearGradient>
    <filter id="s" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,.45)"/>
    </filter>
  </defs>
  <rect x="6" y="6" width="84" height="84" rx="18" fill="url(#g)" stroke="${stroke}" stroke-width="2"/>
  <g filter="url(#s)">
    ${symbol}
  </g>
</svg>`
}

function symCheck({ color = "white" } = {}) {
  return `<path d="M26 49.5l12 12L70 30" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`
}

function symCross({ color = "white" } = {}) {
  return `<path d="M30 30l36 36M66 30L30 66" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round"/>`
}

function symCoin() {
  return `
  <g>
    <ellipse cx="46" cy="54" rx="20" ry="14" fill="rgba(0,0,0,.20)"/>
    <ellipse cx="48" cy="46" rx="22" ry="15" fill="#FCD34D" stroke="rgba(0,0,0,.22)" stroke-width="2"/>
    <ellipse cx="48" cy="46" rx="14" ry="9" fill="#FDE68A" opacity="0.95"/>
    <path d="M41 44c2-4 12-6 16 0" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="3" stroke-linecap="round"/>
  </g>`
}

function symRod() {
  return `
  <g>
    <path d="M20 22c24 8 38 26 48 52" fill="none" stroke="white" stroke-width="6" stroke-linecap="round"/>
    <path d="M66 70c-4 1-7 5-6 9 2 5 9 5 12 1" fill="none" stroke="white" stroke-width="6" stroke-linecap="round"/>
    <path d="M30 26l-6 8" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="5" stroke-linecap="round"/>
  </g>`
}

function symWorm({ sparkle = false } = {}) {
  return `
  <g>
    <path d="M40 28c-10 8-12 22-4 30 6 6 16 8 24 2 10-8 10-24 0-32-7-6-14-4-20 0z" fill="none" stroke="white" stroke-width="6" stroke-linecap="round"/>
    <path d="M36 42c6 2 14 2 22-2" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="5" stroke-linecap="round"/>
    ${sparkle ? `<path d="M70 26l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="rgba(255,255,255,.9)"/>` : ""}
  </g>`
}

function symShop() {
  return `
  <g>
    <path d="M26 42h44l-4-14H30z" fill="white" opacity="0.95"/>
    <path d="M26 42v28h44V42" fill="none" stroke="white" stroke-width="6" stroke-linejoin="round"/>
    <path d="M36 70V54h24v16" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="6" stroke-linecap="round"/>
    <path d="M30 42c0 6 6 10 12 10s12-4 12-10" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="6" stroke-linecap="round"/>
    <path d="M42 42c0 6 6 10 12 10s12-4 12-10" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="6" stroke-linecap="round"/>
  </g>`
}

function symBag() {
  return `
  <g>
    <path d="M30 38c2-10 10-16 18-16s16 6 18 16" fill="none" stroke="white" stroke-width="6" stroke-linecap="round"/>
    <path d="M28 38h40l6 40H22z" fill="white" opacity="0.96"/>
    <path d="M36 50c6 6 18 6 24 0" fill="none" stroke="rgba(0,0,0,.20)" stroke-width="6" stroke-linecap="round"/>
  </g>`
}

function symCalendarCheck() {
  return `
  <g>
    <rect x="26" y="24" width="44" height="48" rx="10" fill="white" opacity="0.96"/>
    <path d="M26 36h44" stroke="rgba(0,0,0,.25)" stroke-width="6" stroke-linecap="round"/>
    <path d="M34 20v10M62 20v10" stroke="rgba(0,0,0,.25)" stroke-width="6" stroke-linecap="round"/>
    <path d="M34 52l8 8 18-18" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`
}

function symFish() {
  return `
  <g>
    <path d="M28 50c6-10 16-16 28-16 10 0 18 4 24 10l10-6-6 12 6 12-10-6c-6 6-14 10-24 10-12 0-22-6-28-16z" fill="white" opacity="0.95"/>
    <circle cx="52" cy="46" r="4" fill="rgba(0,0,0,.28)"/>
    <path d="M40 54c6 4 14 4 20 0" fill="none" stroke="rgba(0,0,0,.22)" stroke-width="5" stroke-linecap="round"/>
  </g>`
}

const ICONS = [
  {
    name: "ok.png",
    svg: svgWrap({ bg1: "#22c55e", bg2: "#16a34a", symbol: symCheck() }),
  },
  {
    name: "error.png",
    svg: svgWrap({ bg1: "#ef4444", bg2: "#b91c1c", symbol: symCross() }),
  },
  {
    name: "coin.png",
    svg: svgWrap({ bg1: "#f59e0b", bg2: "#d97706", symbol: symCoin() }),
  },
  {
    name: "rod.png",
    svg: svgWrap({ bg1: "#38bdf8", bg2: "#0284c7", symbol: symRod() }),
  },
  {
    name: "bait.png",
    svg: svgWrap({ bg1: "#f97316", bg2: "#c2410c", symbol: symWorm({ sparkle: false }) }),
  },
  {
    name: "bait_adv.png",
    svg: svgWrap({ bg1: "#fb7185", bg2: "#be123c", symbol: symWorm({ sparkle: true }) }),
  },
  {
    name: "shop.png",
    svg: svgWrap({ bg1: "#14b8a6", bg2: "#0f766e", symbol: symShop() }),
  },
  {
    name: "bag.png",
    svg: svgWrap({ bg1: "#a78bfa", bg2: "#6d28d9", symbol: symBag() }),
  },
  {
    name: "sign.png",
    svg: svgWrap({ bg1: "#34d399", bg2: "#059669", symbol: symCalendarCheck() }),
  },
  {
    name: "fish_trash.png",
    svg: svgWrap({ bg1: "#94a3b8", bg2: "#475569", symbol: symFish() }),
  },
  {
    name: "fish_common.png",
    svg: svgWrap({ bg1: "#22c55e", bg2: "#16a34a", symbol: symFish() }),
  },
  {
    name: "fish_rare.png",
    svg: svgWrap({ bg1: "#60a5fa", bg2: "#2563eb", symbol: symFish() }),
  },
  {
    name: "fish_epic.png",
    svg: svgWrap({ bg1: "#c084fc", bg2: "#7c3aed", symbol: symFish() }),
  },
  {
    name: "fish_legend.png",
    svg: svgWrap({ bg1: "#fbbf24", bg2: "#b45309", symbol: symFish() }),
  },
]

async function main() {
  ensureDir(OUT_DIR)

  for (const icon of ICONS) {
    const outPath = path.join(OUT_DIR, icon.name)
    await sharp(Buffer.from(icon.svg), { density: 300 }).png().toFile(outPath)
    console.log(`[diaoyu] wrote ${path.relative(process.cwd(), outPath)}`)
  }
}

await main()

