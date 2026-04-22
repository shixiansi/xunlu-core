import assert from "node:assert/strict"
import test from "node:test"

import MessagePipeline from "../src/Bot/runtime/message-pipeline.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

test("MessagePipeline force-overrides stale event sendMessage with universal bot api", async () => {
  const previousRuntimeBot = globalThis.__xunlu_runtime_bot
  const previousBot = globalThis.Bot
  const sendCalls = []

  try {
    globalThis.__xunlu_runtime_bot = {
      adapterType: "milky",
      async sendMsg(target, message) {
        sendCalls.push({ target, message })
        return { ok: true }
      },
    }
    globalThis.Bot = globalThis.__xunlu_runtime_bot

    const pipeline = new MessagePipeline(
      {
        adapter: "milky",
      },
      {
        async getMasterList() {
          return []
        },
        async enrichGroupRoleFlags() {},
      },
    )

    const staleSendMessage = async () => {
      throw new Error("stale sendMessage should be replaced")
    }
    staleSendMessage.__xunlu_legacy_sendMessage = true

    const event = {
      self_id: 123456,
      post_type: "message",
      message_type: "group",
      group_id: 654321,
      user_id: 111111,
      sender_id: 111111,
      message_id: "42",
      protocol: "milky",
      raw_message: "帮助",
      message: [{ type: "text", data: { text: "帮助" } }],
      sendMessage: staleSendMessage,
    }

    await pipeline.prepareEvent(event)

    assert.notEqual(event.sendMessage, staleSendMessage)
    const res = await event.sendMessage({ group_id: 654321 }, "帮助")
    assert.deepEqual(res, { ok: true })
    assert.equal(sendCalls.length, 1)
    assert.deepEqual(sendCalls[0].target, { group_id: 654321 })
  } finally {
    globalThis.__xunlu_runtime_bot = previousRuntimeBot
    globalThis.Bot = previousBot
  }
})
