import assert from "node:assert/strict"
import test from "node:test"

import createMilkyBinding from "../src/runtime/drivers/milky-binding.js"
import createOneBotV11Binding from "../src/runtime/drivers/onebotv11-binding.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

function createAdapterStubs(overrides = {}) {
  return {
    adapterType: "MockAdapter",
    async callApi() {},
    async sendApi() {},
    async sendMsg() {},
    async recallPrivateMessage() {},
    async recallGroupMessage() {},
    async getLoginInfo() {
      return { user_id: 22334455, nickname: "real-bot" }
    },
    async getUserProfile() {},
    async getFriendList() {
      return new Map()
    },
    async getFriendInfo() {},
    async acceptFriendRequest() {},
    async rejectFriendRequest() {},
    async getGroupList() {
      return new Map()
    },
    async getGroupInfo() {},
    async getGroupMemberList() {
      return new Map()
    },
    async getGroupMemberInfo() {},
    async setGroupName() {},
    async setGroupMemberCard() {},
    async setGroupMemberAdmin() {},
    async setGroupMemberSpecialTitle() {},
    async setGroupMemberMute() {},
    async setGroupWholeMute() {},
    async kickGroupMember() {},
    async quitGroup() {},
    async sendGroupMessageReaction() {},
    async acceptGroupRequest() {},
    async rejectGroupRequest() {},
    pickUser() {
      return {}
    },
    pickGroup() {
      return {}
    },
    makeForwardMsg() {
      return []
    },
    deleteMessage() {},
    ...overrides,
  }
}

test("milky binding refreshes identity fields even when currentBot placeholder exists", async () => {
  const binding = createMilkyBinding()
  const runtimeBot = binding.decorateRuntimeBot({
    currentBot: { uin: 10000, self_id: 10000, user_id: 10000, nickname: "placeholder" },
    loginInfo: { user_id: 22334455, nickname: "real-bot" },
    adapter: createAdapterStubs(),
    botCore: {},
  })

  assert.equal(runtimeBot.uin, 22334455)
  assert.equal(runtimeBot.self_id, 22334455)
  assert.equal(runtimeBot.user_id, 22334455)
  assert.equal(runtimeBot.nickname, "real-bot")

  const previousBot = globalThis.Bot
  try {
    globalThis.Bot = runtimeBot
    const info = await runtimeBot.getLoginInfo()
    assert.equal(info.user_id, 22334455)
  } finally {
    globalThis.Bot = previousBot
  }
})

test("onebot binding refreshes identity fields even when currentBot placeholder exists", async () => {
  const binding = createOneBotV11Binding()
  const runtimeBot = binding.decorateRuntimeBot({
    currentBot: { uin: 10000, self_id: 10000, user_id: 10000, nickname: "placeholder" },
    loginInfo: { user_id: 55667788, nickname: "onebot-real" },
    adapter: createAdapterStubs({
      async getLoginInfo() {
        return { user_id: 55667788, nickname: "onebot-real" }
      },
    }),
    botCore: {},
  })

  assert.equal(runtimeBot.uin, 55667788)
  assert.equal(runtimeBot.self_id, 55667788)
  assert.equal(runtimeBot.user_id, 55667788)
  assert.equal(runtimeBot.nickname, "onebot-real")

  const previousBot = globalThis.Bot
  try {
    globalThis.Bot = runtimeBot
    const info = await runtimeBot.getLoginInfo()
    assert.equal(info.user_id, 55667788)
  } finally {
    globalThis.Bot = previousBot
  }
})
