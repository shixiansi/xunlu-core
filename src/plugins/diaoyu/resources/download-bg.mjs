import fs from "node:fs"
import path from "node:path"
import sharp from "sharp"

const ROOT = path.resolve(import.meta.dirname, ".")
const OUT_DIR = path.join(ROOT, "img", "bg")

const BG_SOURCE = "https://cdn.pixabay.com/photo/2021/05/25/00/33/background-6280938_1280.jpg"

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

async function fetchBuffer(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  const arr = await res.arrayBuffer()
  return Buffer.from(arr)
}

async function main() {
  ensureDir(OUT_DIR)
  const outPath = path.join(OUT_DIR, "water.jpg")
  const buf = await fetchBuffer(BG_SOURCE)

  await sharp(buf)
    .resize(1600, 900, { fit: "cover", position: "entropy" })
    .jpeg({ quality: 78, progressive: true })
    .toFile(outPath)

  const attribution = `Source: ${BG_SOURCE}\nLicense: https://pixabay.com/service/license/\n`
  fs.writeFileSync(path.join(OUT_DIR, "ATTRIBUTION.txt"), attribution, "utf8")

  console.log(`[diaoyu] wrote ${path.relative(process.cwd(), outPath)}`)
}

await main()

