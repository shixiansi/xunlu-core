import assert from "node:assert/strict"
import test from "node:test"

import cfg from "../src/lib/config.js"
import { register } from "../src/plugins/group/controllers/handlers.js"
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
      item => Array.isArray(item.command) && item.command[0] === "^今日发言记录$",
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
    item => Array.isArray(item.command) && item.command[0] === "(开门|关门)",
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
