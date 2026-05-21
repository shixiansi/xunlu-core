import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

import { createPluginTestHarness } from "../src/dev/plugin-test-harness.js"
import cfg from "../src/lib/config.js"
import qunDailyPlugin from "../src/plugins/qun-daily/index.js"
import { createEmptyCommandUsageStats } from "../src/plugins/qun-daily/model/command-stats.js"
import {
  getGroupPushConfig,
  resetGroupPushStoreCache,
  setGroupPushConfig,
} from "../src/plugins/qun-daily/model/push-store.js"
import { getPreviousDateKey, getStatsFilePath, writeDailyStats } from "../src/plugins/qun-daily/model/store.js"
import { getRuntimePaths } from "../src/runtime/runtime-context.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

function withConfigOverrides(overrides = {}) {
  const rawGetConfig = cfg.getConfig.bind(cfg)
  cfg.getConfig = function patchedGetConfig(name, configType) {
    const value = rawGetConfig(name, configType)
    if (!Object.prototype.hasOwnProperty.call(overrides, name)) return value
    return {
      ...(value || {}),
      ...(overrides[name] || {}),
    }
  }
  return () => {
    cfg.getConfig = rawGetConfig
  }
}

function getPushStorePath() {
  return path.join(getRuntimePaths().getPluginDataDir("qun-daily"), "push-settings.json")
}

function cleanupQunDailyArtifacts(groupId, dateKey = getPreviousDateKey()) {
  resetGroupPushStoreCache()
  try {
    fs.unlinkSync(getPushStorePath())
  } catch {}
  try {
    fs.unlinkSync(getStatsFilePath(groupId, dateKey))
  } catch {}
  try {
    fs.rmdirSync(path.dirname(getStatsFilePath(groupId, dateKey)))
  } catch {}
}

function createDailyStatsFixture(groupId, dateKey) {
  return {
    version: 2,
    groupId: String(groupId),
    date: dateKey,
    generatedAt: new Date().toISOString(),
    range: {
      startDate: dateKey,
      endDate: dateKey,
    },
    totalMessages: 12,
    activeUsers: 1,
    textSampleCount: 4,
    participants: {
      "20001": {
        userId: "20001",
        displayName: "测试成员",
        messageCount: 12,
        imageCount: 2,
        textCount: 4,
        firstMessageTime: 1710000000,
        lastMessageTime: 1710000600,
        firstImageTime: 1710000100,
        lastImageTime: 1710000500,
      },
    },
    wordCounts: {
      测试: 3,
      总结: 2,
    },
    topWords: [
      { word: "测试", count: 3 },
      { word: "总结", count: 2 },
    ],
    commandUsage: {
      ...createEmptyCommandUsageStats(),
      totalCount: 2,
      uniqueUsers: 1,
      uniqueCommands: 1,
      users: {
        "20001": {
          userId: "20001",
          displayName: "测试成员",
          totalCount: 2,
          firstTriggeredAt: 1710000000,
          lastTriggeredAt: 1710000600,
          regs: { "^测试$": 2 },
          rawCommands: { 测试: 2 },
          hours: { "12": 2 },
        },
      },
      commands: {
        "^测试$": {
          reg: "^测试$",
          count: 2,
          users: { "20001": 2 },
          rawCommands: { 测试: 2 },
          lastTriggeredAt: 1710000600,
        },
      },
    },
  }
}

async function withHarness(options, fn) {
  const harness = await createPluginTestHarness({
    plugins: [qunDailyPlugin],
    ...options,
  })
  try {
    return await fn(harness)
  } finally {
    await harness.dispose()
  }
}

test("qun-daily push is disabled by default for groups without push switches", async () => {
  const groupId = 992001
  const dateKey = getPreviousDateKey()
  cleanupQunDailyArtifacts(groupId, dateKey)
  writeDailyStats(groupId, dateKey, createDailyStatsFixture(groupId, dateKey))

  try {
    await withHarness({}, async harness => {
      const res = await harness.runTask({
        index: 0,
        ctxLike: {
          async getGroupList() {
            return new Map([[groupId, { group_id: groupId }]])
          },
        },
      })

      assert.equal(res.ok, true)
      assert.equal(res.replies.length, 0)
    })
  } finally {
    cleanupQunDailyArtifacts(groupId, dateKey)
  }
})

test("qun-daily stats push can be enabled per group via command", async () => {
  const groupId = 992002
  const dateKey = getPreviousDateKey()
  const restore = withConfigOverrides({
    bot: { masterQQ: [20007] },
  })

  cleanupQunDailyArtifacts(groupId, dateKey)
  writeDailyStats(groupId, dateKey, createDailyStatsFixture(groupId, dateKey))

  try {
    await withHarness({}, async harness => {
      const cmdRes = await harness.emitMessage({
        scene: "group",
        text: "#水群统计推送开启",
        group_id: groupId,
        user_id: 20007,
      })

      assert.equal(cmdRes.ok, true)
      assert.match(cmdRes.replies[0]?.text || "", /水群统计推送已开启/)
      assert.deepEqual(getGroupPushConfig(groupId), {
        stats: true,
        words: false,
        commands: false,
      })

      const pushRes = await harness.runTask({
        index: 0,
        ctxLike: {
          async getGroupList() {
            return new Map([[groupId, { group_id: groupId }]])
          },
        },
      })

      assert.equal(pushRes.ok, true, JSON.stringify({ errors: pushRes.errors, warnings: pushRes.warnings }))
      assert.equal(pushRes.replies.length, 1)
    })
  } finally {
    restore()
    cleanupQunDailyArtifacts(groupId, dateKey)
  }
})

test("qun-daily words push command accepts 词频统计 alias", async () => {
  const groupId = 992003
  const restore = withConfigOverrides({
    bot: { masterQQ: [20008] },
  })

  cleanupQunDailyArtifacts(groupId)

  try {
    await withHarness({}, async harness => {
      const res = await harness.emitMessage({
        scene: "group",
        text: "#词频统计推送开启",
        group_id: groupId,
        user_id: 20008,
      })

      assert.equal(res.ok, true)
      assert.match(res.replies[0]?.text || "", /关键词统计推送已开启/)
      assert.deepEqual(getGroupPushConfig(groupId), {
        stats: false,
        words: true,
        commands: false,
      })
    })
  } finally {
    restore()
    cleanupQunDailyArtifacts(groupId)
  }
})

test("global qun-daily include switch still blocks enabled group push", async () => {
  const groupId = 992004
  const dateKey = getPreviousDateKey()
  const restore = withConfigOverrides({
    "qun-daily": {
      push: {
        enabled: true,
        cron: "0 5 0 * * *",
        include_stats: false,
        include_words: true,
        include_commands: true,
      },
    },
  })

  cleanupQunDailyArtifacts(groupId, dateKey)
  writeDailyStats(groupId, dateKey, createDailyStatsFixture(groupId, dateKey))
  setGroupPushConfig(groupId, { stats: true })

  try {
    await withHarness({}, async harness => {
      const res = await harness.runTask({
        index: 0,
        ctxLike: {
          async getGroupList() {
            return new Map([[groupId, { group_id: groupId }]])
          },
        },
      })

      assert.equal(res.ok, true)
      assert.equal(res.replies.length, 0)
    })
  } finally {
    restore()
    cleanupQunDailyArtifacts(groupId, dateKey)
  }
})
