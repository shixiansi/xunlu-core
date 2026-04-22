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
})
