import assert from "node:assert/strict"
import test from "node:test"

import { createUniversalBotApi } from "../src/Bot/api/universal-bot-api.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

test("sendProfileLike prefers ctx.bot thumbUp for onebotv11 when sendApi is unavailable", async () => {
  const previousBot = globalThis.Bot
  const previousRuntimeBot = globalThis.__xunlu_runtime_bot
  const calls = []

  globalThis.Bot = {
    __xunlu_takeover_state: { protocol: "milky" },
    adapterType: "milky",
  }
  globalThis.__xunlu_runtime_bot = undefined

  try {
    const api = createUniversalBotApi()
    const ctxBot = {
      adapter: { name: "OneBotv11" },
      pickFriend(userId) {
        calls.push({ kind: "pickFriend", userId })
        return {
          async thumbUp(times) {
            calls.push({ kind: "thumbUp", times })
            return { ok: true }
          },
        }
      },
    }

    const result = await api.sendProfileLike.call(
      {
        bot: ctxBot,
        user_id: 10001,
      },
      { user_id: 10001, times: 3 },
    )

    assert.deepEqual(calls, [
      { kind: "pickFriend", userId: 10001 },
      { kind: "thumbUp", times: 3 },
    ])
    assert.deepEqual(result, { ok: true })
  } finally {
    globalThis.Bot = previousBot
    globalThis.__xunlu_runtime_bot = previousRuntimeBot
  }
})
