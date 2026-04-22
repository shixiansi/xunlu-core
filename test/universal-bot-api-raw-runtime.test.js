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
