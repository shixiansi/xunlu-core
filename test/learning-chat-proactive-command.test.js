import test from "node:test"
import assert from "node:assert/strict"

import CommandUsageDB from "../src/db/CommandUsageDB.js"
import MessageDB from "../src/db/MessageDB.js"
import { BaseModel } from "../src/db/base/BaseModel.js"
import {
  listEnabledProactiveGroups,
  runProactiveCommandTick,
} from "../src/plugins/learning_chat/controllers/handlers.js"
import { getConfig } from "../src/plugins/learning_chat/model/config.js"

function restoreConfig(target, snapshot) {
  for (const key of Object.keys(target)) delete target[key]
  Object.assign(target, JSON.parse(JSON.stringify(snapshot)))
}

test("runProactiveCommandTick sends a mention and replays the matched plugin command", async () => {
  const groupId = String(Date.now())
  const userId = "420001"
  const nowSec = Math.floor(Date.now() / 1000)
  const cfg = getConfig()
  const snapshot = JSON.parse(JSON.stringify(cfg))

  const originalGetHourlyFavoriteCommands = CommandUsageDB.getHourlyFavoriteCommands
  const originalHasRecentManualUsage = CommandUsageDB.hasRecentManualUsage
  const originalGetGroupTable = MessageDB.getGroupTable
  const originalGetSequelize = BaseModel.getSequelize

  const sentMessages = []
  const invoked = []

  cfg.proactive.enable = true
  cfg.proactive.command_enable = true
  cfg.proactive.allow_default = false
  cfg.proactive.min_messages_today = 0
  cfg.proactive.command_history_days = 7
  cfg.proactive.command_min_count = 1
  cfg.proactive.command_cooldown_sec = 0
  cfg.proactive.command_recent_manual_sec = 0
  cfg.proactive.command_recent_user_hours = 72
  cfg.proactive.command_max_daily_per_user = 5
  cfg.proactive.command_whitelist = ["^help$"]
  cfg.groups = {
    [groupId]: {
      proactive_enabled: true,
    },
  }

  CommandUsageDB.getHourlyFavoriteCommands = async ({ groupId: queriedGroupId }) => {
    if (String(queriedGroupId) !== groupId) return []
    return [
      {
        group_id: groupId,
        user_id: userId,
        reg: "^help$",
        raw_command: "help",
        plugin: "target-plugin",
        protocol: "milky",
        count: 3,
        last_triggered_at: nowSec * 1000,
      },
    ]
  }
  CommandUsageDB.hasRecentManualUsage = async () => false
  MessageDB.getGroupTable = async () => ({
    async findOne() {
      return {
        dataValues: {
          group_id: groupId,
          user_id: Number(userId),
          time: nowSec,
          protocol: "milky",
          message_id: "msg-1",
          sender: {
            nickname: "tester",
            card: "tester",
          },
        },
      }
    },
    async count() {
      return 5
    },
    async findAll() {
      return [
        { dataValues: { time: nowSec } },
        { dataValues: { time: nowSec - 60 } },
      ]
    },
  })
  BaseModel.getSequelize = async () => ({
    async query(sql, options = {}) {
      if (String(sql).includes("name LIKE 'group_%'")) {
        return [[{ name: `group_${groupId}` }]]
      }
      if (String(sql).includes("name = :name")) {
        return [[{ name: options?.replacements?.name || `group_${groupId}` }]]
      }
      return [[]]
    },
  })

  try {
    const ok = await runProactiveCommandTick(
      {
        protocol: "milky",
        async sendMessage(target, message) {
          sentMessages.push({ target, message })
          return true
        },
      },
      {
        async buildSyntheticCommandEvent({ rawCommand }) {
          return {
            group_id: groupId,
            user_id: userId,
            raw_message: rawCommand,
            msg: rawCommand,
            protocol: "milky",
            __synthetic: true,
            __proactiveCommand: true,
            __commandUsageSource: "proactive-command",
          }
        },
        async invokeCommandByReg(reg, ctx, options) {
          invoked.push({ reg, ctx, options })
          return true
        },
      },
    )

    assert.equal(ok, true)
    assert.equal(sentMessages.length, 1)
    assert.equal(sentMessages[0].target.group_id, Number(groupId))
    assert.equal(invoked.length, 1)
    assert.equal(invoked[0].reg, "^help$")
    assert.equal(invoked[0].options.plugin, "target-plugin")
    assert.equal(invoked[0].options.event, "message")
  } finally {
    CommandUsageDB.getHourlyFavoriteCommands = originalGetHourlyFavoriteCommands
    CommandUsageDB.hasRecentManualUsage = originalHasRecentManualUsage
    MessageDB.getGroupTable = originalGetGroupTable
    BaseModel.getSequelize = originalGetSequelize
    restoreConfig(cfg, snapshot)
  }
})

test("runProactiveCommandTick skips groups with proactive_command_enabled disabled", async () => {
  const groupId = String(Date.now() + 1)
  const userId = "420002"
  const nowSec = Math.floor(Date.now() / 1000)
  const cfg = getConfig()
  const snapshot = JSON.parse(JSON.stringify(cfg))

  const originalGetHourlyFavoriteCommands = CommandUsageDB.getHourlyFavoriteCommands
  const originalHasRecentManualUsage = CommandUsageDB.hasRecentManualUsage
  const originalGetGroupTable = MessageDB.getGroupTable
  const originalGetSequelize = BaseModel.getSequelize

  const sentMessages = []
  const invoked = []

  cfg.proactive.enable = true
  cfg.proactive.command_enable = true
  cfg.proactive.allow_default = false
  cfg.proactive.min_messages_today = 0
  cfg.proactive.command_history_days = 7
  cfg.proactive.command_min_count = 1
  cfg.proactive.command_cooldown_sec = 0
  cfg.proactive.command_recent_manual_sec = 0
  cfg.proactive.command_recent_user_hours = 72
  cfg.proactive.command_max_daily_per_user = 5
  cfg.proactive.command_whitelist = ["^help$"]
  cfg.groups = {
    [groupId]: {
      proactive_enabled: true,
      proactive_command_enabled: false,
    },
  }

  CommandUsageDB.getHourlyFavoriteCommands = async () => [
    {
      group_id: groupId,
      user_id: userId,
      reg: "^help$",
      raw_command: "help",
      plugin: "target-plugin",
      protocol: "milky",
      count: 3,
      last_triggered_at: nowSec * 1000,
    },
  ]
  CommandUsageDB.hasRecentManualUsage = async () => false
  MessageDB.getGroupTable = async () => ({
    async findOne() {
      return {
        dataValues: {
          group_id: groupId,
          user_id: Number(userId),
          time: nowSec,
          protocol: "milky",
          message_id: "msg-2",
          sender: {
            nickname: "tester",
            card: "tester",
          },
        },
      }
    },
    async count() {
      return 5
    },
    async findAll() {
      return [
        { dataValues: { time: nowSec } },
        { dataValues: { time: nowSec - 60 } },
      ]
    },
  })
  BaseModel.getSequelize = async () => ({
    async query(sql, options = {}) {
      if (String(sql).includes("name LIKE 'group_%'")) {
        return [[{ name: `group_${groupId}` }]]
      }
      if (String(sql).includes("name = :name")) {
        return [[{ name: options?.replacements?.name || `group_${groupId}` }]]
      }
      return [[]]
    },
  })

  try {
    const ok = await runProactiveCommandTick(
      {
        protocol: "milky",
        async sendMessage(target, message) {
          sentMessages.push({ target, message })
          return true
        },
      },
      {
        async buildSyntheticCommandEvent({ rawCommand }) {
          return {
            group_id: groupId,
            user_id: userId,
            raw_message: rawCommand,
            msg: rawCommand,
            protocol: "milky",
          }
        },
        async invokeCommandByReg(reg, ctx, options) {
          invoked.push({ reg, ctx, options })
          return true
        },
      },
    )

    assert.equal(ok, false)
    assert.equal(sentMessages.length, 0)
    assert.equal(invoked.length, 0)
  } finally {
    CommandUsageDB.getHourlyFavoriteCommands = originalGetHourlyFavoriteCommands
    CommandUsageDB.hasRecentManualUsage = originalHasRecentManualUsage
    MessageDB.getGroupTable = originalGetGroupTable
    BaseModel.getSequelize = originalGetSequelize
    restoreConfig(cfg, snapshot)
  }
})

test("listEnabledProactiveGroups merges config, extra ids and discovered ids", async () => {
  const cfg = getConfig()
  const snapshot = JSON.parse(JSON.stringify(cfg))

  try {
    cfg.proactive.enable = false
    cfg.proactive.command_enable = false
    cfg.proactive.allow_default = false
    cfg.groups = {
      "10001": {
        proactive_enabled: true,
        proactive_command_enabled: true,
      },
      "10002": {
        proactive_enabled: true,
        proactive_command_enabled: false,
      },
      "10003": {
        proactive_enabled: false,
        proactive_command_enabled: true,
      },
    }

    const groups = await listEnabledProactiveGroups({
      extraGroupIds: ["10002", "10004"],
      discoveredIds: ["10004", "10005"],
    })

    assert.deepEqual(
      groups.map(item => item.group_id),
      ["10001", "10002"],
    )
    assert.equal(groups[0].effective.proactive_command_enabled, true)
    assert.equal(groups[1].effective.proactive_command_enabled, false)
    assert.equal(groups[0].global_proactive_enabled, false)
    assert.equal(groups[0].global_proactive_command_enabled, false)
  } finally {
    restoreConfig(cfg, snapshot)
  }
})
