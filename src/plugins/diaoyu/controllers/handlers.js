import {
  dateKey,
  getOrCreateUser,
  loadDb,
  normalizeUserId,
  saveDb,
  touchUser,
  yesterdayKey,
} from "../model/store.js"
import { BAIT, BAIT_META, findFishByName, getFishById, rollCatch } from "../model/fishing.js"
import { getSignRewards } from "../model/config.js"
import { findShopItem, MAX_ROD_LEVEL, rodUpgradeCost, SHOP_ITEMS } from "../model/shop.js"

function sumFishCount(fishMap) {
  if (!fishMap || typeof fishMap !== "object") return 0
  let total = 0
  for (const k of Object.keys(fishMap)) {
    const v = fishMap[k]
    const c = Number(v?.count ?? 0)
    if (Number.isFinite(c) && c > 0) total += c
  }
  return total
}

function getItemCount(items, key) {
  const n = Number(items?.[key] ?? 0)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

function formatFishWarehouseLines(fishMap) {
  if (!fishMap || typeof fishMap !== "object") return ["(没有鱼获)"]
  const keys = Object.keys(fishMap)
  if (!keys.length) return ["(没有鱼获)"]

  const list = keys
    .map(k => fishMap[k])
    .filter(v => v && typeof v === "object" && Number(v.count) > 0)
    .sort((a, b) => Number(b.count || 0) - Number(a.count || 0))

  if (!list.length) return ["(没有鱼获)"]

  const lines = []
  for (const entry of list) {
    const fish = getFishById(entry.id) || {}
    const count = Math.floor(Number(entry.count || 0))
    const totalWeight = Math.floor(Number(entry.totalWeight || 0))
    const avg = count > 0 ? Math.floor(totalWeight / count) : 0
    const pricePerG = Number(fish.pricePerG || 0)
    const value = Math.max(0, Math.floor(totalWeight * pricePerG))
    lines.push(
      `- ${entry.name || fish.name || entry.id} x${count}，总重 ${totalWeight}g，均重 ${avg}g，估价 ${value}`,
    )
  }
  return lines
}

function toYmdText() {
  return dateKey()
}

function getRarityIconByRank(rank) {
  const r = Number(rank)
  if (Number.isFinite(r)) {
    if (r >= 4) return "fish_legend.png"
    if (r === 3) return "fish_epic.png"
    if (r === 2) return "fish_rare.png"
    if (r === 1) return "fish_common.png"
  }
  return "fish_trash.png"
}

function rarityClassByRank(rank) {
  const r = Number(rank)
  if (!Number.isFinite(r)) return "rarity-0"
  const rr = Math.max(0, Math.min(4, Math.floor(r)))
  return `rarity-${rr}`
}

function getCatchImageById(id) {
  const safe = String(id || "").trim()
  return safe ? `${safe}.png` : "unknown.png"
}

function shopItemIcon(itemKey) {
  if (itemKey === BAIT.NORMAL) return "bait.png"
  if (itemKey === BAIT.ADV) return "bait_adv.png"
  return "shop.png"
}

function makeRenderSpec({ tpl, data, fallbackText }) {
  return {
    kind: "render",
    tpl,
    data: data && typeof data === "object" ? data : {},
    fallbackText: fallbackText ? String(fallbackText) : "",
  }
}

function makeResultSpec({
  title,
  icon = "ok.png",
  iconDir = "icons",
  subtitle = "",
  badge = "",
  lines = [],
  hint = "",
  fallbackText,
} = {}) {
  const list = Array.isArray(lines) ? lines.map(i => String(i)) : [String(lines || "")]
  const fallback =
    fallbackText !== undefined
      ? String(fallbackText)
      : [title || "提示", ...list.filter(Boolean)].filter(Boolean).join("\n")

  return makeRenderSpec({
    tpl: "result",
    data: { title, icon, iconDir, subtitle, badge, lines: list, hint },
    fallbackText: fallback,
  })
}

async function replyRender(ctx, spec) {
  const tpl = spec?.tpl || spec?.template || spec?.view
  const data = spec?.data || {}
  const fallbackText = spec?.fallbackText || spec?.fallback || ""

  try {
    if (tpl && typeof ctx?.renderImg === "function") {
      const img = await ctx.renderImg("diaoyu", data, { tpl })
      if (img) return await ctx.reply(img)
    }
  } catch (err) {
    console.error("[diaoyu] render error:", err?.stack || err?.message || String(err))
  }

  return await ctx.reply(fallbackText ? String(fallbackText) : "（渲染失败）")
}

async function withUser(ctx, fn) {
  const uid = normalizeUserId(ctx?.user_id ?? ctx?.sender_id)
  if (!uid) {
    return await replyRender(
      ctx,
      makeResultSpec({
        title: "钓鱼插件错误",
        icon: "error.png",
        badge: "error",
        lines: ["缺少 user_id，无法使用钓鱼功能"],
        fallbackText: "缺少 user_id，无法使用钓鱼功能",
      }),
    )
  }

  const db = loadDb()
  const user = getOrCreateUser(db, uid)
  if (!user) {
    return await replyRender(
      ctx,
      makeResultSpec({
        title: "钓鱼插件错误",
        icon: "error.png",
        badge: "error",
        lines: ["用户初始化失败"],
        fallbackText: "用户初始化失败",
      }),
    )
  }

  let replySpec
  try {
    // 重要：fn 内禁止 await ctx.reply()，避免读写 DB 期间发生并发覆盖
    replySpec = fn({ db, user, uid })
  } catch (err) {
    console.error("[diaoyu] handler error:", err)
    replySpec = makeResultSpec({
      title: "钓鱼插件内部错误",
      icon: "error.png",
      badge: "error",
      lines: ["请稍后再试"],
      fallbackText: "钓鱼插件内部错误，请稍后再试",
    })
  }

  touchUser(user)
  saveDb(db)

  if (replySpec === undefined || replySpec === null || replySpec === false) return false

  if (typeof replySpec === "string" || typeof replySpec === "number") {
    return await ctx.reply(String(replySpec))
  }

  if (replySpec && typeof replySpec === "object") {
    if (replySpec.kind === "text" && replySpec.message !== undefined) {
      return await ctx.reply(String(replySpec.message))
    }
    if (replySpec.kind === "render" || typeof replySpec.tpl === "string") {
      return await replyRender(ctx, replySpec)
    }
  }

  return await ctx.reply(String(replySpec))
}

export function register(bot) {
  if (!bot || typeof bot.registerCommand !== "function") return

  bot.registerCommand(["^钓鱼帮助$", { key: "help" }], async ctx => {
    const lines = [
      "- 钓鱼 / 钓鱼 高级",
      "- 钓鱼状态",
      "- 钓鱼签到",
      "- 钓鱼商店 / 钓鱼买 <物品> <数量>",
      "- 钓鱼仓库 / 钓鱼背包",
      "- 钓鱼卖 <鱼名|全部> <数量>",
      "- 钓鱼升级",
    ]

    return await replyRender(
      ctx,
      makeResultSpec({
        title: "钓鱼帮助",
        icon: "ok.png",
        badge: "指令",
        lines,
        hint: "示例：钓鱼 / 钓鱼 高级 / 钓鱼状态",
        fallbackText: ["钓鱼插件指令：", ...lines].join("\n"),
      }),
    )
  })

  bot.registerCommand(["^钓鱼测试$", { key: "test" }], async ctx => {
    const scene = ctx?.message_scene || ctx?.message_type || (ctx?.group_id ? "group" : "private")
    const groupId = ctx?.group_id ? String(ctx.group_id) : "-"
    const userId = ctx?.user_id ? String(ctx.user_id) : "-"
    const proto = ctx?.protocol ? String(ctx.protocol) : "-"
    const lines = [`protocol=${proto}`, `scene=${scene}`, `user_id=${userId}`, `group_id=${groupId}`]
    return await replyRender(
      ctx,
      makeResultSpec({
        title: "钓鱼测试通过",
        icon: "ok.png",
        badge: "debug",
        lines,
        fallbackText: ["钓鱼插件测试通过", ...lines].join("\n"),
      }),
    )
  })

  bot.registerCommand(["^钓鱼状态$", { key: "status" }], async ctx => {
    return await withUser(ctx, ({ user }) => {
      const today = dateKey()
      const signed = user.sign?.lastDate === today
      const bait = getItemCount(user.items, BAIT.NORMAL)
      const baitAdv = getItemCount(user.items, BAIT.ADV)
      const fishCount = sumFishCount(user.fish)

      const lines = [
        "钓鱼状态",
        `金币：${Math.floor(user.coins)}`,
        `鱼竿：Lv.${Math.floor(user.rodLevel)}`,
        `鱼饵：${bait}（高级：${baitAdv}）`,
        `鱼获：${fishCount} 条`,
        `今日签到：${signed ? "已签到" : "未签到"}（连签 ${user.sign?.streak ?? 0} 天）`,
      ]

      return makeRenderSpec({
        tpl: "status",
        data: {
          date: toYmdText(),
          signed: Boolean(signed),
          streak: Number(user.sign?.streak ?? 0),
          coins: Math.floor(user.coins),
          rodLevel: Math.floor(user.rodLevel),
          bait,
          baitAdv,
          fishCount,
        },
        fallbackText: lines.join("\n"),
      })
    })
  })

  bot.registerCommand(["^钓鱼(商店|店|小卖部)$", { key: "shop" }], async ctx => {
    return await withUser(ctx, ({ user }) => {
      const lv = Math.floor(user.rodLevel)
      const cost = rodUpgradeCost(lv)
      const canUpgrade = lv < MAX_ROD_LEVEL

      const lines = ["钓鱼商店", "（购买：钓鱼买 <物品> <数量>）", ""]
      for (const item of SHOP_ITEMS) {
        lines.push(`- ${item.name}（${item.key}） ${item.price} 金币/${item.unit}：${item.desc}`)
      }

      lines.push("")
      if (canUpgrade) {
        lines.push(`鱼竿升级：钓鱼升级（消耗 ${cost} 金币，Lv.${lv} -> Lv.${lv + 1}）`)
      } else {
        lines.push(`鱼竿升级：已满级（Lv.${MAX_ROD_LEVEL}）`)
      }
      lines.push("", `当前金币：${Math.floor(user.coins)}`)

      return makeRenderSpec({
        tpl: "shop",
        data: {
          coins: Math.floor(user.coins),
          rodLevel: lv,
          maxRodLevel: MAX_ROD_LEVEL,
          canUpgrade,
          upgradeCost: cost,
          items: SHOP_ITEMS.map(item => ({
            ...item,
            icon: shopItemIcon(item.key),
          })),
        },
        fallbackText: lines.join("\n"),
      })
    })
  })

  bot.registerCommand(["^钓鱼(购买|买)(\\s*.+)?$", { key: "buy" }], async ctx => {
    return await withUser(ctx, ({ user }) => {
      const raw = String(ctx?.msg || "")
      const rest = raw.replace(/^钓鱼(购买|买)/, "").trim()
      if (!rest) {
        return makeResultSpec({
          title: "钓鱼购买",
          icon: "error.png",
          badge: "用法",
          lines: ["用法：钓鱼买 <物品> <数量>", "示例：钓鱼买 普通鱼饵 5"],
          fallbackText: "用法：钓鱼买 <物品> <数量>",
        })
      }

      const parts = rest.split(/\s+/).filter(Boolean)
      const name = parts[0]
      const qtyRaw = parts[1]

      const item = findShopItem(name)
      if (!item) {
        return makeResultSpec({
          title: "购买失败",
          icon: "error.png",
          badge: "购买",
          lines: [`商店里没有这个：${name}`, "提示：发送“钓鱼商店”查看可购买物品"],
          fallbackText: `商店里没有这个：${name}`,
        })
      }

      let qty = qtyRaw ? Number(qtyRaw) : 1
      if (!Number.isFinite(qty) || qty <= 0) qty = 1
      qty = Math.min(999, Math.floor(qty))

      const cost = item.price * qty
      const coins = Math.floor(user.coins)
      if (coins < cost) {
        return makeResultSpec({
          title: "购买失败",
          icon: "error.png",
          badge: "金币不足",
          lines: [`需要金币：${cost}`, `当前金币：${coins}`],
          fallbackText: `金币不足：需要 ${cost}，你只有 ${coins}`,
        })
      }

      user.coins = coins - cost
      user.items[item.key] = getItemCount(user.items, item.key) + qty

      return makeResultSpec({
        title: "购买成功",
        icon: shopItemIcon(item.key),
        badge: "购买",
        lines: [`${item.name} x${qty}`, `花费金币：${cost}`, `剩余金币：${Math.floor(user.coins)}`],
        fallbackText: [
          `购买成功：${item.name} x${qty}`,
          `花费金币：${cost}`,
          `剩余金币：${Math.floor(user.coins)}`,
        ].join("\n"),
      })
    })
  })

  bot.registerCommand(["^钓鱼升级(鱼竿)?$", { key: "upgrade" }], async ctx => {
    return await withUser(ctx, ({ user }) => {
      const lv = Math.floor(user.rodLevel)
      if (lv >= MAX_ROD_LEVEL) {
        return makeResultSpec({
          title: "鱼竿升级",
          icon: "rod.png",
          badge: "满级",
          lines: [`鱼竿已满级：Lv.${MAX_ROD_LEVEL}`],
          fallbackText: `鱼竿已满级：Lv.${MAX_ROD_LEVEL}`,
        })
      }

      const cost = rodUpgradeCost(lv)
      const coins = Math.floor(user.coins)
      if (coins < cost) {
        return makeResultSpec({
          title: "鱼竿升级失败",
          icon: "rod.png",
          badge: "金币不足",
          lines: [`升级需要：${cost}`, `当前金币：${coins}`],
          fallbackText: `金币不足：升级需要 ${cost}，你只有 ${coins}`,
        })
      }

      user.coins = coins - cost
      user.rodLevel = lv + 1

      return makeResultSpec({
        title: "鱼竿升级成功",
        icon: "rod.png",
        badge: "升级",
        lines: [`Lv.${lv} → Lv.${lv + 1}`, `消耗金币：${cost}`, `剩余金币：${Math.floor(user.coins)}`],
        fallbackText: [
          `鱼竿升级成功：Lv.${lv} -> Lv.${lv + 1}`,
          `消耗金币：${cost}`,
          `剩余金币：${Math.floor(user.coins)}`,
        ].join("\n"),
      })
    })
  })

  bot.registerCommand(["^钓鱼(签到|签)$", { key: "sign" }], async ctx => {
    return await withUser(ctx, ({ user }) => {
      const today = dateKey()
      const yday = yesterdayKey()

      if (user.sign?.lastDate === today) {
        const lines = [
          "你今天已经签过到了",
          `连签：${user.sign?.streak ?? 0} 天`,
          `金币：${Math.floor(user.coins)}`,
        ]
        return makeResultSpec({
          title: "钓鱼签到",
          icon: "sign.png",
          badge: "已签到",
          lines,
          fallbackText: lines.join("\n"),
        })
      }

      const last = String(user.sign?.lastDate || "")
      const prevStreak = Number(user.sign?.streak ?? 0)
      const nextStreak = last === yday ? Math.max(1, Math.floor(prevStreak) + 1) : 1

      const rewards = getSignRewards(nextStreak)
      const coins = rewards.coins
      const bait = rewards.bait
      const adv = rewards.adv

      user.sign.lastDate = today
      user.sign.streak = nextStreak

      user.coins = Math.floor(user.coins) + coins
      user.items[BAIT.NORMAL] = getItemCount(user.items, BAIT.NORMAL) + bait
      if (adv) user.items[BAIT.ADV] = getItemCount(user.items, BAIT.ADV) + adv

      const lines = [
        "钓鱼签到成功",
        `+${coins} 金币`,
        `+${bait} 普通鱼饵${adv ? `，+${adv} 高级鱼饵` : ""}`,
        `连签：${nextStreak} 天`,
        `当前金币：${Math.floor(user.coins)}`,
      ]
      return makeResultSpec({
        title: "钓鱼签到成功",
        icon: "sign.png",
        badge: "签到",
        lines: lines.slice(1),
        fallbackText: lines.join("\n"),
      })
    })
  })

  bot.registerCommand(["^钓鱼(仓库|背包)$", { key: "warehouse" }], async ctx => {
    return await withUser(ctx, ({ user }) => {
      const bait = getItemCount(user.items, BAIT.NORMAL)
      const baitAdv = getItemCount(user.items, BAIT.ADV)
      const fishMap = user.fish || {}

      const fishList = Object.keys(fishMap)
        .map(k => fishMap[k])
        .filter(v => v && typeof v === "object" && Number(v.count) > 0)
        .sort((a, b) => Number(b.count || 0) - Number(a.count || 0))
        .map(entry => {
          const fish = getFishById(entry.id) || {}
          const count = Math.floor(Number(entry.count || 0))
          const totalWeight = Math.floor(Number(entry.totalWeight || 0))
          const avgWeight = count > 0 ? Math.floor(totalWeight / count) : 0
          const pricePerG = Number(fish.pricePerG || 0)
          const value = Math.max(0, Math.floor(totalWeight * pricePerG))
          const rarityRank = Number(fish.rarity?.rank ?? 0)
          const rarityName = String(fish.rarity?.name || "未知")
          return {
            id: entry.id,
            name: entry.name || fish.name || entry.id,
            img: getCatchImageById(entry.id),
            rarityName,
            rarityRank,
            rarityClass: rarityClassByRank(rarityRank),
            count,
            totalWeight,
            avgWeight,
            value,
          }
        })

      const lines = [
        "钓鱼仓库",
        `金币：${Math.floor(user.coins)}`,
        `鱼竿：Lv.${Math.floor(user.rodLevel)}`,
        `道具：普通鱼饵 ${bait} / 高级鱼饵 ${baitAdv}`,
        "",
        "鱼获：",
        ...formatFishWarehouseLines(user.fish),
      ]

      return makeRenderSpec({
        tpl: "bag",
        data: {
          coins: Math.floor(user.coins),
          rodLevel: Math.floor(user.rodLevel),
          bait,
          baitAdv,
          fishCount: sumFishCount(user.fish),
          fishList,
        },
        fallbackText: lines.join("\n"),
      })
    })
  })

  bot.registerCommand(["^钓鱼(出售|卖)(\\s*.+)?$", { key: "sell" }], async ctx => {
    return await withUser(ctx, ({ user }) => {
      const raw = String(ctx?.msg || "")
      const rest = raw.replace(/^钓鱼(出售|卖)/, "").trim()
      if (!rest) {
        return makeResultSpec({
          title: "钓鱼出售",
          icon: "bag.png",
          badge: "用法",
          lines: ["用法：钓鱼卖 <鱼名|全部> <数量>", "示例：钓鱼卖 鲫鱼 2", "示例：钓鱼卖 全部"],
          fallbackText: "用法：钓鱼卖 <鱼名|全部> <数量>",
        })
      }

      const parts = rest.split(/\s+/).filter(Boolean)
      const target = parts[0]
      const qtyRaw = parts[1]

      if (target === "全部" || target === "所有" || target === "all") {
        const fishMap = user.fish || {}
        const keys = Object.keys(fishMap)
        if (!keys.length) {
          return makeResultSpec({
            title: "出售失败",
            icon: "bag.png",
            badge: "出售",
            lines: ["你仓库里没有鱼获"],
            fallbackText: "你仓库里没有鱼获",
          })
        }

        let gain = 0
        let sold = 0
        for (const k of keys) {
          const entry = fishMap[k]
          const count = Math.floor(Number(entry?.count || 0))
          const totalWeight = Math.floor(Number(entry?.totalWeight || 0))
          if (count <= 0 || totalWeight <= 0) continue

          const fish = getFishById(entry.id) || {}
          const pricePerG = Number(fish.pricePerG || 0)
          gain += Math.max(0, Math.floor(totalWeight * pricePerG))
          sold += count
        }

        user.fish = {}
        user.coins = Math.floor(user.coins) + gain

        const lines = [`已出售全部鱼获：${sold} 条`, `获得金币：${gain}`, `当前金币：${Math.floor(user.coins)}`]
        return makeResultSpec({
          title: "出售成功",
          icon: "coin.png",
          badge: "出售",
          lines,
          fallbackText: lines.join("\n"),
        })
      }

      const fish = findFishByName(target)
      if (!fish) {
        return makeResultSpec({
          title: "出售失败",
          icon: "error.png",
          badge: "出售",
          lines: [`未识别的鱼名：${target}`, "提示：发送“钓鱼仓库”查看你拥有的鱼获"],
          fallbackText: `未识别的鱼名：${target}`,
        })
      }

      const entry = user.fish?.[fish.id]
      const has = Math.floor(Number(entry?.count || 0))
      if (!entry || has <= 0) {
        return makeResultSpec({
          title: "出售失败",
          icon: getCatchImageById(fish.id),
          iconDir: "catch",
          badge: "出售",
          lines: [`你没有「${fish.name}」`],
          fallbackText: `你没有「${fish.name}」`,
        })
      }

      let qty = qtyRaw ? Number(qtyRaw) : 1
      if (!Number.isFinite(qty) || qty <= 0) qty = 1
      qty = Math.floor(qty)
      if (qty > has) qty = has

      const totalWeight = Math.floor(Number(entry.totalWeight || 0))
      const avg = has > 0 ? totalWeight / has : 0
      const sellWeight = Math.max(0, Math.floor(avg * qty))
      const gain = Math.max(0, Math.floor(sellWeight * Number(fish.pricePerG || 0)))

      entry.count = has - qty
      entry.totalWeight = Math.max(0, Math.floor(totalWeight - avg * qty))
      if (entry.count <= 0) delete user.fish[fish.id]

      user.coins = Math.floor(user.coins) + gain

      const lines = [`已出售：${fish.name} x${qty}`, `获得金币：${gain}`, `当前金币：${Math.floor(user.coins)}`]
      return makeResultSpec({
        title: "出售成功",
        icon: getCatchImageById(fish.id),
        iconDir: "catch",
        badge: "出售",
        lines,
        fallbackText: lines.join("\n"),
      })
    })
  })

  bot.registerCommand(["^钓鱼(\\s+.+)?$", { key: "fish" }], async ctx => {
    return await withUser(ctx, ({ user }) => {
      const arg = String(ctx?.msg || "")
        .replace(/^钓鱼/, "")
        .trim()

      const wantAdv = /高级|高饵|高级饵/.test(arg)
      const baitCount = getItemCount(user.items, BAIT.NORMAL)
      const advCount = getItemCount(user.items, BAIT.ADV)

      let baitKey = BAIT.NORMAL
      if (wantAdv) {
        if (advCount <= 0) {
          return makeResultSpec({
            title: "钓鱼失败",
            icon: "bait_adv.png",
            badge: "鱼饵不足",
            lines: ["你没有高级鱼饵", "先去商店购买或签到领取"],
            fallbackText: "你没有高级鱼饵，先去商店购买或签到领取",
          })
        }
        baitKey = BAIT.ADV
      } else {
        if (baitCount > 0) baitKey = BAIT.NORMAL
        else if (advCount > 0) baitKey = BAIT.ADV
      }

      if (baitCount <= 0 && advCount <= 0) {
        return makeResultSpec({
          title: "钓鱼失败",
          icon: "bait.png",
          badge: "鱼饵不足",
          lines: ["你没有鱼饵了", "先去「钓鱼签到」或「钓鱼商店」补充"],
          fallbackText: "你没有鱼饵了，先去「钓鱼签到」或「钓鱼商店」补充",
        })
      }

      // 消耗鱼饵
      user.items[baitKey] = getItemCount(user.items, baitKey) - 1

      const { fish, weightG, value } = rollCatch({ rodLevel: user.rodLevel, baitKey })

      // 入库：按鱼种聚合（count + totalWeight）
      if (!user.fish[fish.id]) {
        user.fish[fish.id] = { id: fish.id, name: fish.name, count: 0, totalWeight: 0 }
      }
      user.fish[fish.id].count += 1
      user.fish[fish.id].totalWeight += weightG

      const left = getItemCount(user.items, baitKey)
      const baitName = BAIT_META[baitKey]?.name || "鱼饵"

      const lines = [
        `你抛出了鱼竿…（Lv.${Math.floor(user.rodLevel)}，${baitName} -1，剩余 ${left}）`,
        `你钓到了：${fish.name}（${fish.rarity?.name || "未知"}） ${weightG}g`,
        `估价：${value} 金币（可用「钓鱼卖」卖出）`,
      ]

      const rarityRank = Number(fish.rarity?.rank ?? 0)
      const rarityName = String(fish.rarity?.name || "未知")

      return makeRenderSpec({
        tpl: "catch",
        data: {
          rodLevel: Math.floor(user.rodLevel),
          baitName,
          baitLeft: left,
          fishName: fish.name,
          fishImg: getCatchImageById(fish.id),
          rarityName,
          rarityRank,
          rarityClass: rarityClassByRank(rarityRank),
          weightG,
          value,
        },
        fallbackText: lines.join("\n"),
      })
    })
  })
}

export function onBotEvent(event) {
  console.log("[diaoyu] received bot event:", event)
}
