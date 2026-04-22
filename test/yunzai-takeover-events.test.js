import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import test from "node:test"

import { startMilkyTakeoverBridge, startOnebotTakeoverBridge } from "../src/Bot/yunzai/events/index.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

function toInt(value) {
  if (value === undefined || value === null) return undefined
  const normalized = typeof value === "string" ? value.trim() : value
  if (normalized === "") return undefined
  const number = Number(normalized)
  return Number.isFinite(number) ? number : undefined
}

function createHelpers() {
  return {
    toInt,
    logError() {},
    logWarn() {},
  }
}

function createBotCapture() {
  const events = []
  return {
    events,
    emit(type, payload) {
      events.push({ type, payload })
    },
  }
}

function createTakeoverState(protocol, adapter) {
  return {
    adapter,
    protocol,
    ignoreSelf: true,
    selfId: 10000,
    _lastMessageId: undefined,
    _lastMessageSeq: undefined,
    sendToCalls: [],
    upsertMemberCalls: [],
    getGroup(group_id) {
      return { scope: "group", group_id }
    },
    getMember(group_id, user_id) {
      return { scope: "member", group_id, user_id }
    },
    getUser(user_id) {
      return { scope: "friend", user_id }
    },
    upsertMember(group_id, user_id, sender) {
      this.upsertMemberCalls.push({ group_id, user_id, sender })
    },
    async sendTo(payload) {
      this.sendToCalls.push(payload)
      return { ok: true, ...payload }
    },
  }
}

test("onebot takeover event bridge emits yunzai-shaped message, notice, and request", async () => {
  const adapter = new EventEmitter()
  const bot = createBotCapture()
  const state = createTakeoverState("onebotv11", adapter)

  startOnebotTakeoverBridge({ bot, state, helpers: createHelpers() })

  adapter.emit("message", {
    time: 1710000000,
    message_type: "group",
    group_id: 123,
    user_id: 10001,
    message_id: 42,
    raw_message: "hello",
    message: [{ type: "text", data: { text: "hello" } }],
    sender: { user_id: 10001, nickname: "Alice", role: "admin" },
  })

  assert.equal(bot.events[0]?.type, "message")
  assert.equal(bot.events[0]?.payload.message[0]?.text, "hello")
  assert.equal(bot.events[0]?.payload.group.group_id, 123)
  assert.equal(bot.events[0]?.payload.member.user_id, 10001)
  assert.equal(state.upsertMemberCalls.length, 1)

  await bot.events[0].payload.reply("pong", true)
  assert.deepEqual(state.sendToCalls.at(-1), {
    scene: "group",
    group_id: 123,
    user_id: 10001,
    message: "pong",
    quote: true,
    quoteRef: { msgId: "42" },
  })

  adapter.emit("notice", {
    time: 1710000001,
    notice_type: "group_recall",
    group_id: 123,
    user_id: 10001,
    operator_id: 10002,
    message_id: 77,
  })

  assert.equal(bot.events[1]?.type, "notice")
  assert.equal(bot.events[1]?.payload.sub_type, "recall")
  assert.equal(bot.events[1]?.payload.sender_id, 10001)
  assert.equal(bot.events[1]?.payload.operator_id, 10002)

  adapter.emit("request", {
    time: 1710000002,
    request_type: "group",
    sub_type: "add",
    group_id: 123,
    user_id: 10003,
    flag: "flag-1",
    comment: "please",
  })

  assert.equal(bot.events[2]?.type, "request")
  assert.equal(bot.events[2]?.payload.request_type, "group")
  assert.equal(bot.events[2]?.payload.group.group_id, 123)

  adapter.emit("message", {
    message_type: "private",
    user_id: 10000,
    message: [{ type: "text", data: { text: "self" } }],
  })

  assert.equal(bot.events.length, 3)
})

test("milky takeover event bridge emits yunzai-shaped message, notice, and request", async () => {
  const adapter = new EventEmitter()
  const bot = createBotCapture()
  const state = createTakeoverState("milky", adapter)

  startMilkyTakeoverBridge({ bot, state, helpers: createHelpers() })

  adapter.emit("message_receive", {
    data: {
      time: 1710000100,
      message_scene: "group",
      peer_id: 456,
      sender_id: 10011,
      message_seq: 88,
      segments: [{ type: "text", data: { text: "milky hello" } }],
      group_member: { nickname: "Bob", card: "B", role: "admin" },
    },
  })

  assert.equal(bot.events[0]?.type, "message")
  assert.equal(bot.events[0]?.payload.message[0]?.text, "milky hello")
  assert.equal(bot.events[0]?.payload.group.group_id, 456)
  assert.equal(bot.events[0]?.payload.sender.card, "B")
  assert.equal(state.upsertMemberCalls.length, 1)

  await bot.events[0].payload.reply("pong", true)
  assert.deepEqual(state.sendToCalls.at(-1), {
    scene: "group",
    group_id: 456,
    user_id: 10011,
    message: "pong",
    quote: true,
    quoteRef: { seq: 88 },
  })

  adapter.emit("message_recall", {
    data: {
      time: 1710000101,
      message_scene: "group",
      peer_id: 456,
      sender_id: 10011,
      operator_id: 10012,
      message_seq: 88,
    },
  })

  assert.equal(bot.events[1]?.type, "notice")
  assert.equal(bot.events[1]?.payload.sub_type, "recall")
  assert.equal(bot.events[1]?.payload.message_id, 88)

  adapter.emit("group_invited_join_request", {
    data: {
      time: 1710000102,
      peer_id: 456,
      initiator_id: 10013,
      notification_seq: 9,
      comment: "invite me",
    },
  })

  assert.equal(bot.events[2]?.type, "request")
  assert.equal(bot.events[2]?.payload.sub_type, "invite")
  assert.equal(bot.events[2]?.payload.flag, 9)
  assert.equal(bot.events[2]?.payload.group.group_id, 456)

  adapter.emit("friend_request", {
    data: {
      initiator_id: 10000,
      notification_seq: 10,
    },
  })

  assert.equal(bot.events.length, 3)
})
