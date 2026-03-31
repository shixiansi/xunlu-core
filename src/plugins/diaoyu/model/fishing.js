function randInt(min, max) {
  const a = Number(min)
  const b = Number(max)
  if (!Number.isFinite(a) || !Number.isFinite(b) || a > b) return 0
  return Math.floor(Math.random() * (b - a + 1)) + a
}

function clamp(n, min, max) {
  const v = Number(n)
  if (!Number.isFinite(v)) return min
  return Math.max(min, Math.min(max, v))
}

function weightedPick(list, weightFn) {
  if (!Array.isArray(list) || !list.length) return undefined
  let total = 0
  const weights = list.map(item => {
    const w = Number(weightFn(item))
    const ww = Number.isFinite(w) && w > 0 ? w : 0
    total += ww
    return ww
  })
  if (total <= 0) return list[0]
  let r = Math.random() * total
  for (let i = 0; i < list.length; i++) {
    r -= weights[i]
    if (r <= 0) return list[i]
  }
  return list[list.length - 1]
}

export const BAIT = {
  NORMAL: "bait",
  ADV: "bait_adv",
}

export const BAIT_META = {
  [BAIT.NORMAL]: { name: "普通鱼饵", weightMul: 1, rareMul: 1 },
  [BAIT.ADV]: { name: "高级鱼饵", weightMul: 1.1, rareMul: 1.35 },
}

export const RARITY = {
  TRASH: { name: "垃圾", rank: 0 },
  COMMON: { name: "普通", rank: 1 },
  RARE: { name: "稀有", rank: 2 },
  EPIC: { name: "史诗", rank: 3 },
  LEGEND: { name: "传说", rank: 4 },
}

export const FISH_LIST = [
  { id: "jiyu", name: "鲫鱼", rarity: RARITY.COMMON, minG: 80, maxG: 500, pricePerG: 0.18, w: 42 },
  { id: "liyu", name: "鲤鱼", rarity: RARITY.COMMON, minG: 200, maxG: 1200, pricePerG: 0.14, w: 36 },
  { id: "lianyu", name: "鲢鱼", rarity: RARITY.COMMON, minG: 300, maxG: 1600, pricePerG: 0.12, w: 24 },

  { id: "heiyu", name: "黑鱼", rarity: RARITY.RARE, minG: 280, maxG: 1800, pricePerG: 0.26, w: 14 },
  { id: "caoyu", name: "草鱼", rarity: RARITY.RARE, minG: 500, maxG: 2500, pricePerG: 0.22, w: 10 },

  { id: "jinyu", name: "锦鲤", rarity: RARITY.EPIC, minG: 250, maxG: 1800, pricePerG: 0.55, w: 5 },
  { id: "jingui", name: "金龟鱼", rarity: RARITY.LEGEND, minG: 180, maxG: 1500, pricePerG: 1.05, w: 2 },

  { id: "poxie", name: "破鞋", rarity: RARITY.TRASH, minG: 200, maxG: 900, pricePerG: 0.02, w: 9 },
  { id: "poguow", name: "破锅盖", rarity: RARITY.TRASH, minG: 300, maxG: 1200, pricePerG: 0.02, w: 6 },
]

export function getFishById(id) {
  return FISH_LIST.find(f => f.id === id)
}

export function findFishByName(name) {
  const n = String(name || "").trim()
  if (!n) return undefined
  return (
    FISH_LIST.find(f => f.name === n) ||
    FISH_LIST.find(f => String(f.id).toLowerCase() === n.toLowerCase())
  )
}

export function rollCatch({ rodLevel = 1, baitKey = BAIT.NORMAL } = {}) {
  const rod = clamp(rodLevel, 1, 50)
  const bait = BAIT_META[baitKey] || BAIT_META[BAIT.NORMAL]

  const fish = weightedPick(FISH_LIST, f => {
    let weight = Number(f.w || 1)
    if (!Number.isFinite(weight) || weight <= 0) weight = 1

    // 鱼竿提升稀有度（越高越容易出高稀有）
    if ((f.rarity?.rank ?? 0) >= RARITY.RARE.rank) {
      weight *= 1 + (rod - 1) * 0.06
    } else if ((f.rarity?.rank ?? 0) <= RARITY.TRASH.rank) {
      weight *= 1 - Math.min(0.35, (rod - 1) * 0.02)
    }

    // 高级鱼饵倾向高稀有，压低垃圾
    if (baitKey === BAIT.ADV) {
      if ((f.rarity?.rank ?? 0) >= RARITY.RARE.rank) weight *= bait.rareMul
      if ((f.rarity?.rank ?? 0) <= RARITY.TRASH.rank) weight *= 0.75
    }

    return weight
  })

  const baseG = randInt(fish.minG, fish.maxG)
  const rodMul = 1 + (rod - 1) * 0.05
  const weightG = Math.max(1, Math.floor(baseG * rodMul * bait.weightMul))

  const value = Math.max(0, Math.floor(weightG * Number(fish.pricePerG || 0)))

  return { fish, weightG, value, bait }
}

