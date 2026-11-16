import { getYangmaoConfig } from "../model/config.js"
import {
  getGroupState,
  listEnabledGroups,
  markGroupSent,
  setGroupEnabled,
} from "../model/group-store.js"
import {
  buildDigestNodes,
  buildDigestText,
  buildEmptyMessage,
  buildForwardTitle,
} from "../model/report.js"
import { fetchOffers, selectDailyDigest } from "../model/source.js"

const PUSH_INTERVAL_MS = 600

/** register() 拿到的 botApi，供定时任务和命令共用 */
let pluginBot = null

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, Number(ms) || 0))
}

function dateKeyOf(timestamp = Date.now()) {
  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

function formatDateTime(timestamp) {
  const date = new Date(Number(timestamp) || 0)
  if (!Number.isFinite(date.getTime()) || date.getTime() <= 0) return "暂无"
  const pad = num => String(num).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

/** 把 cron 里最常见的「每天 HH:mm」翻译成人话，其它表达式原样展示 */
export function describeCron(cron) {
  const text = String(cron || "").trim()
  const matched = text.match(/^(\d+)\s+(\d+)\s+(\d+)\s+\*\s+\*\s+\*$/)
  if (!matched) return text || "未配置"
  const minute = String(Number(matched[2])).padStart(2, "0")
  const hour = String(Number(matched[3])).padStart(2, "0")
  return `每天 ${hour}:${minute}`
}

function toGroupId(value) {
  const text = String(value ?? "").trim()
  if (!text) return ""
  return /^\d+$/.test(text) ? Number(text) : text
}

function isForwardPayload(payload) {
  const list = Array.isArray(payload) ? payload : payload ? [payload] : []
  return list.some(item => {
    if (!item || typeof item !== "object") return false
    if (item.type === "node") return true
    return item.type === "forward" && Array.isArray(item?.data?.messages)
  })
}

/**
 * 构造合并转发节点：优先 ctx 上的通用封装，其次 botApi，最后退化为文本。
 * 任一路由失败都继续尝试下一条，避免个别适配器缺 API 时整条推送失败。
 */
async function buildForwardPayload(ctx, bot, nodes, title) {
  const attempts = []

  if (ctx && typeof ctx.makeGroupForwardMsg === "function") {
    attempts.push({ route: "ctx.makeGroupForwardMsg", run: () => ctx.makeGroupForwardMsg(ctx, nodes, title) })
  }
  if (bot && typeof bot.makeGroupForwardMsg === "function") {
    attempts.push({ route: "bot.makeGroupForwardMsg", run: () => bot.makeGroupForwardMsg(ctx, nodes, title) })
  }
  if (bot && typeof bot.makeForwardMsg === "function") {
    attempts.push({ route: "bot.makeForwardMsg", run: () => bot.makeForwardMsg(ctx, nodes, title) })
  }

  for (const attempt of attempts) {
    try {
      const payload = await attempt.run()
      if (isForwardPayload(payload)) return payload
    } catch (err) {
      console.warn(`[yangmao] ${attempt.route} failed:`, err?.message || err)
    }
  }

  return null
}

async function sendToGroup(bot, ctxLike, groupId, content) {
  const target = { group_id: toGroupId(groupId) }
  if (bot && typeof bot.sendMessage === "function") return await bot.sendMessage(target, content)
  if (ctxLike && typeof ctxLike.sendMessage === "function") return await ctxLike.sendMessage(target, content)
  throw new Error("没有可用的群消息发送接口")
}

async function loadDigest(config) {
  const offers = await fetchOffers({
    apiBase: config.source.api_base,
    timeoutMs: config.source.timeout_ms,
  })
  return selectDailyDigest(offers, {
    lookbackDays: config.source.lookback_days,
    maxItems: config.source.max_items,
    endingSoonDays: config.source.ending_soon_days,
  })
}

async function canManageGroup(ctx) {
  if (ctx?.isMaster) return true
  if (ctx?.isOwner || ctx?.isAdmin) return true
  if (typeof ctx?.isGroupAdmin === "function") {
    try {
      if (await ctx.isGroupAdmin()) return true
    } catch {
      return false
    }
  }
  return false
}

async function handleTodayCommand(ctx) {
  const config = getYangmaoConfig()

  let digest = null
  try {
    digest = await loadDigest(config)
  } catch (err) {
    console.warn("[yangmao] fetch digest failed:", err?.message || err)
    return await ctx.reply(
      `羊毛数据获取失败：${err?.message || err}\n数据源：${config.source.api_base}`,
    )
  }

  if (!digest.items.length) return await ctx.reply(buildEmptyMessage(digest))

  const nodes = buildDigestNodes(digest)
  const payload = await buildForwardPayload(ctx, pluginBot, nodes, buildForwardTitle())
  if (payload) return await ctx.reply(payload)
  return await ctx.reply(buildDigestText(nodes))
}

async function handleToggleCommand(ctx, enabled) {
  if (!ctx?.group_id) return await ctx.reply("羊毛日报按群推送，请在群聊里设置")
  if (!(await canManageGroup(ctx))) {
    return await ctx.reply("只有群主/管理员（或机器人主人）可以设置羊毛日报推送")
  }

  setGroupEnabled(ctx.group_id, enabled, { by: ctx.user_id })
  const config = getYangmaoConfig()
  if (!enabled) return await ctx.reply(`已关闭本群羊毛日报推送（群 ${ctx.group_id}）`)

  const scheduleText = config.push.enabled
    ? `每天 ${describeCron(config.push.cron)} 自动推送合并转发`
    : "当前定时推送总开关被关闭，需先在配置里打开 push.enabled"
  return await ctx.reply(`已开启本群羊毛日报推送（群 ${ctx.group_id}），${scheduleText}`)
}

async function handleStatusCommand(ctx) {
  const config = getYangmaoConfig()
  const isGroup = Boolean(ctx?.group_id)
  const state = isGroup ? getGroupState(ctx.group_id) : null
  const enabledCount = listEnabledGroups().length

  const lines = [
    `羊毛日报 · ${isGroup ? `群 ${ctx.group_id}` : "私聊查看"}`,
    isGroup
      ? `本群推送：${state.enabled ? "已开启" : "未开启（默认关闭）"}`
      : "本群推送：私聊不支持（请在群里开启）",
    `定时推送：${config.push.enabled ? describeCron(config.push.cron) : "已关闭"}（cron ${config.push.cron}）`,
    isGroup && state.lastSentAt ? `上次推送：${formatDateTime(state.lastSentAt)}` : "",
    `已开启群数：${enabledCount}`,
    `数据源：${config.source.api_base}`,
    "开关：#羊毛开启 / #羊毛关闭 ｜ 立即查看：#羊毛",
  ].filter(Boolean)

  return await ctx.reply(lines.join("\n"))
}

/**
 * 尽力拿到 bot 当前所在的群集合，用于过滤已退群/被踢的群。
 * 拿不到时返回 null，表示“不做过滤”，避免因为一个可选 API 失败导致整轮推送放弃。
 */
async function resolveReachableGroups(bot, ctxLike) {
  const readers = [bot, ctxLike]
  for (const reader of readers) {
    if (!reader || typeof reader.getGroupList !== "function") continue
    try {
      const groupMap = await reader.getGroupList()
      if (groupMap instanceof Map) return new Set([...groupMap.keys()].map(key => String(key)))
      if (Array.isArray(groupMap)) return new Set(groupMap.map(item => String(item?.group_id ?? item)))
      if (groupMap && typeof groupMap === "object") return new Set(Object.keys(groupMap))
    } catch (err) {
      console.warn("[yangmao] getGroupList failed:", err?.message || err)
    }
  }
  return null
}

/**
 * 每日定时推送：只发给显式开启的群，同一天不重复推送（重启/重载安全）。
 */
export async function runDailyPush(bot, ctxLike = {}, { force = false } = {}) {
  const config = getYangmaoConfig()
  if (!config.push.enabled) return { skipped: "global-disabled", sent: 0 }

  const enabledGroups = listEnabledGroups()
  if (!enabledGroups.length) return { skipped: "no-group-enabled", sent: 0 }

  const reachable = await resolveReachableGroups(bot, ctxLike)
  const todayKey = dateKeyOf()
  const pending = enabledGroups.filter(item => {
    if (!force && item.lastDateKey === todayKey) return false
    if (reachable && !reachable.has(String(item.groupId))) return false
    return true
  })
  if (!pending.length) return { skipped: "already-sent-today", sent: 0 }

  let digest = null
  try {
    digest = await loadDigest(config)
  } catch (err) {
    console.error("[yangmao] daily push fetch failed:", err?.message || err)
    return { error: String(err?.message || err), sent: 0 }
  }

  if (!digest.items.length) return { skipped: "empty-digest", sent: 0 }

  const nodes = buildDigestNodes(digest)
  const title = buildForwardTitle()
  const fallbackText = buildDigestText(nodes)

  let sent = 0
  for (const item of pending) {
    try {
      const forwardCtx = { isGroup: true, group_id: toGroupId(item.groupId) }
      const payload = await buildForwardPayload(forwardCtx, bot || pluginBot, nodes, title)
      await sendToGroup(bot || pluginBot, ctxLike, item.groupId, payload || fallbackText)
      markGroupSent(item.groupId, todayKey)
      sent += 1
    } catch (err) {
      console.error(
        `[yangmao] push failed for group ${item.groupId}:`,
        err?.stack || err?.message || err,
      )
    }
    if (pending.length > 1) await sleep(PUSH_INTERVAL_MS)
  }

  return { sent, total: pending.length }
}

export function register(bot) {
  pluginBot = bot || null
  if (!bot || typeof bot.registerCommand !== "function") return

  bot.registerCommand(
    {
      reg: "^(?:[#＃])?羊毛(?:日报|速递)?$",
      key: "today",
      example: ["#羊毛", "#羊毛日报"],
      desc: "查看最新的免费 AI 额度 / Token 羊毛（合并转发）",
    },
    async ctx => await handleTodayCommand(ctx),
  )

  bot.registerCommand(
    {
      reg: "^(?:[#＃])?羊毛(开启|关闭)$",
      key: "toggle",
      example: ["#羊毛开启", "#羊毛关闭"],
      desc: "开启或关闭本群的每日羊毛推送（默认关闭）",
    },
    async ctx => {
      const enabled = /开启$/.test(String(ctx?.msg || "").trim())
      return await handleToggleCommand(ctx, enabled)
    },
  )

  bot.registerCommand(
    {
      reg: "^(?:[#＃])?羊毛状态$",
      key: "status",
      example: ["#羊毛状态"],
      desc: "查看羊毛日报推送状态",
    },
    async ctx => await handleStatusCommand(ctx),
  )

  if (typeof bot.setTask === "function") {
    const config = getYangmaoConfig()
    if (config.push.enabled) {
      bot.setTask(config.push.cron, async ctxLike => {
        try {
          await runDailyPush(bot, ctxLike)
        } catch (err) {
          console.error("[yangmao] scheduled push failed:", err?.stack || err?.message || err)
        }
      })
    }
  }
}

export function onBotEvent(event) {
  void event
}
