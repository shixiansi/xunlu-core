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

  assert.equal(proxyBot[String(2548285036)], adapter)
  assert.equal(proxyBot[String(2548285036)].pickGroup(629661253).kind, "adapter-group")
  assert.equal(proxyBot.pickGroup({ group_id: 629661253 }).kind, "adapter-group")
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

  const group = rawBot.pickGroup({ group_id: 629661253 })
  const member = rawBot.pickMember({ group_id: 629661253 }, { user_id: 1765629830 })

  assert.equal(group.kind, "adapter-group")
  assert.equal(group.groupId, 629661253)
  assert.equal(member.kind, "adapter-member")
  assert.equal(member.userId, 1765629830)
})
