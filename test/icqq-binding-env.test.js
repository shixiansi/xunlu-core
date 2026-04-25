import assert from "node:assert/strict"
import test from "node:test"

import { createIcqqBinding } from "../src/runtime/drivers/icqq-binding.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

test("icqq binding detects wrapped onebot adapter before QQNT heuristic", () => {
  const binding = createIcqqBinding()
  const envName = binding.detectEnv({
    uin: 1765629830,
    QQNT: true,
    botQQ: 2548285036,
    2548285036: {
      adapter: {
        name: "OneBotV11",
      },
    },
  })

  assert.equal(envName, "OneBotv11")
})

test("icqq binding decorates event with wrapped onebot protocol before icqq fallback", async () => {
  const binding = createIcqqBinding()
  const previousBot = globalThis.Bot

  try {
    globalThis.Bot = {}

    const event = await binding.decorateBindEvent(
      {
        bot: {
          adapter: {
            name: "OneBotv11",
          },
        },
        group_id: 123,
        user_id: 456,
        message_id: "789",
        message: [{ type: "text", data: { text: "hello" } }],
      },
      {
        envName: "icqq",
        client: {
          uin: 10000,
          QQNT: true,
          botQQ: 2548285036,
        },
        pluginLoader: {
          renderImg: async () => "",
        },
        fileManager: {
          package: {
            name: "Miao-Yunzai",
          },
        },
        sendMessage: async () => ({ ok: true }),
      },
    )

    assert.equal(event.protocol, "onebotv11")
    assert.equal(event.adapterType, "OneBotV11")
  } finally {
    globalThis.Bot = previousBot
  }
})

test("icqq binding onebot getMsg prefers raw runtime api over universal sendApi wrapper", async () => {
  const binding = createIcqqBinding()
  const previousBot = globalThis.Bot
  const calls = []

  try {
    globalThis.Bot = {
      sendApi: Object.assign(async () => {
        throw new Error("should not call universal wrapper")
      }, { __xunlu_universal: true }),
      __xunlu_raw_sendApi: async (action, params) => {
        calls.push({ action, params })
        return { message: [{ type: "text", data: { text: "hello" } }] }
      },
    }

    const event = await binding.decorateBindEvent(
      {
        bot: {
          adapter: {
            name: "OneBotv11",
          },
        },
        group_id: 123,
        user_id: 456,
        message_id: "789",
        message: [{ type: "text", data: { text: "hello" } }],
      },
      {
        envName: "icqq",
        client: {
          uin: 10000,
          QQNT: true,
          botQQ: 2548285036,
        },
        pluginLoader: {
          renderImg: async () => "",
        },
        fileManager: {
          package: {
            name: "Miao-Yunzai",
          },
        },
        sendMessage: async () => ({ ok: true }),
      },
    )

    const result = await event.getMsg("12345")
    assert.equal(result?.message?.[0]?.data?.text, "hello")
    assert.deepEqual(calls, [{ action: "get_msg", params: { message_id: "12345" } }])
  } finally {
    globalThis.Bot = previousBot
  }
})

test("icqq binding tolerates missing direct member APIs by falling back to pickGroup", async () => {
  const binding = createIcqqBinding()
  const previousBot = globalThis.Bot

  try {
    globalThis.Bot = {
      pickGroup(groupId) {
        return {
          groupId,
          async getMemberMap() {
            return new Map([[10001, { user_id: 10001 }]])
          },
          pickMember(userId) {
            return {
              async getInfo() {
                return { group_id: groupId, user_id: userId, nickname: "mock" }
              },
            }
          },
        }
      },
      pickFriend() {
        return {
          async getChatHistory() {
            return []
          },
        }
      },
    }

    const event = await binding.decorateBindEvent(
      {
        group_id: 123,
        user_id: 10001,
        seq: 1,
        message: [{ type: "text", data: { text: "hello" } }],
      },
      {
        envName: "icqq",
        client: {
          uin: 10000,
          QQNT: true,
        },
        pluginLoader: {
          renderImg: async () => "",
        },
        fileManager: {
          package: {
            name: "Miao-Yunzai",
          },
        },
        sendMessage: async () => ({ ok: true }),
      },
    )

    const memberInfo = await event.getGroupMemberInfo(123, 10001)
    const memberList = await event.getGroupMemberList(123)

    assert.equal(memberInfo?.user_id, 10001)
    assert.equal(memberList instanceof Map, true)
  } finally {
    globalThis.Bot = previousBot
  }
})
