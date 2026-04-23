import assert from "node:assert/strict"
import test from "node:test"

import { createUniversalBotApi } from "../src/Bot/api/universal-bot-api.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

test("universal bot api sendMessage prefers __xunlu_runtime_bot over global Bot proxy", async () => {
  const calls = []
  const previousBot = globalThis.Bot
  const previousRawRuntimeBot = globalThis.__xunlu_runtime_bot

  try {
    globalThis.__xunlu_runtime_bot = {
      adapterType: "milky",
      async sendMsg(target, message) {
        calls.push({ target, message })
        return { ok: true }
      },
    }
    globalThis.Bot = new Proxy(
      {},
      {
        get() {
          throw new Error("global Bot proxy should not be touched")
        },
      },
    )

    const api = createUniversalBotApi({ bot: {}, adapterHint: "milky" })
    const res = await api.sendMessage({ group_id: 123456 }, "帮助")

    assert.deepEqual(res, { ok: true })
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].target, { group_id: 123456 })
  } finally {
    globalThis.__xunlu_runtime_bot = previousRawRuntimeBot
    globalThis.Bot = previousBot
  }
})

test("universal bot api detects onebot runtime behind yunzai icqq wrapper for raw node forward", async () => {
  const calls = []
  const previousBot = globalThis.Bot
  const previousRawRuntimeBot = globalThis.__xunlu_runtime_bot

  try {
    globalThis.__xunlu_runtime_bot = {
      botQQ: 2548285036,
      2548285036: {
        adapter: {
          name: "OneBotV11",
        },
      },
      async sendMsg(target, message) {
        calls.push({ target, message })
        return { ok: true, kind: "forward" }
      },
    }
    globalThis.Bot = globalThis.__xunlu_runtime_bot

    const api = createUniversalBotApi({ bot: { adapter: "icqq" }, adapterHint: "icqq" })
    const message = [{ type: "node", data: { uin: 10001, name: "mock", content: "hello" } }]
    const res = await api.sendMessage({ group_id: 123456 }, message)

    assert.deepEqual(res, { ok: true, kind: "forward" })
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].target, { group_id: 123456 })
    assert.deepEqual(calls[0].message, message)
  } finally {
    globalThis.__xunlu_runtime_bot = previousRawRuntimeBot
    globalThis.Bot = previousBot
  }
})

test("universal bot api forwards onebot node message through pickGroup when runtime bot lacks sendMsg", async () => {
  const calls = []
  const previousBot = globalThis.Bot
  const previousRawRuntimeBot = globalThis.__xunlu_runtime_bot

  try {
    globalThis.__xunlu_runtime_bot = {
      botQQ: 2548285036,
      2548285036: {
        adapter: {
          name: "OneBotV11",
        },
      },
      pickGroup(groupId) {
        return {
          async sendMsg(message) {
            calls.push({ groupId, message })
            return { ok: true, via: "pickGroup" }
          },
        }
      },
    }
    globalThis.Bot = globalThis.__xunlu_runtime_bot

    const api = createUniversalBotApi({ bot: { adapter: "icqq" }, adapterHint: "icqq" })
    const message = [{ type: "node", data: { uin: 10001, name: "mock", content: "hello" } }]
    const res = await api.sendMessage({ group_id: 123456 }, message)

    assert.deepEqual(res, { ok: true, via: "pickGroup" })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].groupId, 123456)
    assert.deepEqual(calls[0].message, message)
  } finally {
    globalThis.__xunlu_runtime_bot = previousRawRuntimeBot
    globalThis.Bot = previousBot
  }
})
