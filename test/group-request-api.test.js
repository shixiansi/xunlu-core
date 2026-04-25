import assert from "node:assert/strict"
import test from "node:test"

import { applyUniversalBotApi, createUniversalBotApi } from "../src/Bot/api/universal-bot-api.js"
import { register as registerGroup, __test as groupHandlersTest } from "../src/plugins/group/controllers/handlers.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

function collectHandlers(registerFn) {
  const commands = []
  registerFn({
    registerCommand(command, handler) {
      commands.push({ command, handler })
    },
    onMount() {},
    callFnc() {
      return Promise.resolve(true)
    },
  })
  return commands
}

function findHandler(commands, predicate) {
  const found = commands.find(predicate)?.handler
  assert.ok(found)
  return found
}

test("onebot rejectGroupRequest prefers ctx.bot sendApi over runtime icqq setGroupAddRequest", async () => {
  const previousBot = globalThis.Bot
  const previousRuntimeBot = globalThis.__xunlu_runtime_bot
  const calls = []

  globalThis.Bot = {
    setGroupAddRequest() {
      throw new Error("should not use icqq setGroupAddRequest")
    },
  }
  globalThis.__xunlu_runtime_bot = undefined

  try {
    const api = createUniversalBotApi()
    const result = await api.rejectGroupRequest.call(
      {
        protocol: "onebotv11",
        bot: {
          adapter: { name: "OneBotv11" },
          async sendApi(action, params) {
            calls.push({ action, params })
            return { ok: true }
          },
        },
      },
      { flag: "flag-1", sub_type: "add", reason: "deny" },
    )

    assert.deepEqual(calls, [
      {
        action: "set_group_add_request",
        params: {
          flag: "flag-1",
          sub_type: "add",
          approve: false,
          reason: "deny",
        },
      },
    ])
    assert.deepEqual(result, { ok: true })
  } finally {
    globalThis.Bot = previousBot
    globalThis.__xunlu_runtime_bot = previousRuntimeBot
  }
})

test("onebot acceptGroupRequest prefers ctx.bot sendApi over runtime icqq setGroupAddRequest", async () => {
  const previousBot = globalThis.Bot
  const previousRuntimeBot = globalThis.__xunlu_runtime_bot
  const calls = []

  globalThis.Bot = {
    setGroupAddRequest() {
      throw new Error("should not use icqq setGroupAddRequest")
    },
  }
  globalThis.__xunlu_runtime_bot = undefined

  try {
    const api = createUniversalBotApi()
    const result = await api.acceptGroupRequest.call(
      {
        protocol: "onebotv11",
        bot: {
          adapter: { name: "OneBotv11" },
          async sendApi(action, params) {
            calls.push({ action, params })
            return { ok: true }
          },
        },
      },
      { flag: "flag-2", sub_type: "add", reason: "allow" },
    )

    assert.deepEqual(calls, [
      {
        action: "set_group_add_request",
        params: {
          flag: "flag-2",
          sub_type: "add",
          approve: true,
          reason: "allow",
        },
      },
    ])
    assert.deepEqual(result, { ok: true })
  } finally {
    globalThis.Bot = previousBot
    globalThis.__xunlu_runtime_bot = previousRuntimeBot
  }
})

test("onebot acceptGroupRequest ignores wrapped universal candidates and still uses ctx.bot sendApi", async () => {
  const previousBot = globalThis.Bot
  const previousRuntimeBot = globalThis.__xunlu_runtime_bot
  const calls = []

  globalThis.Bot = undefined
  globalThis.__xunlu_runtime_bot = {
    adapter: { name: "icqq" },
    setGroupAddRequest() {
      throw new Error("should not use icqq setGroupAddRequest")
    },
  }

  try {
    const wrappedOnebotBot = {
      adapter: { name: "OneBotv11" },
      async sendApi(action, params) {
        calls.push({ action, params })
        return { ok: true }
      },
    }
    applyUniversalBotApi(wrappedOnebotBot)

    const api = createUniversalBotApi()
    const result = await api.acceptGroupRequest.call(
      {
        protocol: "onebotv11",
        bot: wrappedOnebotBot,
      },
      { flag: "flag-3", type: "join_request", reason: "allow" },
    )

    assert.deepEqual(calls, [
      {
        action: "set_group_add_request",
        params: {
          flag: "flag-3",
          sub_type: "add",
          approve: true,
          reason: "allow",
        },
      },
    ])
    assert.deepEqual(result, { ok: true })
  } finally {
    globalThis.Bot = previousBot
    globalThis.__xunlu_runtime_bot = previousRuntimeBot
  }
})

test("onebot rejectGroupRequest ignores wrapped universal candidates and still uses ctx.bot sendApi", async () => {
  const previousBot = globalThis.Bot
  const previousRuntimeBot = globalThis.__xunlu_runtime_bot
  const calls = []

  globalThis.Bot = undefined
  globalThis.__xunlu_runtime_bot = {
    adapter: { name: "icqq" },
    setGroupAddRequest() {
      throw new Error("should not use icqq setGroupAddRequest")
    },
  }

  try {
    const wrappedOnebotBot = {
      adapter: { name: "OneBotv11" },
      async sendApi(action, params) {
        calls.push({ action, params })
        return { ok: true }
      },
    }
    applyUniversalBotApi(wrappedOnebotBot)

    const api = createUniversalBotApi()
    const result = await api.rejectGroupRequest.call(
      {
        protocol: "onebotv11",
        bot: wrappedOnebotBot,
      },
      { flag: "flag-4", type: "join_request", reason: "deny" },
    )

    assert.deepEqual(calls, [
      {
        action: "set_group_add_request",
        params: {
          flag: "flag-4",
          sub_type: "add",
          approve: false,
          reason: "deny",
        },
      },
    ])
    assert.deepEqual(result, { ok: true })
  } finally {
    globalThis.Bot = previousBot
    globalThis.__xunlu_runtime_bot = previousRuntimeBot
  }
})

test("group decrease does not reply when the removed member is the bot itself", async () => {
  const commands = collectHandlers(registerGroup)
  const handler = findHandler(
    commands,
    item => Array.isArray(item.command) && item.command[1] === "notice.group.decrease",
  )
  const replies = []

  const result = await handler({
    group_id: 1061170515,
    user_id: 3239716086,
    self_id: 3239716086,
    reply: async message => {
      replies.push(message)
      return true
    },
  })

  assert.equal(result, false)
  assert.equal(replies.length, 0)
})
