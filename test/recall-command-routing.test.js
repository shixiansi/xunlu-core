import assert from "node:assert/strict"
import test from "node:test"

import { register as registerOther } from "../src/plugins/other/controllers/handlers.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

function collectHandlers(registerFn) {
  const commands = []
  registerFn({
    registerCommand(command, handler) {
      commands.push({ command, handler })
    },
    callFnc() {
      return Promise.resolve(true)
    },
  })
  return commands
}

test("other plugin yields plain master 撤回 to later handlers", async () => {
  const commands = collectHandlers(registerOther)
  const handler = commands.find(
    item =>
      Array.isArray(item.command) &&
      item.command[0] === "^(引用撤回|#?撤回)$",
  )?.handler

  assert.ok(handler)

  let touchedReplyLookup = false
  const result = await handler({
    isMaster: true,
    raw_message: "#撤回",
    msg: "撤回",
    getReplyMessage: async () => {
      touchedReplyLookup = true
      return null
    },
  })

  assert.equal(result, false)
  assert.equal(touchedReplyLookup, false)
})

test("other plugin also yields master 撤回 when raw_message still contains reply and at cq codes", async () => {
  const commands = collectHandlers(registerOther)
  const handler = commands.find(
    item =>
      Array.isArray(item.command) &&
      item.command[0] === "^(引用撤回|#?撤回)$",
  )?.handler

  assert.ok(handler)

  let touchedReplyLookup = false
  const result = await handler({
    isMaster: true,
    raw_message: "[CQ:reply,id=1738847808][CQ:at,qq=3239716086,name=纳西妲] 撤回",
    msg: "撤回",
    getReplyMessage: async () => {
      touchedReplyLookup = true
      return null
    },
  })

  assert.equal(result, false)
  assert.equal(touchedReplyLookup, false)
})

test("other plugin still handles explicit 引用撤回", async () => {
  const commands = collectHandlers(registerOther)
  const handler = commands.find(
    item =>
      Array.isArray(item.command) &&
      item.command[0] === "^(引用撤回|#?撤回)$",
  )?.handler

  assert.ok(handler)

  const replies = []
  const result = await handler({
    isMaster: true,
    raw_message: "引用撤回",
    msg: "引用撤回",
    getReplyMessage: async () => null,
    reply: async message => {
      replies.push(message)
      return true
    },
  })

  assert.equal(result, true)
  assert.equal(replies[0], "请先回复需要撤回的消息，再发送：撤回 / 引用撤回")
})
