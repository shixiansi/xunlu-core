import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { createPluginTestHarness } from "../src/dev/plugin-test-harness.js"
import MessageDB from "../src/db/MessageDB.js"
import { __test as groupHandlersTest } from "../src/plugins/group/controllers/handlers.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")
const pixivFixture = path.resolve(repoRoot, "test", "fixtures", "plugins", "pixiv", "index.js")
const masterId = 1765629830
const EXAMPLE_COMMAND = "\u793a\u4f8b"
const HELP_COMMAND = "\u5e2e\u52a9"
const OTHER_FORWARD_COMMAND = "\u6d4b\u8bd5\u8f6c\u53d1"
const OTHER_RECALL_COMMAND = "\u6d4b\u8bd5\u64a4\u56de"

installTestRuntime(test)

async function withHarness(options, fn) {
  const harness = await createPluginTestHarness(options)
  try {
    return await fn(harness)
  } finally {
    await harness.dispose()
  }
}

function renderSegmentsText(segments = []) {
  return (Array.isArray(segments) ? segments : [])
    .map(seg => seg?.data?.content ?? seg?.data?.text ?? seg?.text ?? "")
    .join("")
}

test("example plugin smoke works on milky and onebotv11", async () => {
  for (const protocol of ["milky", "onebotv11"]) {
    await withHarness({ plugins: ["example-plugin"], protocol }, async harness => {
      const res = await harness.emitMessage({
        scene: "group",
        text: EXAMPLE_COMMAND,
        group_id: 123,
        user_id: masterId,
      })
      assert.equal(res.ok, true)
      assert.ok(res.replies.length >= 1)
    })
  }
})

test("help plugin render smoke records fake render output", async () => {
  await withHarness({ plugins: ["help"], protocol: "milky" }, async harness => {
    const res = await harness.emitMessage({
      scene: "group",
      text: HELP_COMMAND,
      group_id: 123,
      user_id: masterId,
    })
    assert.equal(res.ok, true)
    assert.equal(res.renderCalls.length, 1)
    assert.ok(res.replies.length >= 1)
  })
})

test("group plugin handles request and notice simulation without crashing", async () => {
  await withHarness({ plugins: ["group"], protocol: "milky" }, async harness => {
    const requestRes = await harness.emitEvent({
      event: "request.group.add",
      group_id: 123,
      user_id: 10001,
      flag: "group-flag",
      comment: "hello",
    })
    assert.equal(requestRes.ok, true)

    const noticeRes = await harness.emitEvent({
      event: "notice.group.decrease",
      group_id: 123,
      user_id: 10001,
      operator_id: 10002,
    })
    assert.equal(noticeRes.ok, true)
  })
})

test("group recall notice notifies masters after enabling the switch", async () => {
  const groupId = 987654321

  for (const protocol of ["milky", "onebotv11", "icqq"]) {
    await withHarness({ plugins: ["group"], protocol }, async harness => {
      const toggleRes = await harness.emitMessage({
        scene: "group",
        text: "#荨鹿通知设置群撤回开启",
        group_id: groupId,
        user_id: masterId,
      })
      assert.equal(toggleRes.ok, true)

      harness.resetCaptures()

      const recallRes = await harness.emitEvent({
        event: "notice.group.recall",
        group_id: groupId,
        user_id: 10001,
        operator_id: 10002,
      })
      assert.equal(recallRes.ok, true)
      assert.ok(recallRes.replies.length >= 1)
    })
  }
})

test("group recall forward builder expands raw node messages instead of degrading to [转发消息]", async () => {
  const msgList = await groupHandlersTest.buildNoticeForwardMsgList(
    { protocol: "onebotv11" },
    {
      sender: { userId: 10001, name: "发送者" },
      message: {
        message: [
          {
            type: "node",
            data: {
              uin: 20002,
              name: "原转发用户",
              content: [{ type: "text", data: { text: "这是一条转发里的正文" } }],
            },
          },
        ],
        universal_message: [{ type: "text", data: { content: "[转发消息]" } }],
      },
      time: 1710000000,
    },
  )

  assert.equal(msgList.length, 1)
  assert.equal(msgList[0].nickname, "原转发用户")
  assert.match(renderSegmentsText(msgList[0].content), /这是一条转发里的正文/)
  assert.doesNotMatch(renderSegmentsText(msgList[0].content), /\[转发消息\]/)
})

test("group recall forward builder prefers raw embedded forward messages over degraded universal message", async () => {
  const msgList = await groupHandlersTest.buildNoticeForwardMsgList(
    { protocol: "onebotv11" },
    {
      sender: { userId: 10001, name: "发送者" },
      message: {
        message: [
          {
            type: "forward",
            data: {
              id: "forward-1",
              summary: "[聊天记录]",
              messages: [
                {
                  type: "node",
                  data: {
                    uin: 30003,
                    name: "节点用户",
                    content: [{ type: "text", data: { text: "展开后的转发内容" } }],
                  },
                },
              ],
            },
          },
        ],
        universal_message: [{ type: "text", data: { content: "[转发消息]" } }],
      },
      time: 1710000000,
    },
  )

  assert.equal(msgList.length, 1)
  assert.equal(msgList[0].nickname, "节点用户")
  assert.match(renderSegmentsText(msgList[0].content), /展开后的转发内容/)
  assert.doesNotMatch(renderSegmentsText(msgList[0].content), /\[转发消息\]/)
})

test("group forward relay normalizes missing sender ids to a valid fallback for milky private resend", () => {
  const nodes = groupHandlersTest.normalizeForwardApiMessages(
    [
      {
        user_id: "",
        sender_name: "纳西妲",
        message: [{ type: "text", data: { text: "测试转发" } }],
      },
      {
        sender_id: null,
        nickname: "纳西妲",
        message: [{ type: "text", data: { text: "测试图片" } }],
      },
    ],
    { fallbackUserId: 3239716086 },
  )

  assert.equal(nodes.length, 2)
  assert.equal(nodes[0]?.user_id, 3239716086)
  assert.equal(nodes[1]?.user_id, 3239716086)
})

test("group recall forward relay fetches forward detail by id and sends private forward to master", async () => {
  const sent = []
  const apiCalls = []
  const previousBot = globalThis.Bot

  globalThis.Bot = {
    async callApi(action, params) {
      apiCalls.push({ action, params })
      if (action === "get_forward_msg") {
        return {
          messages: [
            {
              type: "node",
              data: {
                uin: 40004,
                name: "转发原作者",
                content: [{ type: "text", data: { text: "通过 API 拉到的转发正文" } }],
              },
            },
          ],
        }
      }
      throw new Error(`unexpected api action: ${action}`)
    },
    async makePrivateForwardMsg(messages, user_id) {
      return { type: "forward-relay", user_id, messages }
    },
  }

  try {
    const relay = groupHandlersTest.buildNoticeForwardRelayPayload(
      { protocol: "onebotv11", group_id: 123456 },
      {
        title: "[荨鹿通知][群撤回消息]",
        message: {
          message: [
            {
              type: "forward",
              data: {
                id: "forward-id-123",
                summary: "[聊天记录]",
              },
            },
          ],
          universal_message: [{ type: "text", data: { content: "[转发消息]" } }],
        },
      },
    )

    assert.equal(groupHandlersTest.isNoticeForwardRelayPayload(relay), true)

    await groupHandlersTest.sendMasterPayload(
      {
        protocol: "onebotv11",
        group_id: 123456,
        async sendMessage(target, message) {
          sent.push({ target, message })
          return { ok: true }
        },
      },
      masterId,
      relay,
    )

    assert.equal(apiCalls.length, 1)
    assert.equal(apiCalls[0].action, "get_forward_msg")
    assert.deepEqual(apiCalls[0].params, { message_id: "forward-id-123" })
    assert.equal(sent.length, 1)
    assert.equal(sent[0].target, String(masterId))
    assert.equal(sent[0].message?.type, "forward-relay")
    assert.equal(sent[0].message?.user_id, masterId)
    assert.equal(sent[0].message?.messages?.length, 1)
    assert.match(renderSegmentsText(sent[0].message?.messages?.[0]?.content), /通过 API 拉到的转发正文/)
  } finally {
    globalThis.Bot = previousBot
  }
})

test("group recall lookup bypasses degraded milky cache and refetches raw forward message from api", async () => {
  const previousBot = globalThis.Bot
  const originalGetMessageById = MessageDB.getMessageById.bind(MessageDB)
  const apiCalls = []

  MessageDB.getMessageById = async () => ({
    message_id: "7188",
    raw_message: "[forward]",
    message: [{ type: "text", data: { content: "[forward]" } }],
  })

  globalThis.Bot = {
    async callApi(action, params) {
      apiCalls.push({ action, params })
      if (action === "get_message") {
        return {
          message: {
            message_seq: 7188,
            peer_id: 1061170515,
            message_scene: "group",
            raw_message: "[forward]",
            segments: [
              {
                type: "forward",
                data: {
                  forward_id: "milky-forward-1",
                  summary: "[聊天记录]",
                },
              },
            ],
          },
        }
      }
      throw new Error(`unexpected api action: ${action}`)
    },
  }

  try {
    const recalled = await groupHandlersTest.getRecalledMessageSafe({
      protocol: "milky",
      group_id: 1061170515,
      user_id: 3239716086,
      message_id: 7188,
      message_seq: 7188,
      seq: 7188,
    })

    assert.equal(apiCalls.length, 1)
    assert.equal(apiCalls[0].action, "get_message")
    assert.deepEqual(apiCalls[0].params, {
      message_scene: "group",
      peer_id: 1061170515,
      message_seq: 7188,
    })
    assert.equal(groupHandlersTest.isDegradedForwardPlaceholderRecord(recalled), false)

    const relay = groupHandlersTest.buildNoticeForwardRelayPayload(
      { protocol: "milky", group_id: 1061170515 },
      {
        title: "[荨鹿通知][群撤回消息]",
        message: recalled,
      },
    )

    assert.equal(groupHandlersTest.isNoticeForwardRelayPayload(relay), true)
    assert.equal(relay.forward_id, "milky-forward-1")
  } finally {
    MessageDB.getMessageById = originalGetMessageById
    globalThis.Bot = previousBot
  }
})

test("other plugin smoke covers forward, recall, and scheduled task", async () => {
  for (const protocol of ["milky", "onebotv11", "icqq"]) {
    await withHarness({ plugins: ["other", pixivFixture], protocol }, async harness => {
      const forwardRes = await harness.emitMessage({
        scene: "group",
        text: OTHER_FORWARD_COMMAND,
        group_id: 123,
        user_id: masterId,
      })
      assert.equal(forwardRes.ok, true)
      assert.ok(forwardRes.apiCalls.length >= 1 || forwardRes.replies.length >= 1)

      harness.resetCaptures()

      const recallRes = await harness.emitMessage({
        scene: "group",
        text: OTHER_RECALL_COMMAND,
        group_id: 123,
        user_id: masterId,
      })
      assert.equal(recallRes.ok, true)
      assert.ok(recallRes.apiCalls.some(call => /send/i.test(String(call?.name || ""))))

      const flushRes = await harness.flushTimeouts()
      assert.equal(flushRes.ok, true)
      assert.ok(flushRes.apiCalls.some(call => /recall|delete_msg/i.test(String(call?.name || ""))))

      harness.resetCaptures()

      const taskRes = await harness.runTask({ index: 0, ctxLike: { group_id: 123, user_id: masterId } })
      assert.equal(taskRes.ok, true)
      assert.ok(taskRes.apiCalls.some(call => /send/i.test(String(call?.name || ""))))
    })
  }
})


