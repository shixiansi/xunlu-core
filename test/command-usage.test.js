import test from "node:test"
import assert from "node:assert/strict"

import BaseBot from "../src/Bot/index.js"
import CommandUsageDB from "../src/db/CommandUsageDB.js"

function createLoggerStub() {
  return {
    info() {},
    warn() {},
    error() {},
    debug() {},
    mark() {},
  }
}

test("processNormalCommands records only tracked message commands", async () => {
  const bot = new BaseBot({ adapter: "test" })
  const originalLogger = globalThis.logger
  const originalRecordUsage = CommandUsageDB.recordUsage
  const calls = []

  globalThis.logger = createLoggerStub()
  CommandUsageDB.recordUsage = async payload => {
    calls.push(payload)
    return payload
  }

  try {
    bot.plugins = {
      watcher: {
        id: "watcher-1",
        plugin: "watcher",
        reg: "",
        event: "message",
        priority: 1,
        fnc: async () => false,
      },
      real: {
        id: "demo-1",
        plugin: "demo",
        reg: "^hello$",
        event: "message",
        priority: 10,
        trackUsage: true,
        fnc: async () => true,
      },
    }

    const result = await bot.processNormalCommands({
      post_type: "message",
      message_type: "group",
      sub_type: "normal",
      group_id: "10001",
      user_id: "20002",
      msg: "hello",
      raw_message: "hello",
      protocol: "milky",
      time: 1,
    })

    assert.equal(result, true)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].plugin, "demo")
    assert.equal(calls[0].reg, "^hello$")
    assert.equal(calls[0].source, "xunlu")
  } finally {
    CommandUsageDB.recordUsage = originalRecordUsage
    globalThis.logger = originalLogger
  }
})

test("processNormalCommands marks takeover hits with explicit source", async () => {
  const bot = new BaseBot({ adapter: "test" })
  const originalLogger = globalThis.logger
  const originalRecordUsage = CommandUsageDB.recordUsage
  const calls = []

  globalThis.logger = createLoggerStub()
  CommandUsageDB.recordUsage = async payload => {
    calls.push(payload)
    return payload
  }

  try {
    bot.plugins = {
      real: {
        id: "demo-1",
        plugin: "demo",
        reg: "^hello$",
        event: "message",
        priority: 10,
        trackUsage: true,
        fnc: async () => true,
      },
    }

    await bot.processNormalCommands({
      post_type: "message",
      message_type: "group",
      sub_type: "normal",
      group_id: "10001",
      user_id: "20002",
      msg: "hello",
      raw_message: "hello",
      protocol: "onebotv11",
      __xunluTakeover: true,
      time: 1,
    })

    assert.equal(calls.length, 1)
    assert.equal(calls[0].source, "yunzai-takeover")
  } finally {
    CommandUsageDB.recordUsage = originalRecordUsage
    globalThis.logger = originalLogger
  }
})

test("invokeCommandByReg replays the exact plugin command and writes proactive audit", async () => {
  const bot = new BaseBot({ adapter: "test" })
  const originalLogger = globalThis.logger
  const originalRecordUsage = CommandUsageDB.recordUsage
  const calls = []
  const invoked = []

  globalThis.logger = createLoggerStub()
  CommandUsageDB.recordUsage = async payload => {
    calls.push(payload)
    return payload
  }

  try {
    bot.plugins = {
      a: {
        id: "plugin-a-1",
        plugin: "plugin-a",
        reg: "^帮助$",
        event: "message",
        priority: 10,
        trackUsage: true,
        fnc: async () => {
          invoked.push("plugin-a")
          return true
        },
      },
      b: {
        id: "plugin-b-1",
        plugin: "plugin-b",
        reg: "^帮助$",
        event: "message",
        priority: 20,
        trackUsage: true,
        fnc: async ctx => {
          invoked.push("plugin-b")
          ctx.handled = true
          return true
        },
      },
    }

    const ctx = {
      group_id: "10001",
      user_id: "20002",
      raw_message: "帮助",
      msg: "帮助",
      protocol: "milky",
      __synthetic: true,
      __proactiveCommand: true,
      __commandUsageSource: "proactive-command",
    }

    const result = await bot.invokeCommandByReg("^帮助$", ctx, {
      event: "message",
      plugin: "plugin-b",
    })

    assert.equal(result, true)
    assert.deepEqual(invoked, ["plugin-b"])
    assert.equal(ctx.handled, true)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].plugin, "plugin-b")
    assert.equal(calls[0].source, "proactive-command")
    assert.equal(calls[0].isSynthetic, true)
  } finally {
    CommandUsageDB.recordUsage = originalRecordUsage
    globalThis.logger = originalLogger
  }
})

test("invokeCommandByText replays local commands with scheduled audit source and skips contexts", async () => {
  const bot = new BaseBot({ adapter: "test" })
  const originalLogger = globalThis.logger
  const originalRecordUsage = CommandUsageDB.recordUsage
  const calls = []
  const invoked = []
  let contextCalls = 0

  globalThis.logger = createLoggerStub()
  CommandUsageDB.recordUsage = async payload => {
    calls.push(payload)
    return payload
  }

  bot.reply = e => {
    e.reply = async () => true
  }

  try {
    bot.plugins = {
      real: {
        id: "demo-1",
        plugin: "demo",
        reg: "^hello$",
        event: "message",
        priority: 10,
        trackUsage: true,
        fnc: async ctx => {
          invoked.push(ctx.raw_message)
          return true
        },
      },
    }

    bot.groupReply = {
      "10001": {
        "20002": [
          {
            cfnc: async () => {
              contextCalls += 1
              return true
            },
            endMsg: null,
            timer: null,
          },
        ],
      },
    }

    const result = await bot.invokeCommandByText("hello", {
      post_type: "message",
      message_type: "group",
      sub_type: "normal",
      group_id: "10001",
      peer_id: "10001",
      user_id: "20002",
      sender_id: "20002",
      msg: "hello",
      raw_message: "hello",
      protocol: "milky",
      sendMessage: async () => true,
      __synthetic: true,
      __commandUsageSource: "scheduled-command",
    })

    assert.equal(result, true)
    assert.deepEqual(invoked, ["hello"])
    assert.equal(contextCalls, 0)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].source, "scheduled-command")
    assert.equal(calls[0].plugin, "demo")
  } finally {
    CommandUsageDB.recordUsage = originalRecordUsage
    globalThis.logger = originalLogger
  }
})

test("buildSyntheticCommandEvent fills self_id and standard message fields", async () => {
  const bot = new BaseBot({ adapter: "test" })
  const originalLogger = globalThis.logger
  const originalBot = globalThis.Bot

  globalThis.logger = createLoggerStub()
  globalThis.Bot = {
    self_id: 99999,
    pickGroup(groupId) {
      return { group_id: groupId }
    },
    pickUser(userId) {
      return { user_id: userId }
    },
  }

  bot.reply = e => {
    e.reply = async () => true
  }

  try {
    const event = await bot.buildSyntheticCommandEvent({
      baseMessageRecord: {
        group_id: "12345",
        user_id: "54321",
        protocol: "milky",
        sender: { nickname: "tester", card: "tester" },
      },
      rawCommand: "帮助",
      reg: "^帮助$",
    })

    assert.equal(event.self_id, 99999)
    assert.equal(event.group_id, "12345")
    assert.equal(String(event.user_id), "54321")
    assert.equal(event.raw_message, "帮助")
    assert.equal(event.msg, "帮助")
    assert.equal(event.sender.nickname, "tester")
    assert.equal(typeof event.reply, "function")
  } finally {
    globalThis.Bot = originalBot
    globalThis.logger = originalLogger
  }
})

test("buildSyntheticCommandEvent supports private peer targets separate from creator identity", async () => {
  const bot = new BaseBot({ adapter: "test" })
  const originalLogger = globalThis.logger
  const originalBot = globalThis.Bot

  globalThis.logger = createLoggerStub()
  globalThis.Bot = {
    self_id: 99999,
    pickUser(userId) {
      return { user_id: userId }
    },
  }

  bot.reply = e => {
    e.reply = async () => true
  }

  try {
    const event = await bot.buildSyntheticCommandEvent({
      baseMessageRecord: {
        protocol: "milky",
        sender: { nickname: "creator", card: "creator" },
      },
      rawCommand: "hello",
      userId: "54321",
      peerId: "67890",
      scene: "private",
      flags: {
        __commandUsageSource: "scheduled-command",
      },
    })

    assert.equal(event.group_id, undefined)
    assert.equal(String(event.peer_id), "67890")
    assert.equal(String(event.user_id), "54321")
    assert.equal(event.message_type, "private")
    assert.equal(event.isPrivate, true)
    assert.equal(String(event.friend.user_id), "67890")
    assert.equal(event.__commandUsageSource, "scheduled-command")
  } finally {
    globalThis.Bot = originalBot
    globalThis.logger = originalLogger
  }
})
