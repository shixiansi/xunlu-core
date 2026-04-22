import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { createPluginTestHarness } from "../src/dev/plugin-test-harness.js"
import {
  patchImageSegmentsWithRkeyValue,
  sendLearningSegments,
} from "../src/plugins/learning_chat/controllers/handlers.js"
import { applyDerivedFieldsFromUniversalSegments, UniversalMessage } from "../src/Bot/message/index.js"
import BaseBot from "../src/Bot/index.js"
import { IcqqMessageEvent } from "../src/Bot/adapter/index.js"
import MessageDB from "../src/db/MessageDB.js"
import { createProtocolMock } from "../src/dev/protocol-mock.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")
const fixturePlugin = path.resolve(repoRoot, "test", "fixtures", "plugins", "harness-fixture", "index.js")
const learningChatPlugin = path.resolve(repoRoot, "src", "plugins", "learning_chat", "index.js")

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

test("synthetic command events prefer takeover protocol over local icqq adapter fallback", async () => {
  const previousBot = globalThis.Bot
  globalThis.Bot = {
    self_id: 10000,
    uin: 10000,
    __xunlu_takeover_state: {
      protocol: "milky",
    },
  }

  try {
    const bot = new BaseBot({ adapter: "icqqbot" })
    const event = await bot.buildSyntheticCommandEvent({
      baseMessageRecord: {
        user_id: 10001,
        sender_id: 10001,
        group_id: 123,
        message_scene: "group",
        protocol: "",
      },
      rawCommand: "#点赞",
      userId: 10001,
      groupId: 123,
      scene: "group",
    })

    assert.equal(event.protocol, "milky")
  } finally {
    globalThis.Bot = previousBot
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

test("forward metadata survives protocol parsing across milky, onebot, and icqq", () => {
  const embeddedMessages = [
    {
      type: "node",
      data: {
        uin: 10001,
        name: "mock",
        content: [{ type: "text", data: { text: "hello" } }],
      },
    },
  ]

  const milkyForward = UniversalMessage.fromMilky([
    {
      type: "forward",
      data: {
        forward_id: "milky-fwd-1",
        title: "群聊的聊天记录",
        summary: "查看2条转发消息",
        preview: ["纳西妲: 测试转发"],
        messages: [
          {
            user_id: 10001,
            sender_name: "纳西妲",
            segments: [{ type: "text", data: { text: "测试转发" } }],
          },
        ],
      },
    },
  ]).segments[0]
  assert.equal(milkyForward?.data?.id, "milky-fwd-1")
  assert.equal(milkyForward?.data?.forward_id, "milky-fwd-1")
  assert.equal(milkyForward?.data?.messages?.length, 1)

  const onebotForward = UniversalMessage.fromOnebotV11([
    {
      type: "forward",
      data: {
        id: "onebot-fwd-1",
        title: "群聊的聊天记录",
        summary: "查看2条转发消息",
        preview: ["纳西妲: 测试转发"],
        messages: embeddedMessages,
      },
    },
  ]).segments[0]
  assert.equal(onebotForward?.data?.id, "onebot-fwd-1")
  assert.equal(onebotForward?.data?.forward_id, "onebot-fwd-1")
  assert.equal(onebotForward?.data?.messages?.length, 1)

  const icqqForward = UniversalMessage.fromICQQ([
    {
      type: "node",
      resid: "icqq-fwd-1",
      title: "群聊的聊天记录",
      summary: "查看2条转发消息",
      preview: ["纳西妲: 测试转发"],
      messages: embeddedMessages,
    },
  ]).segments[0]
  assert.equal(icqqForward?.data?.id, "icqq-fwd-1")
  assert.equal(icqqForward?.data?.forward_id, "icqq-fwd-1")
  assert.equal(icqqForward?.data?.messages?.length, 1)
})

test("icqq message storage prefers raw protocol segments when takeover provides both message and segments", async () => {
  const listener = new IcqqMessageEvent()
  let captured = null
  const originalSave = MessageDB.saveMessage.bind(MessageDB)
  MessageDB.saveMessage = async (groupId, payload) => {
    captured = { groupId, payload }
    return true
  }

  try {
    await listener.addMessage({
      group_id: 123,
      message_id: "1",
      user_id: 10001,
      time: 1710000000,
      message: [{ type: "text", data: { content: "[forward]" } }],
      segments: [{ type: "forward", data: { forward_id: "milky-fwd-1", summary: "[聊天记录]" } }],
      sender: { user_id: 10001, nickname: "mock" },
    })

    assert.equal(captured?.groupId, 123)
    assert.deepEqual(captured?.payload?.message, [
      { type: "forward", data: { forward_id: "milky-fwd-1", summary: "[聊天记录]" } },
    ])
  } finally {
    MessageDB.saveMessage = originalSave
  }
})

test("MessageDB.saveMessage strips unknown columns before persisting", async () => {
  const originalGetGroupTable = MessageDB.getGroupTable.bind(MessageDB)
  let created = null
  MessageDB.getGroupTable = async () => ({
    COLUMNS: {
      message_id: {},
      user_id: {},
      message: {},
      time: {},
      sender: {},
    },
    async create(payload) {
      created = payload
      return payload
    },
    async findByPk() {
      return null
    },
  })

  try {
    await MessageDB.saveMessage(123, {
      message_id: "1",
      user_id: 10001,
      message: [],
      time: 1710000000,
      sender: { user_id: 10001 },
      universal_message: [{ type: "forward", data: { forward_id: "should-drop" } }],
      forward_meta: [{ forward_id: "should-drop" }],
    })

    assert.deepEqual(Object.keys(created || {}).sort(), ["message", "message_id", "sender", "time", "user_id"])
    assert.equal(created?.forward_meta, undefined)
    assert.equal(created?.universal_message, undefined)
  } finally {
    MessageDB.getGroupTable = originalGetGroupTable
  }
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

test("takeover milky raw segments stay authoritative for at-bot commands", async () => {
  const harness = await createPluginTestHarness({ plugins: [learningChatPlugin], protocol: "milky", selfId: 2548285036 })
  try {
    const res = await harness.emitMessage({
      scene: "group",
      group_id: 629661253,
      user_id: 1765629830,
      text: "开启学习",
      rawSegments: [
        { type: "mention", data: { user_id: 2548285036, name: "bot" } },
        { type: "text", data: { text: " 开启学习" } },
      ],
      extra: {
        message: [
          { type: "at", qq: "2548285036" },
          { type: "text", text: " 开启学习" },
        ],
        __xunluTakeover: true,
        __commandUsageSource: "yunzai-takeover",
      },
    })

    assert.equal(res.ok, true)
    assert.equal(res.replies.length, 1)
    assert.equal(res.replies[0]?.text, "本群已开启学习")
    const sendCall = res.apiCalls.find(call => call?.name === "send_group_message")
    assert.ok(sendCall)
  } finally {
    await harness.dispose()
  }
})

