import assert from "node:assert/strict"
import test from "node:test"

import { __test as takeoverTest } from "../src/Bot/yunzai/takeover.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

test("patchYunzaiBot binds Bot[uin] to raw adapter instead of proxy itself", () => {
  const rawBot = {
    uin: 2548285036,
    nickname: "proxy-bot",
    adapter: {},
    fl: new Map(),
    gl: new Map(),
    pickGroup() {
      return { kind: "raw-bot-group" }
    },
    sendApi() {},
    isOnline() {
      return true
    },
  }

  const proxyBot = new Proxy(
    {},
    {
      get(target, prop, receiver) {
        if (prop in target) return target[prop]
        return Reflect.get(rawBot, prop, receiver)
      },
    },
  )

  const adapter = {
    pickGroup(groupId) {
      return { kind: "adapter-group", groupId }
    },
    callApi() {},
  }

  takeoverTest.patchYunzaiBot(
    proxyBot,
    {
      adapter,
      protocol: "milky",
      selfId: 2548285036,
      sendTo() {},
      recall() {},
    },
    {
      loginInfo: {
        uin: 2548285036,
        nickname: "real-bot",
      },
    },
  )

  const compatBot = takeoverTest.installTakeoverBotCompatProxy(proxyBot)
  assert.equal(compatBot.pickGroup({ group_id: 629661253 }).kind, "adapter-group")
})

test("patchYunzaiBot normalizes object arguments for Bot.pickGroup and Bot.pickMember", () => {
  const rawBot = {
    uin: 2548285036,
    adapter: {},
    fl: new Map(),
    gl: new Map(),
    sendApi() {},
    isOnline() {
      return true
    },
  }

  const adapter = {
    pickGroup(groupId) {
      return {
        kind: "adapter-group",
        groupId,
        pickMember(userId) {
          return {
            kind: "adapter-member",
            userId,
          }
        },
      }
    },
    callApi() {},
  }

  takeoverTest.patchYunzaiBot(
    rawBot,
    {
      adapter,
      protocol: "milky",
      selfId: 2548285036,
      sendTo() {},
      recall() {},
      getGroup() {
        return {
          kind: "state-group",
        }
      },
      getMember() {
        return {
          kind: "state-member",
        }
      },
    },
    {
      loginInfo: {
        uin: 2548285036,
      },
    },
  )
  const compatBot = takeoverTest.installTakeoverBotCompatProxy(rawBot)
  const group = compatBot.pickGroup({ group_id: 629661253 })
  const member = compatBot.pickMember({ group_id: 629661253 }, { user_id: 1765629830 })

  assert.ok(group)
  assert.equal(group.kind, "adapter-group")
  assert.equal(group.groupId, 629661253)
  assert.ok(member)
  assert.equal(member.kind, "adapter-member")
  assert.equal(member.userId, 1765629830)
})

test("takeover compat proxy intercepts global Bot.pickGroup before inner proxy implementation", () => {
  const rawTarget = {
    __xunlu_pickGroup_compat(groupInput) {
      return {
        kind: "compat-group",
        input: groupInput,
      }
    },
    __xunlu_pickMember_compat(groupInput, userInput) {
      return {
        kind: "compat-member",
        groupInput,
        userInput,
      }
    },
  }

  const innerProxy = new Proxy(rawTarget, {
    get(target, prop, receiver) {
      if (prop === "pickGroup" || prop === "pickMember") {
        throw new Error("inner proxy pickGroup/pickMember should not be touched")
      }
      return Reflect.get(target, prop, receiver)
    },
  })

  const outerProxy = takeoverTest.installTakeoverBotCompatProxy(innerProxy)
  const group = outerProxy.pickGroup({ group_id: 629661253 })
  const member = outerProxy.pickMember({ group_id: 629661253 }, { user_id: 1765629830 })

  assert.equal(group.kind, "compat-group")
  assert.deepEqual(group.input, { group_id: 629661253 })
  assert.equal(member.kind, "compat-member")
  assert.deepEqual(member.groupInput, { group_id: 629661253 })
  assert.deepEqual(member.userInput, { user_id: 1765629830 })
})
