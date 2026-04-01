import test from "node:test"
import assert from "node:assert/strict"

import { createUniversalBotApi } from "../src/Bot/api/universal-bot-api.js"

function withRuntimeBot(bot, fn) {
  const previous = globalThis.Bot
  globalThis.Bot = bot
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      globalThis.Bot = previous
    })
}

test("icqq sendProfileLike prefers native sendLike", async () => {
  await withRuntimeBot(
    {
      async sendLike(userId, times) {
        return { ok: true, userId, times }
      },
    },
    async () => {
      const api = createUniversalBotApi({ adapterHint: "icqq" })
      const res = await api.sendProfileLike({ user_id: 123456, times: 3 })

      assert.deepEqual(res, { ok: true, userId: 123456, times: 3 })
    },
  )
})

test("icqq sendMessage falls back to pickUser when pickFriend is unavailable", async () => {
  const calls = []

  await withRuntimeBot(
    {
      pickUser(userId) {
        calls.push(["pickUser", userId])
        return {
          async sendMsg(message) {
            calls.push(["sendMsg", message])
            return { ok: true, message }
          },
        }
      },
    },
    async () => {
      const api = createUniversalBotApi({ adapterHint: "icqq" })
      const res = await api.sendMessage("10001", "hello")

      assert.equal(res.ok, true)
      assert.deepEqual(calls[0], ["pickUser", 10001])
      assert.equal(calls[1][0], "sendMsg")
      assert.ok(Array.isArray(calls[1][1]))
      assert.ok(calls[1][1].length > 0)
    },
  )
})

test("icqq acceptGroupRequest maps to native setGroupAddRequest signature", async () => {
  const calls = []

  await withRuntimeBot(
    {
      async setGroupAddRequest(...args) {
        calls.push(args)
        return true
      },
    },
    async () => {
      const api = createUniversalBotApi({ adapterHint: "icqq" })
      const res = await api.acceptGroupRequest({
        flag: "flag-1",
        sub_type: "invite",
        reason: "ok",
        block: true,
      })

      assert.equal(res, true)
      assert.deepEqual(calls, [["flag-1", true, "ok", true]])
    },
  )
})

test("icqq rejectGroupRequest maps to native setGroupAddRequest signature", async () => {
  const calls = []

  await withRuntimeBot(
    {
      async setGroupAddRequest(...args) {
        calls.push(args)
        return true
      },
    },
    async () => {
      const api = createUniversalBotApi({ adapterHint: "icqq" })
      const res = await api.rejectGroupRequest({
        flag: "flag-2",
        sub_type: "add",
        reason: "no",
        block: false,
      })

      assert.equal(res, true)
      assert.deepEqual(calls, [["flag-2", false, "no", false]])
    },
  )
})

test("group role helpers reuse current ctx role flags", async () => {
  const api = createUniversalBotApi({ adapterHint: "milky" })
  const ctx = {
    group_id: 123,
    user_id: 456,
    member: {
      user_id: 456,
      nickname: "admin-user",
      role: "admin",
    },
  }
  ctx.isGroupAdmin = api.isGroupAdmin
  ctx.isGroupOwner = api.isGroupOwner

  assert.equal(await ctx.isGroupAdmin(), true)
  assert.equal(await ctx.isGroupOwner(), false)
})

test("group role helpers resolve bot owner through fallback", async () => {
  const placeholder = {
    user_id: 3239716086,
    nickname: "3239716086",
    card: "",
    role: "member",
  }

  await withRuntimeBot(
    {
      uin: 3239716086,
    },
    async () => {
      const api = createUniversalBotApi({ adapterHint: "milky" })
      const ctx = {
        protocol: "milky",
        group_id: 428596438,
        self_id: 3239716086,
        async getGroupMemberInfo() {
          return placeholder
        },
        async getGroupMemberList(groupId) {
          assert.equal(groupId, 428596438)
          return {
            members: [
              {
                user_id: 3239716086,
                nickname: "bot-self",
                card: "",
                role: "owner",
                group_id: 428596438,
                update_time: 1,
              },
            ],
          }
        },
        group: {
          pickMember() {
            return { info: placeholder }
          },
        },
      }
      ctx.isBotGroupOwner = api.isBotGroupOwner
      ctx.isBotGroupAdmin = api.isBotGroupAdmin

      assert.equal(await ctx.isBotGroupOwner(), true)
      assert.equal(await ctx.isBotGroupAdmin(), true)
    },
  )
})
