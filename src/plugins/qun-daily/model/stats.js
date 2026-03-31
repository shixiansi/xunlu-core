import MessageDB from "../../../db/MessageDB.js"
import { getMemberDisplayName, normalizeMemberMap, resolveDiveKing } from "./member.js"
import {
  buildDailyCommandUsageStats,
  COMMAND_USAGE_CACHE_VERSION,
  createEmptyCommandUsageStats,
} from "./command-stats.js"
import { buildWordStatsFromMessages, rankWordCounts } from "./words.js"
import { getDateKeysForRange, readDailyStats, toDateKey, writeDailyStats } from "./store.js"

function safeSegments(value) {
  return Array.isArray(value) ? value : []
}

function toTime(value) {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : 0
}

function toUserId(value, fallback = "") {
  const raw = value ?? fallback
  return String(raw || "").trim()
}

function countImageSegments(segments) {
  return safeSegments(segments).filter(seg => seg && seg.type === "image").length
}

function getSenderName(record) {
  const sender = record?.sender || {}
  const userId = toUserId(record?.user_id)
  return (
    String(sender?.card ?? sender?.remark ?? "").trim() ||
    String(sender?.nickname ?? sender?.name ?? "").trim() ||
    userId
  )
}

function createParticipant(userId, displayName = "") {
  return {
    userId: String(userId),
    displayName: String(displayName || userId),
    messageCount: 0,
    imageCount: 0,
    textCount: 0,
    firstMessageTime: 0,
    lastMessageTime: 0,
    firstImageTime: 0,
    lastImageTime: 0,
  }
}

function mergeParticipant(target, source) {
  target.displayName = source.displayName || target.displayName
  target.messageCount += Number(source.messageCount || 0)
  target.imageCount += Number(source.imageCount || 0)
  target.textCount += Number(source.textCount || 0)

  const firstMessageTime = toTime(source.firstMessageTime)
  const lastMessageTime = toTime(source.lastMessageTime)
  const firstImageTime = toTime(source.firstImageTime)
  const lastImageTime = toTime(source.lastImageTime)

  if (firstMessageTime && (!target.firstMessageTime || firstMessageTime < target.firstMessageTime)) {
    target.firstMessageTime = firstMessageTime
  }
  if (lastMessageTime && lastMessageTime > target.lastMessageTime) {
    target.lastMessageTime = lastMessageTime
  }
  if (firstImageTime && (!target.firstImageTime || firstImageTime < target.firstImageTime)) {
    target.firstImageTime = firstImageTime
  }
  if (lastImageTime && lastImageTime > target.lastImageTime) {
    target.lastImageTime = lastImageTime
  }
}

function sortParticipantsByMetric(list, metricKey, firstTimeKey) {
  return [...list].sort((a, b) => {
    const aMetric = Number(a?.[metricKey] || 0)
    const bMetric = Number(b?.[metricKey] || 0)
    if (bMetric !== aMetric) return bMetric - aMetric

    const aFirst = Number(a?.[firstTimeKey] || 0)
    const bFirst = Number(b?.[firstTimeKey] || 0)
    if (aFirst && bFirst && aFirst !== bFirst) return aFirst - bFirst
    if (aFirst && !bFirst) return -1
    if (!aFirst && bFirst) return 1

    return String(a?.userId || "").localeCompare(String(b?.userId || ""), "zh-Hans-CN")
  })
}

function shouldRebuildCommandUsage(cached, { forceCommandUsageRebuild = false } = {}) {
  if (forceCommandUsageRebuild) return true
  if (!cached?.commandUsage || typeof cached.commandUsage !== "object") return true
  return Number(cached.commandUsage.version || 0) !== COMMAND_USAGE_CACHE_VERSION
}

export async function buildDailyGroupStats(groupId, dateKeyInput) {
  const dateKey = toDateKey(dateKeyInput)
  const messages = await MessageDB.getGroupMsgByDay(groupId, dateKey).catch(() => [])
  const participants = Object.create(null)
  let totalMessages = 0

  for (const record of Array.isArray(messages) ? messages : []) {
    const userId = toUserId(record?.user_id)
    if (!userId) continue

    totalMessages += 1
    const displayName = getSenderName(record)
    const participant = participants[userId] || createParticipant(userId, displayName)
    participant.displayName = displayName || participant.displayName
    participant.messageCount += 1

    const time = toTime(record?.time)
    if (time && (!participant.firstMessageTime || time < participant.firstMessageTime)) {
      participant.firstMessageTime = time
    }
    if (time && time > participant.lastMessageTime) {
      participant.lastMessageTime = time
    }

    const imageCount = countImageSegments(record?.message)
    participant.imageCount += imageCount
    if (imageCount > 0) {
      if (time && (!participant.firstImageTime || time < participant.firstImageTime)) {
        participant.firstImageTime = time
      }
      if (time && time > participant.lastImageTime) {
        participant.lastImageTime = time
      }
    }

    const hasText = safeSegments(record?.message).some(
      seg => seg && seg.type === "text" && String(seg?.data?.text ?? seg?.data?.content ?? "").trim(),
    )
    if (hasText) participant.textCount += 1

    participants[userId] = participant
  }

  const wordStats = buildWordStatsFromMessages(messages)
  const commandUsage = await buildDailyCommandUsageStats(groupId, dateKey).catch(() =>
    createEmptyCommandUsageStats(),
  )

  return {
    version: 1,
    groupId: String(groupId),
    date: dateKey,
    generatedAt: new Date().toISOString(),
    range: {
      startDate: dateKey,
      endDate: dateKey,
    },
    totalMessages,
    activeUsers: Object.keys(participants).length,
    textSampleCount: wordStats.textSampleCount,
    participants,
    wordCounts: wordStats.wordCounts,
    topWords: wordStats.topWords,
    commandUsage,
  }
}

export async function getOrBuildDailyGroupStats(groupId, dateKeyInput, options = {}) {
  const dateKey = toDateKey(dateKeyInput)
  const todayDateKey = toDateKey()
  const forceRebuild =
    Boolean(options.forceRebuild) ||
    (Boolean(options.forceToday) && String(dateKey) === String(todayDateKey))

  const cached = forceRebuild ? null : readDailyStats(groupId, dateKey)
  if (cached && !shouldRebuildCommandUsage(cached, options)) return cached
  if (cached) {
    cached.commandUsage = await buildDailyCommandUsageStats(groupId, dateKey).catch(() =>
      createEmptyCommandUsageStats(),
    )
    writeDailyStats(groupId, dateKey, cached)
    return cached
  }
  const built = await buildDailyGroupStats(groupId, dateKey)
  writeDailyStats(groupId, dateKey, built)
  return built
}

export async function buildRangeGroupStats(groupId, endDateKeyInput, days = 1, options = {}) {
  const endDateKey = toDateKey(endDateKeyInput)
  const dateKeys = getDateKeysForRange(endDateKey, days)
  const dailyStatsList = []
  const todayDateKey = toDateKey()

  for (const dateKey of dateKeys) {
    dailyStatsList.push(
      await getOrBuildDailyGroupStats(groupId, dateKey, {
        ...options,
        forceRebuild:
          Boolean(options.forceRebuild) ||
          (Boolean(options.forceToday) && String(dateKey) === String(todayDateKey)),
      }),
    )
  }

  const participants = Object.create(null)
  const wordCounts = Object.create(null)
  const commandUsers = Object.create(null)
  const commandCommands = Object.create(null)
  let totalMessages = 0
  let textSampleCount = 0
  let commandTotalCount = 0

  for (const daily of dailyStatsList) {
    totalMessages += Number(daily?.totalMessages || 0)
    textSampleCount += Number(daily?.textSampleCount || 0)
    commandTotalCount += Number(daily?.commandUsage?.totalCount || 0)

    for (const [userId, info] of Object.entries(daily?.participants || {})) {
      const target = participants[userId] || createParticipant(userId, info?.displayName)
      mergeParticipant(target, info || {})
      participants[userId] = target
    }

    for (const [word, count] of Object.entries(daily?.wordCounts || {})) {
      wordCounts[word] = Number(wordCounts[word] || 0) + Number(count || 0)
    }

    for (const [userId, info] of Object.entries(daily?.commandUsage?.users || {})) {
      if (!commandUsers[userId]) {
        commandUsers[userId] = {
          userId: String(userId),
          displayName: String(info?.displayName || userId),
          totalCount: 0,
          firstTriggeredAt: 0,
          lastTriggeredAt: 0,
          regs: {},
          rawCommands: {},
          hours: {},
        }
      }
      const target = commandUsers[userId]
      target.displayName = info?.displayName || target.displayName
      target.totalCount += Number(info?.totalCount || 0)
      if (!target.firstTriggeredAt || (info?.firstTriggeredAt && info.firstTriggeredAt < target.firstTriggeredAt)) {
        target.firstTriggeredAt = Number(info?.firstTriggeredAt || target.firstTriggeredAt || 0)
      }
      if (Number(info?.lastTriggeredAt || 0) > target.lastTriggeredAt) {
        target.lastTriggeredAt = Number(info?.lastTriggeredAt || 0)
      }
      for (const [reg, count] of Object.entries(info?.regs || {})) {
        target.regs[reg] = Number(target.regs[reg] || 0) + Number(count || 0)
      }
      for (const [rawCommand, count] of Object.entries(info?.rawCommands || {})) {
        target.rawCommands[rawCommand] = Number(target.rawCommands[rawCommand] || 0) + Number(count || 0)
      }
      for (const [hour, count] of Object.entries(info?.hours || {})) {
        target.hours[hour] = Number(target.hours[hour] || 0) + Number(count || 0)
      }
    }

    for (const [reg, info] of Object.entries(daily?.commandUsage?.commands || {})) {
      if (!commandCommands[reg]) {
        commandCommands[reg] = {
          reg: String(reg),
          count: 0,
          users: {},
          rawCommands: {},
          lastTriggeredAt: 0,
        }
      }
      const target = commandCommands[reg]
      target.count += Number(info?.count || 0)
      if (Number(info?.lastTriggeredAt || 0) > target.lastTriggeredAt) {
        target.lastTriggeredAt = Number(info?.lastTriggeredAt || 0)
      }
      for (const [userId, count] of Object.entries(info?.users || {})) {
        target.users[userId] = Number(target.users[userId] || 0) + Number(count || 0)
      }
      for (const [rawCommand, count] of Object.entries(info?.rawCommands || {})) {
        target.rawCommands[rawCommand] = Number(target.rawCommands[rawCommand] || 0) + Number(count || 0)
      }
    }
  }

  const participantList = Object.values(participants)
  const topTalkers = sortParticipantsByMetric(participantList, "messageCount", "firstMessageTime")
  const topImages = sortParticipantsByMetric(participantList, "imageCount", "firstImageTime")
  const topCommandUsers = Object.values(commandUsers).sort((a, b) => {
    if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount
    if (b.lastTriggeredAt !== a.lastTriggeredAt) return b.lastTriggeredAt - a.lastTriggeredAt
    return String(a.userId).localeCompare(String(b.userId), "zh-Hans-CN")
  })
  const topCommandRegs = Object.values(commandCommands).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    if (b.lastTriggeredAt !== a.lastTriggeredAt) return b.lastTriggeredAt - a.lastTriggeredAt
    return String(a.reg).localeCompare(String(b.reg), "zh-Hans-CN")
  })

  return {
    version: 1,
    groupId: String(groupId),
    generatedAt: new Date().toISOString(),
    range: {
      startDate: dateKeys[0],
      endDate: dateKeys[dateKeys.length - 1],
      days: dateKeys.length,
      dateKeys,
    },
    totalMessages,
    activeUsers: participantList.length,
    textSampleCount,
    participants,
    participantList,
    topTalkers,
    topImages,
    wordCounts,
    topWords: rankWordCounts(wordCounts, 20),
    commandUsage: {
      totalCount: commandTotalCount,
      uniqueUsers: Object.keys(commandUsers).length,
      uniqueCommands: Object.keys(commandCommands).length,
      users: commandUsers,
      commands: commandCommands,
      topUsers: topCommandUsers,
      topCommands: topCommandRegs,
    },
    dailyStatsList,
  }
}

export function decorateParticipantsWithMembers(participants = [], memberMapLike) {
  const memberMap = normalizeMemberMap(memberMapLike)
  return (Array.isArray(participants) ? participants : []).map(item => {
    const member = memberMap.get(String(item?.userId || ""))
    if (!member) return item
    return {
      ...item,
      displayName: getMemberDisplayName(member, item?.userId) || item?.displayName || item?.userId,
    }
  })
}

export function getStatsKings(rangeStats, memberMapLike) {
  const topTalkers = decorateParticipantsWithMembers(rangeStats?.topTalkers || [], memberMapLike)
  const topImages = decorateParticipantsWithMembers(rangeStats?.topImages || [], memberMapLike)
  const diveKing = resolveDiveKing(memberMapLike)

  return {
    waterKing: topTalkers[0] || null,
    emojiKing: topImages[0] || null,
    diveKing,
  }
}
