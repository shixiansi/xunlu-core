import fs from "node:fs"
import path from "node:path"
import sharp from "sharp"

import { FISH_LIST, RARITY } from "../model/fishing.js"

const ROOT = path.resolve(import.meta.dirname, ".")
const OUT_DIR = path.join(ROOT, "img", "catch")
const OUT_SIZE = 256

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function toHex(n) {
  const v = Math.max(0, Math.min(255, Math.round(n)))
  return v.toString(16).padStart(2, "0")
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t)
}

function hexToRgb(hex) {
  const h = String(hex || "").replace("#", "").trim()
  if (h.length !== 6) return { r: 0, g: 0, b: 0 }
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return { r, g, b }
}

function rgbToHex({ r, g, b }) {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function lighten(hex, t) {
  const { r, g, b } = hexToRgb(hex)
  return rgbToHex({ r: mix(r, 255, t), g: mix(g, 255, t), b: mix(b, 255, t) })
}

function rarityColor(rank) {
  switch (rank) {
    case RARITY.LEGEND.rank:
      return "#FBBF24"
    case RARITY.EPIC.rank:
      return "#C084FC"
    case RARITY.RARE.rank:
      return "#60A5FA"
    case RARITY.COMMON.rank:
      return "#22C55E"
    default:
      return "#94A3B8"
  }
}

const EMOJI_BY_ID = {
  jiyu: "1f41f", // 🐟
  liyu: "1f38f", // 🎏
  lianyu: "1f421", // 🐡
  heiyu: "1f988", // 🦈
  caoyu: "1f42c", // 🐬
  jinyu: "1f420", // 🐠
  jingui: "1f422", // 🐢
  poxie: "1f45e", // 👞
  poguow: "1f372", // 🍲
}

// Real-photo sources (Pixabay CDN). These URLs are stable and do not require scraping pixabay.com (Cloudflare).
// Replace/extend freely if you prefer other pictures.
const PIXABAY_CDN_BY_ID = {
  jiyu: "https://cdn.pixabay.com/photo/2021/01/08/09/22/crucian-carp-5899353_1280.jpg",
  liyu: "https://cdn.pixabay.com/photo/2018/08/05/08/30/carp-3585162_1280.jpg",
  lianyu: "https://cdn.pixabay.com/photo/2020/03/10/09/55/the-silver-carp-4918472_1280.jpg",
  heiyu: "https://cdn.pixabay.com/photo/2020/03/10/11/01/channa-bleheri-4918621_1280.jpg",
  caoyu: "https://cdn.pixabay.com/photo/2022/09/21/02/29/carp-7469238_1280.jpg",
  jinyu: "https://cdn.pixabay.com/photo/2020/06/13/12/54/koi-5294163_1280.jpg",
  jingui: "https://cdn.pixabay.com/photo/2022/04/14/00/15/turtle-7131341_1280.jpg",
  poxie: "https://cdn.pixabay.com/photo/2018/06/26/13/59/old-shoes-3499451_1280.jpg",
  poguow: "https://cdn.pixabay.com/photo/2013/08/28/18/57/pot-176839_1280.jpg",
}

function twemojiUrl(code) {
  return `https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/${code}.png`
}

function twemojiFallbackUrls(code) {
  return [
    `https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/${code}.png`,
    `https://unpkg.com/twemoji@14.0.2/assets/72x72/${code}.png`,
    `https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/${code}.png`,
  ]
}

async function fetchBuffer(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`)
  }
  const arr = await res.arrayBuffer()
  return Buffer.from(arr)
}

function placeholderSvg({ color, idText }) {
  const c1 = lighten(color, 0.05)
  const c2 = lighten(color, 0.35)
  const text = String(idText || "").slice(0, 10).toUpperCase()
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="192" height="192" viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c2}"/>
      <stop offset="1" stop-color="${c1}"/>
    </linearGradient>
  </defs>
  <rect x="10" y="10" width="172" height="172" rx="40" fill="url(#g)" stroke="rgba(255,255,255,.18)" stroke-width="4"/>
  <path d="M46 102c12-20 30-32 52-32 18 0 32 8 44 20l18-10-10 22 10 22-18-10c-12 12-26 20-44 20-22 0-40-12-52-32z" fill="rgba(255,255,255,.92)"/>
  <circle cx="100" cy="88" r="7" fill="rgba(0,0,0,.25)"/>
  <text x="96" y="166" text-anchor="middle" font-size="18" font-family="Arial, sans-serif" fill="rgba(0,0,0,.55)">${text}</text>
</svg>`
}

async function buildImage({ id, emojiCode, color }) {
  const outPath = path.join(OUT_DIR, `${id}.png`)

  try {
    const pixabayUrl = PIXABAY_CDN_BY_ID[id]
    if (pixabayUrl) {
      const imgBuf = await fetchBuffer(pixabayUrl)
      await sharp(imgBuf)
        .resize(OUT_SIZE, OUT_SIZE, { fit: "cover", position: "entropy" })
        .png({ compressionLevel: 9 })
        .toFile(outPath)
      return { ok: true, outPath, source: "pixabay" }
    }

    let emojiBuf = null
    let lastError = null
    for (const url of twemojiFallbackUrls(emojiCode)) {
      try {
        emojiBuf = await fetchBuffer(url)
        lastError = null
        break
      } catch (err) {
        lastError = err
      }
    }
    if (!emojiBuf) throw lastError || new Error("download failed")

    await sharp(emojiBuf)
      .resize(OUT_SIZE, OUT_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(outPath)
    return { ok: true, outPath, source: "twemoji" }
  } catch (err) {
    if (fs.existsSync(outPath)) {
      return { ok: false, outPath, source: "keep-existing", error: err?.message || String(err) }
    }
    const svg = placeholderSvg({ color, idText: id })
    await sharp(Buffer.from(svg), { density: 300 })
      .resize(OUT_SIZE, OUT_SIZE, { fit: "cover" })
      .png({ compressionLevel: 9 })
      .toFile(outPath)
    return { ok: false, outPath, source: "placeholder", error: err?.message || String(err) }
  }
}

async function main() {
  ensureDir(OUT_DIR)

  const missing = []

  for (const fish of FISH_LIST) {
    const id = String(fish.id || "").trim()
    if (!id) continue
    const emojiCode = EMOJI_BY_ID[id] || "1f41f"
    const color = rarityColor(Number(fish.rarity?.rank ?? 0))
    const res = await buildImage({ id, emojiCode, color })
    console.log(`[diaoyu] catch image ${id}.png -> ${res.source}`)
    if (!res.ok) {
      missing.push({ id, err: res.error })
    }
  }

  if (missing.length) {
    console.warn("[diaoyu] Some images failed to download, used placeholders:")
    for (const m of missing) console.warn(`- ${m.id}: ${m.err}`)
  }
}

await main()
