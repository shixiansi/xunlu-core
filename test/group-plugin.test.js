import assert from "node:assert/strict"
import test from "node:test"

import { createUniversalBotApi } from "../src/Bot/api/universal-bot-api.js"
import { UniversalMessage } from "../src/Bot/message/universal-message.js"
import MessageDB from "../src/db/MessageDB.js"
import { createProtocolMock } from "../src/dev/protocol-mock.js"
import cfg from "../src/lib/config.js"
import { __test as groupHandlersTest, register } from "../src/plugins/group/controllers/handlers.js"
import { sendMasterPayload } from "../src/plugins/group/controllers/notice-helpers.js"
import { setGroupNoticeConfig } from "../src/plugins/group/model/notice-store.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

function createRegisteredCommands() {
  const commands = []
  register({
    registerCommand(command, handler) {
      commands.push({ command, handler })
    },
    onMount() {},
    callFnc() {
      return Promise.resolve(true)
    },
  })
  return commands
}

function findCommand(commands, predicate) {
  const found = commands.find(predicate)
  assert.ok(found, "expected command to be registered")
  return found.handler
}

test("group recall notice handler sends master notification when enabled", async () => {
  cfg.setConfigValue("bot", "masterQQ", [10000])
  setGroupNoticeConfig(1061170515, { group_recall: true })

  const commands = createRegisteredCommands()
  const handler = findCommand(
    commands,
    item => Array.isArray(item.command) && item.command[1] === "notice.group.recall",
  )

  const sent = []
  const result = await handler({
    group_id: 1061170515,
    group_name: "摄批头子联合聚集地",
    user_id: 2641811890,
    operator_id: 1765629830,
    message_id: 466896583,
    time: 1777095517,
    protocol: "onebotv11",
    sender: { card: "测试成员" },
    sendMessage: async (target, message) => {
      sent.push({ target, message })
      return true
    },
    getUserInfo: async ({ user_id }) => ({
      nickname: `User-${user_id}`,
    }),
  })

  assert.equal(result, false)
  assert.ok(sent.length >= 1)
  assert.equal(sent[0]?.target, "10000")
})

test("today history command forwards stored messages instead of throwing", async () => {
  const previousBot = globalThis.Bot
  globalThis.Bot = {
    async getGroupChatHistory() {
      return [
        {
          user_id: 10001,
          time: 1710000000,
          message: [{ type: "text", data: { text: "hello history" } }],
        },
      ]
    },
  }

  try {
    const commands = createRegisteredCommands()
    const handler = findCommand(
      commands,
      item => Array.isArray(item.command) && String(item.command[0]).includes("今日发言记录"),
    )

    const replies = []
    const result = await handler({
      group_id: 123,
      user_id: 10001,
      at: "",
      makeGroupForwardMsgByUser: async (userId, msgList, title) => ({
        userId,
        msgList,
        title,
      }),
      reply: async message => {
        replies.push(message)
        return true
      },
    })

    assert.equal(result, undefined)
    assert.equal(replies.length, 1)
    assert.equal(replies[0]?.title, "今日发言记录")
    assert.equal(replies[0]?.msgList?.length, 1)
  } finally {
    globalThis.Bot = previousBot
  }
})

test("group join approval command requires admin or master", async () => {
  const commands = createRegisteredCommands()
  const handler = findCommand(
    commands,
    item => Array.isArray(item.command) && String(item.command[0]).includes("开门"),
  )

  const replies = []
  const result = await handler({
    group_id: 123,
    isAdmin: false,
    isOwner: false,
    isMaster: false,
    msg: "开门",
    getReplyMessage: async () => ({
      message: [{ type: "text", data: { content: "临时通行证ID:1234567890" } }],
    }),
    reply: async message => {
      replies.push(message)
      return true
    },
  })

  assert.equal(result, true)
  assert.equal(replies[0], "需要管理员权限")
})

test("onebot recall relay falls back to normal private messages when native forward is unavailable", async () => {
  const sent = []

  const ok = await sendMasterPayload(
    {
      protocol: "onebotv11",
      user_id: 3021392873,
      sendMessage: async (target, message) => {
        sent.push({ target, message })
        return true
      },
      callApi: async (action, params) => {
        assert.equal(action, "get_forward_msg")
        assert.deepEqual(params, { message_id: "forward-1" })
        return {
          messages: [
            {
              user_id: 3021392873,
              nickname: "音仔",
              time: 1777096878,
              message: [
                { type: "at", data: { qq: "2548285036" } },
                { type: "image", data: { file: "https://example.com/test.jpg" } },
                { type: "text", data: { text: " 测试图文" } },
              ],
            },
          ],
        }
      },
    },
    1765629830,
    {
      __xunlu_notice_forward_relay__: true,
      title: "[荨鹿通知][群撤回消息]",
      forward_id: "forward-1",
    },
  )

  assert.equal(ok, true)
  assert.equal(sent.length, 1)
  assert.equal(sent[0]?.target, "1765629830")
  assert.equal(sent[0]?.message?.[0]?.type, "text")
  assert.match(String(sent[0]?.message?.[0]?.data?.content || ""), /群撤回消息/)
  assert.equal(sent[0]?.message?.[1]?.type, "text")
  assert.match(String(sent[0]?.message?.[1]?.data?.content || ""), /@2548285036/)
  assert.equal(sent[0]?.message?.[2]?.type, "image")
})

test("onebot recalled message prefers api result when db only has basename media refs", async () => {
  const originalGetMessageById = MessageDB.getMessageById.bind(MessageDB)
  MessageDB.getMessageById = async () => ({
    message: [
      {
        type: "image",
        data: {
          file: "d49909aad05917b179067d4cf89044d9.jpg",
        },
      },
    ],
  })

  try {
    const result = await groupHandlersTest.getRecalledMessageSafe({
      protocol: "onebotv11",
      group_id: 1061170515,
      message_id: "1308650024",
      callApi: async (action, params) => {
        assert.equal(action, "get_msg")
        assert.deepEqual(params, { message_id: "1308650024" })
        return {
          message: [
            {
              type: "image",
              data: {
                file: "d49909aad05917b179067d4cf89044d9.jpg",
                url: "https://multimedia.nt.qq.com.cn/download?appid=1407&fileid=abc123",
              },
            },
          ],
        }
      },
    })

    assert.equal(
      result?.message?.[0]?.data?.url,
      "https://multimedia.nt.qq.com.cn/download?appid=1407&fileid=abc123",
    )
  } finally {
    MessageDB.getMessageById = originalGetMessageById
  }
})

test("onebot image conversion prefers remote url over basename cache file", () => {
  const segments = UniversalMessage.fromOnebotV11([
    {
      type: "image",
      data: {
        file: "d49909aad05917b179067d4cf89044d9.jpg",
        url: "https://multimedia.nt.qq.com.cn/download?appid=1407&fileid=abc123",
      },
    },
  ]).convertTo("onebotv11")

  assert.equal(
    segments[0]?.data?.file,
    "https://multimedia.nt.qq.com.cn/download?appid=1407&fileid=abc123",
  )
})

test("onebot private forward payload prefers native private forward through the real send pipeline", async () => {
  const previousBot = globalThis.Bot
  const runtime = createProtocolMock({ protocol: "onebotv11", selfId: 3239716086 })
  globalThis.Bot = runtime.bot

  try {
    const api = createUniversalBotApi()
    const ok = await sendMasterPayload(
      {
        protocol: "onebotv11",
        bot: runtime.bot,
        sendMessage: api.sendMessage,
      },
      1765629830,
      {
        __xunlu_notice_private_forward__: true,
        title: "转发详情",
        msg_list: [
          {
            user_id: 3021392873,
            nickname: "不知江月待何人",
            content: [
              {
                type: "image",
                data: {
                  file: "E2B6EAC88EF6531CB0B7DE0BC0BED6A2.jpg",
                  url: "https://multimedia.nt.qq.com.cn/download?appid=1407&fileid=img123",
                },
              },
            ],
          },
        ],
      },
    )

    assert.ok(ok)
    const sendCall = runtime.calls.find(call => call?.name === "send_private_forward_msg")
    assert.ok(sendCall)
    assert.equal(
      sendCall?.params?.messages?.[0]?.data?.content?.[0]?.data?.file,
      "https://multimedia.nt.qq.com.cn/download?appid=1407&fileid=img123",
    )
  } finally {
    globalThis.Bot = previousBot
  }
})

test("onebot private forward payload falls back to plain private messages when native forward send fails", async () => {
  const sent = []

  const ok = await sendMasterPayload(
    {
      protocol: "onebotv11",
      sendMessage: async (target, message) => {
        if (Array.isArray(message) && message[0]?.type === "node") {
          throw new Error("native private forward timeout")
        }
        sent.push({ target, message })
        return true
      },
    },
    1765629830,
    {
      __xunlu_notice_private_forward__: true,
      title: "转发详情",
      msg_list: [
        {
          user_id: 3021392873,
          nickname: "不知江月待何人",
          content: [
            {
              type: "image",
              data: {
                file: "E2B6EAC88EF6531CB0B7DE0BC0BED6A2.jpg",
                url: "https://multimedia.nt.qq.com.cn/download?appid=1407&fileid=img123",
              },
            },
            {
              type: "text",
              data: {
                text: "测试图文",
              },
            },
          ],
        },
      ],
    },
  )

  assert.equal(ok, true)
  assert.equal(sent.length, 1)
  assert.equal(sent[0]?.message?.[1]?.type, "image")
  assert.equal(
    sent[0]?.message?.[1]?.data?.file,
    "https://multimedia.nt.qq.com.cn/download?appid=1407&fileid=img123",
  )
  assert.equal(sent[0]?.message?.[2]?.type, "text")
})

test("recalled forward placeholder resolves by forward id and get_forward_msg", async () => {
  const originalGetMessageById = MessageDB.getMessageById.bind(MessageDB)
  const calls = []
  MessageDB.getMessageById = async () => ({
    message: [
      {
        type: "text",
        data: {
          text: "[聊天记录]",
        },
      },
    ],
  })

  try {
    const ctx = {
      protocol: "onebotv11",
      group_id: 1061170515,
      message_id: "9001",
      callApi: async (action, params) => {
        calls.push({ action, params })
        if (action === "get_msg") {
          return {
            raw_message: "[CQ:forward,id=forward-9001]",
            message: [
              {
                type: "text",
                data: {
                  text: "[聊天记录]",
                },
              },
            ],
          }
        }
        if (action === "get_forward_msg") {
          return {
            messages: [
              {
                type: "node",
                data: {
                  uin: "10001",
                  name: "Alice",
                  content: [{ type: "text", data: { text: "forward-body" } }],
                },
              },
            ],
          }
        }
        throw new Error(`unexpected action: ${action}`)
      },
    }

    const recalled = await groupHandlersTest.getRecalledMessageSafe(ctx)
    assert.equal(recalled?.forward_id, "forward-9001")
    assert.equal(recalled?.forward_messages?.length, 1)

    const msgList = await groupHandlersTest.buildNoticeForwardMsgList(ctx, {
      sender: { userId: 10001, name: "Alice" },
      message: recalled,
      time: 1777090000,
    })

    assert.equal(msgList.length, 1)
    assert.equal(msgList[0]?.content?.[0]?.type, "text")
    assert.equal(msgList[0]?.content?.[0]?.data?.text, "forward-body")
    assert.ok(calls.some(item => item.action === "get_msg"))
    assert.ok(calls.some(item => item.action === "get_forward_msg"))
  } finally {
    MessageDB.getMessageById = originalGetMessageById
  }
})

test("recalled forward placeholder prefers group getForwardMsg when available", async () => {
  const originalGetMessageById = MessageDB.getMessageById.bind(MessageDB)
  MessageDB.getMessageById = async () => ({
    message: [
      {
        type: "text",
        data: {
          text: "[聊天记录]",
        },
      },
    ],
  })

  try {
    const calls = []
    const ctx = {
      protocol: "onebotv11",
      group_id: 1061170515,
      message_id: "9002",
      group: {
        async getForwardMsg(forwardId) {
          calls.push({ kind: "group", forwardId })
          return [
            {
              type: "node",
              data: {
                uin: "10002",
                name: "Bob",
                content: [{ type: "text", data: { text: "forward-from-group-api" } }],
              },
            },
          ]
        },
      },
      callApi: async (action, params) => {
        if (action === "get_msg") {
          return {
            raw_message: "[CQ:forward,id=forward-9002]",
            message: [{ type: "text", data: { text: "[聊天记录]" } }],
          }
        }
        throw new Error(`unexpected action: ${action} ${JSON.stringify(params)}`)
      },
    }

    const recalled = await groupHandlersTest.getRecalledMessageSafe(ctx)
    assert.equal(recalled?.forward_id, "forward-9002")
    assert.equal(recalled?.forward_messages?.length, 1)

    const msgList = await groupHandlersTest.buildNoticeForwardMsgList(ctx, {
      sender: { userId: 10002, name: "Bob" },
      message: recalled,
      time: 1777090001,
    })

    assert.equal(msgList.length, 1)
    assert.equal(msgList[0]?.content?.[0]?.type, "text")
    assert.equal(msgList[0]?.content?.[0]?.data?.text, "forward-from-group-api")
    assert.deepEqual(calls, [{ kind: "group", forwardId: "forward-9002" }])
  } finally {
    MessageDB.getMessageById = originalGetMessageById
  }
})
