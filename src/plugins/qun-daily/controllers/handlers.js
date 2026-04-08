import {
  buildRangeGroupStats,
  decorateParticipantsWithMembers,
  getOrBuildDailyGroupStats,
  getStatsKings,
} from "../model/stats.js"
import { getDefaultRangeDays, getQunDailyConfig } from "../model/config.js"
import { getPreviousDateKey, toDateKey } from "../model/store.js"
import { buildWordCloudList } from "../model/words.js"

const MANUAL_RANGE_REGEXP = /(?:今日|今天|1天|3天|7天|30天)$/

function getQqAvatarUrl(userId, size = 100) {
  const uid = String(userId || "").trim()
  if (!/^\d{4,}$/.test(uid)) return ""
  const s = Math.max(40, Math.floor(Number(size) || 100))
  return `https://q1.qlogo.cn/g?b=qq&nk=${uid}&s=${s}`
}

function toScopeLabel(days) {
  if (days <= 1) return "今日"
  return `${days}天`
}

function formatDateTime(value) {
  const date = new Date(Number(value || 0) * 1000)
  if (!Number.isFinite(date.getTime())) return "暂无数据"
  const pad = num => String(num).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

function parseDaysFromText(text, fallbackDays = 1) {
  const raw = String(text || "").trim()
  if (!raw) return Math.max(1, Math.floor(Number(fallbackDays) || 1))
  if (/(3天)$/.test(raw)) return 3
  if (/(7天)$/.test(raw)) return 7
  if (/(30天)$/.test(raw)) return 30
  return Math.max(1, Math.floor(Number(fallbackDays) || 1))
}

function getStatsTitle(days) {
  return days <= 1 ? "今日水群统计" : `${days}天水群统计`
}

function getWordsTitle(days) {
  return days <= 1 ? "今日高频词统计" : `${days}天高频词统计`
}

function getCommandTitle(days) {
  return days <= 1 ? "今日指令统计" : `${days}天指令统计`
}

function makeStatsFallback(rangeStats, kings) {
  const lines = [
    `${getStatsTitle(rangeStats?.range?.days || 1)} (${rangeStats?.range?.startDate} ~ ${rangeStats?.range?.endDate})`,
    `总消息：${rangeStats?.totalMessages || 0}`,
    `活跃人数：${rangeStats?.activeUsers || 0}`,
    `水天帝：${kings?.waterKing?.displayName || "暂无"} (${kings?.waterKing?.messageCount || 0} 条)`,
    `表情帝：${kings?.emojiKing?.displayName || "暂无"} (${kings?.emojiKing?.imageCount || 0} 张)`,
    `潜水帝：${kings?.diveKing?.displayName || "暂无可靠数据"} (${
      kings?.diveKing?.lastSentTime ? formatDateTime(kings.diveKing.lastSentTime) : "暂无数据"
    })`,
    "",
    "活跃榜：",
  ]

  for (const [index, item] of (rangeStats?.topTalkers || []).slice(0, 10).entries()) {
    lines.push(
      `${index + 1}. ${item.displayName || item.userId} - ${item.messageCount} 条 / ${item.imageCount} 张图`,
    )
  }

  return lines.join("\n")
}

function makeWordsFallback(rangeStats) {
  const lines = [
    `${getWordsTitle(rangeStats?.range?.days || 1)} (${rangeStats?.range?.startDate} ~ ${rangeStats?.range?.endDate})`,
    `文本样本：${rangeStats?.textSampleCount || 0}`,
    "高频词：",
  ]

  const list = rangeStats?.topWords || []
  if (!list.length) {
    lines.push("暂无足够文本数据")
    return lines.join("\n")
  }

  for (const [index, item] of list.slice(0, 20).entries()) {
    lines.push(`${index + 1}. ${item.word} - ${item.count}`)
  }

  return lines.join("\n")
}

function makeCommandFallback(renderData, targetUser = null) {
  const lines = [
    `${renderData?.title || "指令统计"} (${renderData?.startDate} ~ ${renderData?.endDate})`,
    `总调用：${renderData?.totalCount || 0}`,
    `使用人数：${renderData?.uniqueUsers || 0}`,
    `涉及指令：${renderData?.uniqueCommands || 0}`,
  ]

  if (targetUser) {
    lines.push(`查看成员：${targetUser.displayName || targetUser.userId}`)
    lines.push("常用指令：")
    for (const [index, item] of (targetUser.topCommands || []).slice(0, 10).entries()) {
      lines.push(`${index + 1}. ${item.reg} - ${item.count} 次`)
    }
    return lines.join("\n")
  }

  lines.push("")
  lines.push("指令榜：")
  for (const [index, item] of (renderData?.topCommands || []).slice(0, 10).entries()) {
    lines.push(`${index + 1}. ${item.reg} - ${item.count} 次`)
  }
  lines.push("")
  lines.push("用户榜：")
  for (const [index, item] of (renderData?.topUsers || []).slice(0, 10).entries()) {
    lines.push(`${index + 1}. ${item.displayName || item.userId} - ${item.totalCount} 次`)
  }
  return lines.join("\n")
}

async function getMemberMap(ctx, groupId) {
  if (!ctx || typeof ctx.getGroupMemberList !== "function") return new Map()
  try {
    return (await ctx.getGroupMemberList(groupId)) || new Map()
  } catch {
    try {
      return (await ctx.getGroupMemberList({ group_id: groupId })) || new Map()
    } catch {
      return new Map()
    }
  }
}

async function replyRender(ctx, tpl, data, fallbackText) {
  try {
    if (typeof ctx?.renderImg === "function") {
      const img = await ctx.renderImg("qun-daily", data, { tpl })
      if (img) return await ctx.reply(img)
    }
  } catch (err) {
    console.error("[qun-daily] render reply failed:", err?.stack || err?.message || err)
  }

  return await ctx.reply(fallbackText)
}

async function sendRender(bot, groupId, tpl, data, fallbackText) {
  try {
    if (typeof bot?.renderImg === "function") {
      const img = await bot.renderImg("qun-daily", data, { tpl })
      if (img) return await bot.sendMessage({ group_id: groupId }, img)
    }
  } catch (err) {
    console.error("[qun-daily] render send failed:", err?.stack || err?.message || err)
  }

  return await bot.sendMessage({ group_id: groupId }, fallbackText)
}

function buildStatsRenderData(rangeStats, kings) {
  const talkers = (rangeStats?.topTalkers || []).slice(0, 10).map((item, index) => ({
    rank: index + 1,
    displayName: item.displayName || item.userId,
    messageCount: item.messageCount || 0,
    imageCount: item.imageCount || 0,
    userId: item.userId,
    avatar: getQqAvatarUrl(item.userId, 100),
  }))

  return {
    title: getStatsTitle(rangeStats?.range?.days || 1),
    scopeLabel: toScopeLabel(rangeStats?.range?.days || 1),
    startDate: rangeStats?.range?.startDate,
    endDate: rangeStats?.range?.endDate,
    totalMessages: rangeStats?.totalMessages || 0,
    activeUsers: rangeStats?.activeUsers || 0,
    rangeDays: rangeStats?.range?.days || 1,
    kings: {
      waterKing: {
        name: kings?.waterKing?.displayName || "暂无",
        value: kings?.waterKing?.messageCount || 0,
        subtitle: "消息最多",
        avatar: getQqAvatarUrl(kings?.waterKing?.userId, 100),
      },
      emojiKing: {
        name: kings?.emojiKing?.displayName || "暂无",
        value: kings?.emojiKing?.imageCount || 0,
        subtitle: "图片最多",
        avatar: getQqAvatarUrl(kings?.emojiKing?.userId, 100),
      },
      diveKing: {
        name: kings?.diveKing?.displayName || "暂无可靠数据",
        value: kings?.diveKing?.lastSentTime ? formatDateTime(kings.diveKing.lastSentTime) : "暂无数据",
        subtitle: "最后发言最早",
        avatar: getQqAvatarUrl(kings?.diveKing?.userId, 100),
      },
    },
    talkers,
  }
}

function buildWordsRenderData(rangeStats) {
  const words = (rangeStats?.topWords || []).slice(0, 20).map((item, index) => ({
    rank: index + 1,
    word: item.word,
    count: item.count,
  }))

  return {
    title: getWordsTitle(rangeStats?.range?.days || 1),
    scopeLabel: toScopeLabel(rangeStats?.range?.days || 1),
    startDate: rangeStats?.range?.startDate,
    endDate: rangeStats?.range?.endDate,
    textSampleCount: rangeStats?.textSampleCount || 0,
    totalMessages: rangeStats?.totalMessages || 0,
    words,
    wordCloudJson: JSON.stringify(buildWordCloudList(rangeStats?.topWords || [])),
  }
}

function buildCommandRenderData(rangeStats, memberMap, targetUserId = "") {
  const usage = rangeStats?.commandUsage || {}
  const normalizeUser = item => {
    const userId = String(item?.userId || "")
    const member = memberMap?.get?.(userId)
    const displayName = String(member?.card || member?.nickname || item?.displayName || userId)
    const topCommands = Object.entries(item?.regs || {})
      .map(([reg, count]) => ({ reg, count: Number(count || 0) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    return {
      ...item,
      userId,
      displayName,
      topCommands,
    }
  }

  const targetUser =
    targetUserId && usage?.users?.[targetUserId] ? normalizeUser(usage.users[targetUserId]) : null

  const topUsers = (usage?.topUsers || []).slice(0, 10).map((item, index) => ({
    rank: index + 1,
    ...normalizeUser(item),
  }))
  const topCommands = (usage?.topCommands || []).slice(0, 12).map((item, index) => ({
    rank: index + 1,
    reg: item.reg,
    count: Number(item.count || 0),
    uniqueUsers: Object.keys(item.users || {}).length,
    topRawCommand: Object.entries(item.rawCommands || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || "",
  }))

  return {
    title: getCommandTitle(rangeStats?.range?.days || 1),
    scopeLabel: toScopeLabel(rangeStats?.range?.days || 1),
    startDate: rangeStats?.range?.startDate,
    endDate: rangeStats?.range?.endDate,
    totalCount: Number(usage?.totalCount || 0),
    uniqueUsers: Number(usage?.uniqueUsers || 0),
    uniqueCommands: Number(usage?.uniqueCommands || 0),
    topUsers,
    topCommands,
    targetUser,
  }
}

async function handleStatsCommand(ctx, days) {
  if (!ctx?.group_id) return await ctx.reply("水群统计仅支持群聊中使用")

  const groupId = ctx.group_id
  const rangeStats = await buildRangeGroupStats(groupId, toDateKey(), days, { forceToday: true })
  const memberMap = await getMemberMap(ctx, groupId)
  rangeStats.topTalkers = decorateParticipantsWithMembers(rangeStats.topTalkers, memberMap)
  rangeStats.topImages = decorateParticipantsWithMembers(rangeStats.topImages, memberMap)
  const kings = getStatsKings(rangeStats, memberMap)

  return await replyRender(
    ctx,
    "stats",
    buildStatsRenderData(rangeStats, kings),
    makeStatsFallback(rangeStats, kings),
  )
}

async function handleWordsCommand(ctx, days) {
  if (!ctx?.group_id) return await ctx.reply("词频统计仅支持群聊中使用")

  const groupId = ctx.group_id
  const rangeStats = await buildRangeGroupStats(groupId, toDateKey(), days, { forceToday: true })
  return await replyRender(
    ctx,
    "words",
    buildWordsRenderData(rangeStats),
    makeWordsFallback(rangeStats),
  )
}

async function handleCommandCommand(ctx, days) {
  if (!ctx?.group_id) return await ctx.reply("指令统计仅支持群聊中使用")

  const groupId = ctx.group_id
  const targetUserId = String(ctx.at || "").trim()
  const rangeStats = await buildRangeGroupStats(groupId, toDateKey(), days, { forceToday: true })
  const memberMap = await getMemberMap(ctx, groupId)
  const renderData = buildCommandRenderData(rangeStats, memberMap, targetUserId)

  return await replyRender(
    ctx,
    "command",
    renderData,
    makeCommandFallback(renderData, targetUserId ? renderData.targetUser : null),
  )
}

async function runDailyPush(bot, ctxLike) {
  const config = getQunDailyConfig()
  if (!config.push.enabled) return false

  const runtime = ctxLike && typeof ctxLike === "object" ? ctxLike : bot
  let groupMap = new Map()

  try {
    if (typeof runtime?.getGroupList === "function") {
      groupMap = (await runtime.getGroupList()) || new Map()
    } else if (typeof bot?.getGroupList === "function") {
      groupMap = (await bot.getGroupList()) || new Map()
    }
  } catch (err) {
    console.warn("[qun-daily] getGroupList failed:", err?.message || err)
    groupMap = new Map()
  }

  const dateKey = getPreviousDateKey()
  for (const [groupId] of groupMap instanceof Map ? groupMap : new Map()) {
    try {
      await getOrBuildDailyGroupStats(groupId, dateKey)
      const rangeStats = await buildRangeGroupStats(groupId, dateKey, 1)
      const memberMap = await getMemberMap(runtime, groupId)
      rangeStats.topTalkers = decorateParticipantsWithMembers(rangeStats.topTalkers, memberMap)
      rangeStats.topImages = decorateParticipantsWithMembers(rangeStats.topImages, memberMap)
      const kings = getStatsKings(rangeStats, memberMap)

      if (config.push.include_stats) {
        await sendRender(
          bot,
          groupId,
          "stats",
          buildStatsRenderData(rangeStats, kings),
          makeStatsFallback(rangeStats, kings),
        ).catch(err => console.warn("[qun-daily] send stats failed:", err?.message || err))
      }

      if (config.push.include_words) {
        await sendRender(
          bot,
          groupId,
          "words",
          buildWordsRenderData(rangeStats),
          makeWordsFallback(rangeStats),
        ).catch(err => console.warn("[qun-daily] send words failed:", err?.message || err))
      }

      if (config.push.include_commands) {
        const commandRenderData = buildCommandRenderData(rangeStats, memberMap)
        await sendRender(
          bot,
          groupId,
          "command",
          commandRenderData,
          makeCommandFallback(commandRenderData),
        ).catch(err => console.warn("[qun-daily] send command stats failed:", err?.message || err))
      }
    } catch (err) {
      console.error(
        `[qun-daily] daily push failed for group ${groupId}:`,
        err?.stack || err?.message || err,
      )
    }
  }
}

export function register(bot) {
  if (!bot || typeof bot.registerCommand !== "function") return

  bot.registerCommand(
    [
      "^水群统计(?:\\s*(今日|今天|1天|3天|7天|30天))?$",
      { example: ["水群统计", "水群统计 7天"], desc: "查看群消息活跃榜、表情榜与潜水榜" },
    ],
    async ctx => {
      const days = parseDaysFromText(
        String(ctx?.msg || "").match(MANUAL_RANGE_REGEXP)?.[0] || "",
        getDefaultRangeDays("stats"),
      )
      return await handleStatsCommand(ctx, days)
    },
  )

  bot.registerCommand(
    [
      "^词频统计(?:\\s*(今日|今天|1天|3天|7天|30天))?$",
      { example: ["词频统计", "词频统计 30天"], desc: "查看群聊高频词排行" },
    ],
    async ctx => {
      const days = parseDaysFromText(
        String(ctx?.msg || "").match(MANUAL_RANGE_REGEXP)?.[0] || "",
        getDefaultRangeDays("words"),
      )
      return await handleWordsCommand(ctx, days)
    },
  )

  bot.registerCommand(
    [
      "^指令统计(?:\\s*(今日|今天|1天|3天|7天|30天))?$",
      { example: ["指令统计", "指令统计 7天", "指令统计 @某人"], desc: "查看群成员指令使用统计" },
    ],
    async ctx => {
      const days = parseDaysFromText(
        String(ctx?.msg || "").match(MANUAL_RANGE_REGEXP)?.[0] || "",
        getDefaultRangeDays("commands"),
      )
      return await handleCommandCommand(ctx, days)
    },
  )

  if (typeof bot.setTask === "function") {
    const config = getQunDailyConfig()
    bot.setTask(config.push.cron, async ctxLike => {
      await runDailyPush(bot, ctxLike)
    })
  }
}

export function onBotEvent(event) {
  void event
}
