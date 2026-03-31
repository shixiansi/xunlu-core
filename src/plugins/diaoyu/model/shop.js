export const SHOP_ITEMS = [
  {
    key: "bait",
    name: "普通鱼饵",
    price: 20,
    unit: "个",
    aliases: ["鱼饵", "普通鱼饵", "普通饵", "饵"],
    desc: "钓鱼必备（默认消耗）",
  },
  {
    key: "bait_adv",
    name: "高级鱼饵",
    price: 80,
    unit: "个",
    aliases: ["高级鱼饵", "高饵", "高级饵", "高级"],
    desc: "提高稀有鱼概率（钓鱼 高级）",
  },
]

export const MAX_ROD_LEVEL = 20

export function rodUpgradeCost(currentLevel) {
  const lv = Math.max(1, Math.floor(Number(currentLevel) || 1))
  // Lv1->2: 200, Lv2->3: 800, Lv3->4: 1800 ...
  return 200 * lv * lv
}

export function findShopItem(query) {
  const q = String(query || "").trim()
  if (!q) return undefined

  const lower = q.toLowerCase()
  return (
    SHOP_ITEMS.find(i => i.key === q || i.key.toLowerCase() === lower) ||
    SHOP_ITEMS.find(i => i.name === q) ||
    SHOP_ITEMS.find(i => Array.isArray(i.aliases) && i.aliases.includes(q))
  )
}

