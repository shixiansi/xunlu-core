import test from "node:test"
import assert from "node:assert/strict"

import BaseBot from "../src/Bot/index.js"
import { createUniversalBotApi } from "../src/Bot/api/universal-bot-api.js"

test("makeForwardMsg respects explicit sender identity fields", async () => {
  const bot = new BaseBot({ adapter: "test" })
  globalThis.Bot = {
    uin: 99999,
    nickname: "bot",
    makeGroupForwardMsg(msg) {
      return { type: "node", data: msg }
    },
  }

  const ctx = {
    isGroup: true,
    group_id: 123,
    user_id: 555,
    sender: { card: "trigger", nickname: "trigger" },
    async getGroupMemberInfo() {
      return { card: "trigger", nickname: "trigger" }
    },
    group: {
      async makeForwardMsg(msg) {
        return { type: "node", data: msg }
      },
    },
  }

  const res = await bot.makeForwardMsg(ctx, [
    {
      user_id: 123456,
      nickname: "target-user",
      sender_name: "target-user",
      name: "target-user",
      content: [{ type: "text", data: { text: "hello" } }],
      time: 100,
    },
  ])

  assert.equal(res.data[0].user_id, 123456)
  assert.equal(res.data[0].nickname, "target-user")
  assert.equal(res.data[0].sender_name, "target-user")
  assert.equal(res.data[0].name, "target-user")
})

test("makeGroupForwardMsgByUser builds identity without mutating ctx.user_id", async () => {
  const bot = new BaseBot({ adapter: "test" })
  globalThis.Bot = {
    uin: 99999,
    nickname: "bot",
    makeGroupForwardMsg(msg) {
      return { type: "node", data: msg }
    },
  }

  const api = createUniversalBotApi({ bot })
  const ctx = {
    group_id: 123,
    user_id: 555,
    async getGroupMemberInfo(groupId, userId) {
      assert.equal(groupId, 123)
      assert.equal(userId, 123456)
      return { card: "mentioned-user", nickname: "mentioned-user" }
    },
    group: {
      async makeForwardMsg(msg) {
        return { type: "node", data: msg }
      },
    },
  }

  const originalUserId = ctx.user_id
  const res = await api.makeGroupForwardMsgByUser(ctx, 123456, [{ content: "hello", time: 100 }], "desc")

  assert.equal(ctx.user_id, originalUserId)
  assert.equal(res.data[0].user_id, 123456)
  assert.equal(res.data[0].nickname, "mentioned-user")
  assert.equal(res.data[0].sender_name, "mentioned-user")
  assert.equal(res.data[0].name, "mentioned-user")
})

test("makeGroupForwardMsgByUser also supports ctx-bound call style", async () => {
  const bot = new BaseBot({ adapter: "test" })
  globalThis.Bot = {
    uin: 99999,
    nickname: "bot",
  }

  const api = createUniversalBotApi({ bot })
  const ctx = {
    group_id: 123,
    user_id: 555,
    async getGroupMemberInfo(groupId, userId) {
      assert.equal(groupId, 123)
      assert.equal(userId, 222222)
      return { card: "bound-user", nickname: "bound-user" }
    },
    group: {
      async makeForwardMsg(msg) {
        return { type: "node", data: msg }
      },
    },
  }
  ctx.makeGroupForwardMsgByUser = api.makeGroupForwardMsgByUser

  const res = await ctx.makeGroupForwardMsgByUser(222222, [{ content: "hello", time: 100 }], "desc")

  assert.equal(res.data[0].user_id, 222222)
  assert.equal(res.data[0].nickname, "bound-user")
  assert.equal(res.data[0].sender_name, "bound-user")
  assert.equal(res.data[0].name, "bound-user")
})
