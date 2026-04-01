import test from "node:test"
import assert from "node:assert/strict"

import { createUniversalBotApi } from "../src/Bot/api/universal-bot-api.js"
import { segment } from "../src/Bot/segment.js"

function withRuntimeBot(bot, fn) {
  const previous = globalThis.Bot
  globalThis.Bot = bot
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      globalThis.Bot = previous
    })
}

test("icqq getFriendInfo propagates upstream failures", async () => {
  await withRuntimeBot(
    {
      adapterType: "icqq",
      async getStrangerInfo() {
        throw new Error("boom-friend")
      },
    },
    async () => {
      const api = createUniversalBotApi({ adapterHint: "icqq" })
      await assert.rejects(api.getFriendInfo({ user_id: 12345 }), /boom-friend/)
    },
  )
})

test("getGroupMemberList propagates upstream failures instead of returning an empty Map", async () => {
  await withRuntimeBot(
    {
      adapterType: "milky",
      async getGroupMemberList() {
        throw new Error("boom-list")
      },
    },
    async () => {
      const api = createUniversalBotApi({ adapterHint: "milky" })
      await assert.rejects(api.getGroupMemberList(123), /boom-list/)
    },
  )
})

test("getGroupMemberInfo accepts object input and keeps query semantics", async () => {
  const calls = []

  await withRuntimeBot(
    {
      adapterType: "milky",
      async getGroupMemberInfo(input) {
        calls.push(input)
        return { member: { user_id: input.user_id, group_id: input.group_id, card: "tester" } }
      },
    },
    async () => {
      const api = createUniversalBotApi({ adapterHint: "milky" })
      const res = await api.getGroupMemberInfo({ group_id: 123, user_id: 456 })

      assert.deepEqual(calls, [{ group_id: 123, user_id: 456 }])
      assert.deepEqual(res, { user_id: 456, group_id: 123, card: "tester" })
    },
  )
})

test("segment.image returns a unified media segment without fake id fields", () => {
  const seg = segment.image("https://example.com/a.png")

  assert.equal(seg.type, "image")
  assert.equal(seg.data.file, "https://example.com/a.png")
  assert.equal(seg.data.url, "https://example.com/a.png")
  assert.equal(seg.data.uri, "https://example.com/a.png")
  assert.equal(seg.data.temp_url, "https://example.com/a.png")
  assert.equal(seg.data.id, undefined)
  assert.equal(seg.data.fileId, undefined)
  assert.equal(seg.data.path, undefined)
  assert.equal(Object.prototype.hasOwnProperty.call(seg, "file"), false)
  assert.equal(Object.prototype.hasOwnProperty.call(seg, "url"), false)
  assert.equal(Object.prototype.hasOwnProperty.call(seg, "path"), false)
})

test("segment.file keeps remote URLs out of path/id compatibility fields", () => {
  const seg = segment.file("https://example.com/a.zip", "a.zip")

  assert.equal(seg.type, "file")
  assert.equal(seg.data.file, "https://example.com/a.zip")
  assert.equal(seg.data.name, "a.zip")
  assert.equal(seg.data.path, undefined)
  assert.equal(seg.data.id, undefined)
  assert.equal(seg.data.fileId, undefined)
})

test("legacy non-unified segment helpers fail with an explicit contract error", () => {
  assert.throws(
    () => segment.share("https://example.com", "title", "content", "https://example.com/i.png"),
    /not supported by xunlu unified message format/i,
  )
})
