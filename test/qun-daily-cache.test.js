import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import assert from "node:assert/strict"

import CommandUsageDB from "../src/db/CommandUsageDB.js"
import MessageDB from "../src/db/MessageDB.js"
import { getOrBuildDailyGroupStats } from "../src/plugins/qun-daily/model/stats.js"
import { getStatsFilePath, readDailyStats, shiftDateKey, toDateKey, writeDailyStats } from "../src/plugins/qun-daily/model/store.js"
import { COMMAND_USAGE_CACHE_VERSION } from "../src/plugins/qun-daily/model/command-stats.js"

function createMessageRecord(userId, time, text) {
  return {
    user_id: String(userId),
    time,
    sender: { nickname: `user-${userId}`, card: `user-${userId}` },
    message: [{ type: "text", data: { content: text } }],
  }
}

function createUsageRow(userId, reg, rawCommand, triggeredAt, hourBucket = 12) {
  return {
    user_id: String(userId),
    reg,
    raw_command: rawCommand,
    triggered_at: triggeredAt,
    hour_bucket: hourBucket,
  }
}

test("today stats cache is rebuilt instead of reusing stale command data", async () => {
  const groupId = `__test_today_refresh_${Date.now()}`
  const today = toDateKey()
  const statsFile = getStatsFilePath(groupId, today)
  const statsDir = path.dirname(statsFile)
  const originalGetGroupMsgByDay = MessageDB.getGroupMsgByDay
  const originalListUsage = CommandUsageDB.listUsage

  let messageRows = [createMessageRecord(1, 100, "hello")]
  let usageRows = [createUsageRow(1, "^帮助$", "帮助", 1000)]

  MessageDB.getGroupMsgByDay = async () => messageRows
  CommandUsageDB.listUsage = async () => usageRows

  try {
    await getOrBuildDailyGroupStats(groupId, today, { forceRebuild: true })

    const stale = readDailyStats(groupId, today)
    stale.totalMessages = 999
    stale.commandUsage.version = 1
    stale.commandUsage.totalCount = 999
    writeDailyStats(groupId, today, stale)

    messageRows = [
      createMessageRecord(1, 100, "hello"),
      createMessageRecord(2, 200, "world"),
    ]
    usageRows = [
      createUsageRow(1, "^帮助$", "帮助", 1000),
      createUsageRow(2, "^指令统计$", "指令统计", 2000),
    ]

    const rebuilt = await getOrBuildDailyGroupStats(groupId, today, { forceToday: true })

    assert.equal(rebuilt.totalMessages, 2)
    assert.equal(rebuilt.commandUsage.totalCount, 2)
    assert.equal(rebuilt.commandUsage.version, COMMAND_USAGE_CACHE_VERSION)
  } finally {
    MessageDB.getGroupMsgByDay = originalGetGroupMsgByDay
    CommandUsageDB.listUsage = originalListUsage
    fs.rmSync(statsDir, { recursive: true, force: true })
  }
})

test("historical cache keeps message totals but refreshes outdated commandUsage block", async () => {
  const groupId = `__test_history_refresh_${Date.now()}`
  const today = toDateKey()
  const dateKey = shiftDateKey(today, -1)
  const statsFile = getStatsFilePath(groupId, dateKey)
  const statsDir = path.dirname(statsFile)
  const originalListUsage = CommandUsageDB.listUsage

  CommandUsageDB.listUsage = async () => [createUsageRow(9, "^帮助$", "帮助", 3000)]

  writeDailyStats(groupId, dateKey, {
    version: 1,
    groupId,
    date: dateKey,
    generatedAt: new Date().toISOString(),
    range: {
      startDate: dateKey,
      endDate: dateKey,
    },
    totalMessages: 77,
    activeUsers: 3,
    textSampleCount: 10,
    participants: {},
    wordCounts: {},
    topWords: [],
    commandUsage: {
      version: 1,
      totalCount: 999,
      uniqueUsers: 1,
      uniqueCommands: 1,
      users: {},
      commands: {},
      topUsers: [],
      topCommands: [],
      latestRecords: [],
    },
  })

  try {
    const refreshed = await getOrBuildDailyGroupStats(groupId, dateKey)

    assert.equal(refreshed.totalMessages, 77)
    assert.equal(refreshed.commandUsage.totalCount, 1)
    assert.equal(refreshed.commandUsage.version, COMMAND_USAGE_CACHE_VERSION)
  } finally {
    CommandUsageDB.listUsage = originalListUsage
    fs.rmSync(statsDir, { recursive: true, force: true })
  }
})
