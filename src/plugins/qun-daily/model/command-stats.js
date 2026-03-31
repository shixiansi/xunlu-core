import CommandUsageDB from "../../../db/CommandUsageDB.js"

export const COMMAND_USAGE_CACHE_VERSION = 2

export function createEmptyCommandUsageStats() {
  return {
    version: COMMAND_USAGE_CACHE_VERSION,
    totalCount: 0,
    uniqueUsers: 0,
    uniqueCommands: 0,
    users: {},
    commands: {},
    topUsers: [],
    topCommands: [],
    latestRecords: [],
  }
}

function ensureUser(users, userId, displayName = "") {
  if (!users[userId]) {
    users[userId] = {
      userId: String(userId),
      displayName: String(displayName || userId),
      totalCount: 0,
      firstTriggeredAt: 0,
      lastTriggeredAt: 0,
      regs: {},
      rawCommands: {},
      hours: {},
    }
  }
  return users[userId]
}

function ensureCommand(commands, reg) {
  if (!commands[reg]) {
    commands[reg] = {
      reg: String(reg),
      count: 0,
      users: {},
      rawCommands: {},
      lastTriggeredAt: 0,
    }
  }
  return commands[reg]
}

function pickDisplayName(rawCommand = "", fallback = "") {
  const text = String(rawCommand || "").trim()
  return text || String(fallback || "")
}

function rankTopUsers(users) {
  return Object.values(users || {})
    .map(item => {
      const topReg = Object.entries(item.regs || {}).sort((a, b) => b[1] - a[1])[0]
      const topRaw = Object.entries(item.rawCommands || {}).sort((a, b) => b[1] - a[1])[0]
      return {
        ...item,
        uniqueRegs: Object.keys(item.regs || {}).length,
        topReg: topReg?.[0] || "",
        topRegCount: Number(topReg?.[1] || 0),
        topCommand: topRaw?.[0] || "",
        topCommandCount: Number(topRaw?.[1] || 0),
      }
    })
    .sort((a, b) => {
      if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount
      if (b.lastTriggeredAt !== a.lastTriggeredAt) return b.lastTriggeredAt - a.lastTriggeredAt
      return String(a.userId).localeCompare(String(b.userId), "zh-Hans-CN")
    })
}

function rankTopCommands(commands) {
  return Object.values(commands || {})
    .map(item => {
      const topRaw = Object.entries(item.rawCommands || {}).sort((a, b) => b[1] - a[1])[0]
      return {
        ...item,
        uniqueUsers: Object.keys(item.users || {}).length,
        topRawCommand: topRaw?.[0] || "",
        topRawCount: Number(topRaw?.[1] || 0),
      }
    })
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      if (b.lastTriggeredAt !== a.lastTriggeredAt) return b.lastTriggeredAt - a.lastTriggeredAt
      return String(a.reg).localeCompare(String(b.reg), "zh-Hans-CN")
    })
}

export function summarizeCommandUsageRows(rows = [], memberMapLike = null) {
  const users = {}
  const commands = {}
  let totalCount = 0

  const memberMap = memberMapLike instanceof Map ? memberMapLike : new Map()

  for (const row of Array.isArray(rows) ? rows : []) {
    const userId = String(row?.user_id || "")
    const reg = String(row?.reg || "")
    const rawCommand = String(row?.raw_command || "").trim()
    if (!userId || !reg || !rawCommand) continue

    totalCount += 1
    const member = memberMap.get(userId)
    const displayName = String(member?.card || member?.nickname || row?.display_name || userId)
    const user = ensureUser(users, userId, displayName)
    const command = ensureCommand(commands, reg)
    const triggeredAt = Number(row?.triggered_at || 0)
    const hourBucket = Number(row?.hour_bucket || 0)

    user.displayName = displayName || user.displayName
    user.totalCount += 1
    user.regs[reg] = Number(user.regs[reg] || 0) + 1
    user.rawCommands[rawCommand] = Number(user.rawCommands[rawCommand] || 0) + 1
    user.hours[String(hourBucket)] = Number(user.hours[String(hourBucket)] || 0) + 1
    if (!user.firstTriggeredAt || triggeredAt < user.firstTriggeredAt) user.firstTriggeredAt = triggeredAt
    if (triggeredAt > user.lastTriggeredAt) user.lastTriggeredAt = triggeredAt

    command.count += 1
    command.users[userId] = Number(command.users[userId] || 0) + 1
    command.rawCommands[rawCommand] = Number(command.rawCommands[rawCommand] || 0) + 1
    if (triggeredAt > command.lastTriggeredAt) command.lastTriggeredAt = triggeredAt
  }

  return {
    version: COMMAND_USAGE_CACHE_VERSION,
    totalCount,
    uniqueUsers: Object.keys(users).length,
    uniqueCommands: Object.keys(commands).length,
    users,
    commands,
    topUsers: rankTopUsers(users),
    topCommands: rankTopCommands(commands),
    latestRecords: (Array.isArray(rows) ? [...rows] : [])
      .sort((a, b) => Number(b?.triggered_at || 0) - Number(a?.triggered_at || 0))
      .slice(0, 20)
      .map(item => ({
        userId: String(item?.user_id || ""),
        rawCommand: pickDisplayName(item?.raw_command, item?.reg),
        reg: String(item?.reg || ""),
        triggeredAt: Number(item?.triggered_at || 0),
      })),
  }
}

export async function buildDailyCommandUsageStats(groupId, dateKey, memberMapLike = null) {
  const rows = await CommandUsageDB.listUsage({
    groupId,
    dateKeys: [dateKey],
    sourceExcludes: ["proactive-command"],
    includeSynthetic: false,
    limit: 0,
  })
  return summarizeCommandUsageRows(rows, memberMapLike)
}

export function mergeCommandUsageStats(parts = [], memberMapLike = null) {
  const rows = []
  for (const part of Array.isArray(parts) ? parts : []) {
    if (!part || typeof part !== "object") continue
    if (Array.isArray(part.__rawRows)) {
      rows.push(...part.__rawRows)
      continue
    }
    for (const latest of Array.isArray(part.latestRecords) ? part.latestRecords : []) {
      rows.push({
        user_id: latest.userId,
        raw_command: latest.rawCommand,
        reg: latest.reg,
        triggered_at: latest.triggeredAt,
        hour_bucket: new Date(Number(latest.triggeredAt || 0)).getHours(),
      })
    }
  }
  return summarizeCommandUsageRows(rows, memberMapLike)
}
