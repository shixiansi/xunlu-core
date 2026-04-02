import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { createPluginTestHarness } from "../src/dev/plugin-test-harness.js"
import {
  patchImageSegmentsWithRkeyValue,
  sendLearningSegments,
} from "../src/plugins/learning_chat/controllers/handlers.js"
import { applyDerivedFieldsFromUniversalSegments } from "../src/Bot/message/context.js"
import { createProtocolMock } from "../src/dev/protocol-mock.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")
const fixturePlugin = path.resolve(repoRoot, "test", "fixtures", "plugins", "harness-fixture", "index.js")

installTestRuntime(test)

const expectations = {
  milky: {
    send: "send_group_message",
    recall: "recall_group_message",
    reaction: "send_group_message_reaction",
    friendRequest: "accept_friend_request",
    groupRequest: "accept_group_request",
    mute: "set_group_member_mute",
    like: "send_profile_like",
  },
  onebotv11: {
    send: "send_group_msg",
    recall: "delete_msg",
    reaction: "set_msg_emoji_like",
    friendRequest: "set_friend_add_request",
    groupRequest: "set_group_add_request",
    mute: "set_group_ban",
    like: "send_like",
  },
  icqq: {
    send: "sendMsg",
    recall: "pickGroup.recallMsg",
    reaction: "pickGroup.setReaction",
    friendRequest: "setFriendAddRequest",
    groupRequest: "setGroupAddRequest",
    mute: "pickGroup.muteMember",
    like: "sendLike",
  },
}

function resetCalls(runtime) {
  runtime.calls.length = 0
  runtime.errors.length = 0
  runtime.warnings.length = 0
}

test("protocol mocks expose unified calls for core APIs", async () => {
  for (const protocol of ["milky", "onebotv11", "icqq"]) {
    const runtime = createProtocolMock({ protocol, selfId: 10000 })
    const { bot } = runtime

    await bot.sendMessage({ group_id: 123 }, "hello")
    assert.equal(runtime.calls.at(-1)?.protocol, protocol)
    assert.equal(runtime.calls.at(-1)?.name, expectations[protocol].send)
    assert.equal(typeof runtime.calls.at(-1)?.kind, "string")
    resetCalls(runtime)

    await bot.recallMessage({ group_id: 123, message_seq: 11, message_id: "11", isGroup: true })
    assert.equal(runtime.calls.at(-1)?.name, expectations[protocol].recall)
    resetCalls(runtime)

    await bot.sendGroupMessageReaction({ group_id: 123, message_seq: 11, reaction: 277 })
    assert.equal(runtime.calls.at(-1)?.name, expectations[protocol].reaction)
    resetCalls(runtime)

    if (protocol === "milky") {
      await bot.acceptFriendRequest({ initiator_uid: "friend-1" })
      assert.equal(runtime.calls.at(-1)?.name, expectations[protocol].friendRequest)
      resetCalls(runtime)

      await bot.rejectFriendRequest({ initiator_uid: "friend-1" })
      assert.equal(runtime.calls.at(-1)?.name, "reject_friend_request")
      resetCalls(runtime)

      await bot.acceptGroupRequest({
        notification_seq: 1,
        notification_type: "join_request",
        group_id: 123,
      })
      assert.equal(runtime.calls.at(-1)?.name, expectations[protocol].groupRequest)
      resetCalls(runtime)

      await bot.rejectGroupRequest({
        notification_seq: 1,
        notification_type: "join_request",
        group_id: 123,
      })
      assert.equal(runtime.calls.at(-1)?.name, "reject_group_request")
      resetCalls(runtime)
    } else {
      await bot.acceptFriendRequest({ flag: "friend-flag", reason: "ok" })
      assert.equal(runtime.calls.at(-1)?.name, expectations[protocol].friendRequest)
      assert.equal(runtime.calls.at(-1)?.params?.approve, true)
      resetCalls(runtime)

      await bot.rejectFriendRequest({ flag: "friend-flag", reason: "no" })
      assert.equal(runtime.calls.at(-1)?.name, expectations[protocol].friendRequest)
      assert.equal(runtime.calls.at(-1)?.params?.approve, false)
      resetCalls(runtime)

      await bot.acceptGroupRequest({ flag: "group-flag", sub_type: "add", reason: "ok" })
      assert.equal(runtime.calls.at(-1)?.name, expectations[protocol].groupRequest)
      assert.equal(runtime.calls.at(-1)?.params?.approve, true)
      resetCalls(runtime)

      await bot.rejectGroupRequest({ flag: "group-flag", sub_type: "add", reason: "no" })
      assert.equal(runtime.calls.at(-1)?.name, expectations[protocol].groupRequest)
      assert.equal(runtime.calls.at(-1)?.params?.approve, false)
      resetCalls(runtime)
    }

    await bot.setGroupMemberMute({ group_id: 123, user_id: 10001, duration: 60 })
    assert.equal(runtime.calls.at(-1)?.name, expectations[protocol].mute)
    resetCalls(runtime)

    await bot.sendProfileLike({ user_id: 10001, times: 3 })
    assert.equal(runtime.calls.at(-1)?.name, expectations[protocol].like)
    resetCalls(runtime)
  }
})

test("forward passthrough stays protocol-native", async () => {
  const milky = createProtocolMock({ protocol: "milky", selfId: 10000 })
  await milky.bot.sendMsg(
    { group_id: 123 },
    [
      {
        type: "forward",
        data: {
          messages: [
            {
              user_id: 10001,
              sender_name: "mock",
              segments: [{ type: "text", data: { text: "hello" } }],
            },
          ],
        },
      },
    ],
  )
  assert.equal(milky.calls.at(-1)?.name, "send_group_message")
  assert.equal(milky.calls.at(-1)?.params?.message?.[0]?.type, "forward")

  const onebot = createProtocolMock({ protocol: "onebotv11", selfId: 10000 })
  await onebot.bot.sendMsg(
    { group_id: 123 },
    [{ type: "node", data: { uin: 10001, name: "mock", content: "hello" } }],
  )
  assert.equal(onebot.calls.at(-1)?.name, "send_group_forward_msg")
  assert.equal(onebot.calls.at(-1)?.params?.messages?.[0]?.type, "node")

  const icqq = createProtocolMock({ protocol: "icqq", selfId: 10000 })
  const forward = await icqq.bot.makeGroupForwardMsg([{ user_id: 10001, sender_name: "mock", message: "hello" }], 123)
  assert.equal(forward[0]?.type, "node")
  await icqq.bot.sendMsg({ group_id: 123 }, forward)
  assert.equal(icqq.calls.at(-1)?.name, "sendMsg")
  assert.equal(icqq.calls.at(-1)?.params?.message?.[0]?.type, "node")
})

test("quote segments map correctly across protocols", async () => {
  for (const protocol of ["milky", "onebotv11", "icqq"]) {
    const harness = await createPluginTestHarness({ plugins: [fixturePlugin], protocol })
    try {
      const res = await harness.emitMessage({
        scene: "group",
        text: "fixture quote",
        group_id: 123,
        user_id: 10001,
      })
      assert.equal(res.ok, true)

      const sendCall = [...res.apiCalls]
        .reverse()
        .find(call => /send/i.test(String(call?.name || "")))
      assert.ok(sendCall)

      const message = sendCall?.params?.message
      assert.ok(Array.isArray(message))
      assert.equal(message[0]?.type, "reply")

      if (protocol === "milky") {
        assert.equal(typeof message[0]?.data?.message_seq, "number")
      } else {
        assert.ok((message[0]?.data?.id ?? message[0]?.id) !== undefined)
      }
    } finally {
      await harness.dispose()
    }
  }
})

test("learning_chat refreshes rkey for image segments stored in data.file", () => {
  const original =
    "https://multimedia.nt.qq.com.cn/download?appid=1407&fileid=abc123&spec=0&rkey=old-token"
  const segments = [{ type: "image", data: { file: original, id: "abc123.jpg" } }]

  const patched = patchImageSegmentsWithRkeyValue(segments, "&rkey=new-token")

  assert.notEqual(patched, segments)
  assert.equal(
    patched[0]?.data?.file,
    "https://multimedia.nt.qq.com.cn/download?appid=1407&fileid=abc123&spec=0&rkey=new-token",
  )
  assert.equal(patched[0]?.data?.url, patched[0]?.data?.file)
})

test("learning_chat proactive sends prepared milky image segments", async () => {
  const original =
    "https://multimedia.nt.qq.com.cn/download?appid=1407&fileid=abc123&spec=0&rkey=old-token"
  let seenTarget = null
  let seenMessage = null

  const ok = await sendLearningSegments(
    213311278,
    [{ type: "image", data: { file: original, id: "abc123.jpg" } }],
    {
      protocol: "milky",
      rkeySuffix: "&rkey=fresh-token",
      downloadImage: async url => {
        assert.equal(
          url,
          "https://multimedia.nt.qq.com.cn/download?appid=1407&fileid=abc123&spec=0&rkey=fresh-token",
        )
        return `base64://${Buffer.from("mock-image", "utf8").toString("base64")}`
      },
      send: async (target, message) => {
        seenTarget = target
        seenMessage = message
      },
    },
  )

  assert.equal(ok, true)
  assert.deepEqual(seenTarget, { group_id: 213311278 })
  assert.equal(seenMessage?.[0]?.type, "image")
  assert.match(String(seenMessage?.[0]?.data?.url || ""), /^base64:\/\//)
  assert.equal(
    seenMessage?.[0]?.data?.file,
    "https://multimedia.nt.qq.com.cn/download?appid=1407&fileid=abc123&spec=0&rkey=fresh-token",
  )
})

test("derived fields recognize raw milky mention aliases for atBot commands", () => {
  const ctx = {
    self_id: 2548285036,
    message: [
      { type: "mention", data: { user_id: 2548285036, name: "bot" } },
      { type: "text", data: { text: " ping" } },
    ],
  }

  applyDerivedFieldsFromUniversalSegments(ctx)

  assert.equal(ctx.msg, "ping")
  assert.equal(ctx.atBot, true)
  assert.equal(ctx.at, "")
})
