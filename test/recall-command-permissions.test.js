import assert from "node:assert/strict"
import test from "node:test"

import { register as registerGroup } from "../src/plugins/group/controllers/handlers.js"
import { register as registerOther } from "../src/plugins/other/controllers/handlers.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

function collectHandlers(registerFn) {
  const commands = []
  registerFn({
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

function findHandler(commands, pattern) {
  const found = commands.find(
    item => Array.isArray(item.command) && item.command[0] === pattern,
  )?.handler
  assert.ok(found, `expected handler for ${pattern}`)
  return found
}

test("group plain 撤回 lets non-master recall bot message without success reply", async () => {
  const handler = findHandler(collectHandlers(registerGroup), "^(|#)撤回$")
  const replies = []
  const recalls = []

  const result = await handler({
    isMaster: false,
    self_id: 3239716086,
    group_id: 1061170515,
    getReplyMessage: async () => ({
      user_id: 3239716086,
      message_id: "1883175180",
      message_seq: 12441,
    }),
    recallMessage: async payload => {
      recalls.push(payload)
      return { ok: true }
    },
    reply: async message => {
      replies.push(message)
      return true
    },
  })

  assert.equal(result, true)
  assert.equal(replies.length, 0)
  assert.deepEqual(recalls, [
    {
      peer_id: 1061170515,
      message_id: "1883175180",
      message_seq: 12441,
      isGroup: true,
    },
  ])
})

test("group plain 撤回 blocks non-master from recalling other user messages", async () => {
  const handler = findHandler(collectHandlers(registerGroup), "^(|#)撤回$")
  const replies = []

  const result = await handler({
    isMaster: false,
    self_id: 3239716086,
    group_id: 1061170515,
    getReplyMessage: async () => ({
      user_id: 1765629830,
      message_id: "1883175180",
      message_seq: 12441,
    }),
    recallMessage: async () => {
      throw new Error("should not recall")
    },
    reply: async message => {
      replies.push(message)
      return true
    },
  })

  assert.equal(result, true)
  assert.equal(replies[0], "只能撤回 bot 自己发的消息（请回复 bot 发出的那条）")
})

test("group plain 撤回 lets master recall other user messages when bot is admin", async () => {
  const handler = findHandler(collectHandlers(registerGroup), "^(|#)撤回$")
  const recalls = []

  const result = await handler({
    isMaster: true,
    self_id: 3239716086,
    group_id: 1061170515,
    isBotGroupAdmin: async () => true,
    getReplyMessage: async () => ({
      user_id: 1765629830,
      message_id: "1883175181",
      message_seq: 12442,
    }),
    recallMessage: async payload => {
      recalls.push(payload)
      return { ok: true }
    },
    reply: async message => message,
  })

  assert.equal(result, true)
  assert.equal(recalls.length, 1)
  assert.equal(recalls[0]?.message_id, "1883175181")
})

test("group plain 撤回 blocks master recalling others when bot lacks admin", async () => {
  const handler = findHandler(collectHandlers(registerGroup), "^(|#)撤回$")
  const replies = []

  const result = await handler({
    isMaster: true,
    self_id: 3239716086,
    group_id: 1061170515,
    isBotGroupAdmin: async () => false,
    getReplyMessage: async () => ({
      user_id: 1765629830,
      message_id: "1883175181",
      message_seq: 12442,
    }),
    recallMessage: async () => {
      throw new Error("should not recall")
    },
    reply: async message => {
      replies.push(message)
      return true
    },
  })

  assert.equal(result, true)
  assert.equal(replies[0], "Bot 需要管理员权限才能撤回其他人的消息")
})

test("other explicit 引用撤回 shares the same silent-success behavior", async () => {
  const handler = findHandler(collectHandlers(registerOther), "^(引用撤回|#?撤回)$")
  const replies = []
  const recalls = []

  const result = await handler({
    isMaster: false,
    self_id: 3239716086,
    group_id: 1061170515,
    msg: "引用撤回",
    raw_message: "引用撤回",
    getReplyMessage: async () => ({
      user_id: 3239716086,
      message_id: "1883175182",
      message_seq: 12443,
    }),
    recallMessage: async payload => {
      recalls.push(payload)
      return { ok: true }
    },
    reply: async message => {
      replies.push(message)
      return true
    },
  })

  assert.equal(result, true)
  assert.equal(replies.length, 0)
  assert.equal(recalls.length, 1)
})
