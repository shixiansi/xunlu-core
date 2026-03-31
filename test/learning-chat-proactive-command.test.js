import test from "node:test"
import assert from "node:assert/strict"

import CommandUsageDB from "../src/db/CommandUsageDB.js"
import MessageDB from "../src/db/MessageDB.js"
import { BaseModel } from "../src/db/base/BaseModel.js"
import { runProactiveCommandTick } from "../src/plugins/learning_chat/controllers/handlers.js"
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
