import test from "node:test"
import assert from "node:assert/strict"

import BaseBot from "../src/Bot/index.js"
import CommandUsageDB from "../src/db/CommandUsageDB.js"
import { startYunzaiCommandUsageBridge } from "../src/Bot/yunzai/command-bridge.js"

function createLoggerStub() {
  return {
    info() {},
    warn() {},
    error() {},
    debug() {},
    mark() {},
  }
}

function createRuntimeBotStub() {
  return {
    uin: 99999,
    99999: { fl: new Map() },
    pickGroup(groupId) {
      return {
        group_id: groupId,
        mute_left: 0,
        async sendMsg(msg) {
          return { message_id: `group-${groupId}`, msg }
        },
      }
    },
    pickUser(userId) {
      return {
        user_id: userId,
        async sendMsg(msg) {
          return { message_id: `user-${userId}`, msg }
        },
      }
    },
  }
}

function createLoaderStub(calls, { pluginName = "yunzai-demo", reg = "^help$" } = {}) {
  class DemoPlugin {
    constructor(e) {
      this.e = e
      this.name = pluginName
      this.event = "message"
      this.priority = 200
      this.rule = [{ reg, fnc: "run" }]
    }

    async run(e) {
      calls.push({ type: "run", plugin: this.name, raw: e.raw_message })
      e.yunzaiHandled = true
      return true
    }
  }

  return {
    priority: [{ name: pluginName, class: DemoPlugin, priority: 200 }],
    checkGuildMsg() {
      return false
    },
    checkLimit() {
      return true
    },
    dealMsg(e) {
      e.msg = String(e.msg || e.raw_message || "")
      e.isGroup = Boolean(e.group_id)
      e.isPrivate = !e.isGroup
      e.sender = e.sender || { card: "tester", nickname: "tester" }
      e.group_name = e.group_name || "test-group"
      e.logText = ""
    },
    checkBlack() {
      return true
    },
    reply() {},
    onlyReplyAt() {
      return true
    },
    filtEvent(e, v) {
      const event = String(v?.event || "")
      if (!event) return false
      return event === "message" || event === "message.group.normal"
    },
    checkDisable() {
      return true
    },
    filtPermission() {
      return true
    },
    setLimit() {
      calls.push({ type: "setLimit" })
    },
    srReg: /^$/,
    zzzReg: /^$/,
    async deal(e) {
      e.msg = String(e.msg || e.raw_message || "")
      e.logFnc = `[${pluginName}][run]`
      return true
    },
  }
}

test("invokeCommandByReg falls back to a Yunzai command without changing Yunzai core files", async () => {
  const bot = new BaseBot({ adapter: "test" })
  const calls = []
  const recorded = []
  const originalLogger = globalThis.logger
  const originalBot = globalThis.Bot
  const originalBridge = globalThis.__xunluYunzaiCommandBridge
  const originalRecordUsage = CommandUsageDB.recordUsage

  globalThis.logger = createLoggerStub()
  globalThis.Bot = createRuntimeBotStub()
  globalThis.__xunluYunzaiCommandBridge = {
    PluginsLoader: createLoaderStub(calls, { pluginName: "yunzai-demo", reg: "^help$" }),
    Runtime: {
      async init(e) {
        e.runtime = {}
      },
    },
  }
  CommandUsageDB.recordUsage = async payload => {
    recorded.push(payload)
    return payload
  }

  try {
    const result = await bot.invokeCommandByReg(
      "^help$",
      {
        group_id: "10001",
        user_id: "20002",
        raw_message: "help",
        msg: "help",
        protocol: "milky",
        sender: { nickname: "tester", card: "tester" },
        __synthetic: true,
        __proactiveCommand: true,
        __commandUsageSource: "proactive-command",
      },
      {
        event: "message",
        plugin: "yunzai-demo",
      },
    )

    assert.equal(result, true)
    assert.equal(calls.some(item => item.type === "run"), true)
    assert.equal(recorded.length, 1)
    assert.equal(recorded[0].plugin, "yunzai-demo")
    assert.equal(recorded[0].reg, "^help$")
    assert.equal(recorded[0].source, "proactive-command")
    assert.equal(recorded[0].isSynthetic, true)
  } finally {
    CommandUsageDB.recordUsage = originalRecordUsage
    globalThis.__xunluYunzaiCommandBridge = originalBridge
    globalThis.Bot = originalBot
    globalThis.logger = originalLogger
  }
})

test("invokeCommandByText falls back to the Yunzai text bridge with scheduled audit source", async () => {
  const bot = new BaseBot({ adapter: "test" })
  const calls = []
  const recorded = []
  const originalLogger = globalThis.logger
  const originalBot = globalThis.Bot
  const originalBridge = globalThis.__xunluYunzaiCommandBridge
  const originalRecordUsage = CommandUsageDB.recordUsage

  globalThis.logger = createLoggerStub()
  globalThis.Bot = createRuntimeBotStub()
  globalThis.__xunluYunzaiCommandBridge = {
    PluginsLoader: createLoaderStub(calls, { pluginName: "yunzai-demo", reg: "^help$" }),
    Runtime: {
      async init(e) {
        e.runtime = {}
      },
    },
  }
  CommandUsageDB.recordUsage = async payload => {
    recorded.push(payload)
    return payload
  }

  try {
    const result = await bot.invokeCommandByText(
      "help",
      {
        group_id: "10001",
        peer_id: "10001",
        user_id: "20002",
        sender_id: "20002",
        raw_message: "help",
        msg: "help",
        protocol: "milky",
        sender: { nickname: "tester", card: "tester" },
        __synthetic: true,
        __commandUsageSource: "scheduled-command",
      },
      {
        plugin: "yunzai-demo",
      },
    )

    assert.equal(result?.ok, true)
    assert.equal(calls.some(item => item.type === "run"), true)
    assert.equal(recorded.length, 1)
    assert.equal(recorded[0].plugin, "yunzai-demo")
    assert.equal(recorded[0].source, "scheduled-command")
    assert.equal(recorded[0].rawCommand, "help")
  } finally {
    CommandUsageDB.recordUsage = originalRecordUsage
    globalThis.__xunluYunzaiCommandBridge = originalBridge
    globalThis.Bot = originalBot
    globalThis.logger = originalLogger
  }
})

test("startYunzaiCommandUsageBridge records successful Yunzai command usage", async () => {
  const calls = []
  const recorded = []
  const originalLogger = globalThis.logger
  const originalBot = globalThis.Bot
  const originalBridge = globalThis.__xunluYunzaiCommandBridge
  const originalRecordUsage = CommandUsageDB.recordUsage

  globalThis.logger = createLoggerStub()
  globalThis.Bot = createRuntimeBotStub()
  globalThis.__xunluYunzaiCommandBridge = {
    PluginsLoader: createLoaderStub(calls, { pluginName: "yunzai-demo", reg: "^#help$" }),
    Runtime: {
      async init() {},
    },
  }
  CommandUsageDB.recordUsage = async payload => {
    recorded.push(payload)
    return payload
  }

  try {
    const ok = await startYunzaiCommandUsageBridge()
    assert.equal(ok, true)

    await globalThis.__xunluYunzaiCommandBridge.PluginsLoader.deal({
      self_id: 99999,
      post_type: "message",
      message_type: "group",
      sub_type: "normal",
      group_id: "10001",
      user_id: "20002",
      raw_message: "#help",
      msg: "#help",
      sender: { nickname: "tester", card: "tester" },
      protocol: "icqq",
    })

    assert.equal(recorded.length, 1)
    assert.equal(recorded[0].plugin, "yunzai-demo")
    assert.equal(recorded[0].reg, "^#help$")
    assert.equal(recorded[0].rawCommand, "#help")
    assert.equal(recorded[0].source, "yunzai")
  } finally {
    CommandUsageDB.recordUsage = originalRecordUsage
    globalThis.__xunluYunzaiCommandBridge = originalBridge
    globalThis.Bot = originalBot
    globalThis.logger = originalLogger
  }
})

test("getHourlyFavoriteCommands accepts whitelist matches on raw Yunzai command text", async () => {
  const groupId = `yunzai-${Date.now()}`
  const userId = "420001"
  const rawCommand = "#胡桃攻略"
  const reg = "^#?(更新)?(\\S+)攻略([1-7])?$"
  const now = Date.now()

  await CommandUsageDB.recordUsage({
    groupId,
    userId,
    plugin: "yunzai-demo",
    reg,
    rawCommand,
    source: "yunzai",
    triggeredAt: now,
  })

  const favorites = await CommandUsageDB.getHourlyFavoriteCommands({
    groupId,
    hourBucket: new Date(now).getHours(),
    whitelistRegs: ["^#?(\\S+)攻略([1-7])?$"],
    historyDays: 1,
    minCount: 1,
  })

  assert.equal(favorites.length, 1)
  assert.equal(favorites[0].plugin, "yunzai-demo")
  assert.equal(favorites[0].raw_command, rawCommand)
})
