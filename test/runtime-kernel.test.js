import assert from "node:assert/strict"
import test from "node:test"

import { createBotFacade } from "../src/runtime/bot-facade-factory.js"
import { resolveRuntimeMode } from "../src/runtime/mode-resolver.js"
import RuntimeKernel from "../src/runtime/runtime-kernel.js"
import ServiceRegistry from "../src/runtime/service-registry.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

test("resolveRuntimeMode prefers yunzai icqq when bot is online", async () => {
  const mode = await resolveRuntimeMode({
    env: { CurEnv: "QQBot-YunZai" },
    botConfig: { adapter: "auto" },
    globalBot: {
      isOnline() {
        return true
      },
    },
  })

  assert.equal(mode.mode, "yunzai-icqq")
  assert.equal(mode.adapter, "icqq")
})

test("resolveRuntimeMode falls back to takeover when yunzai bot is offline", async () => {
  const mode = await resolveRuntimeMode({
    env: { CurEnv: "QQBot-YunZai" },
    botConfig: { adapter: "onebotv11" },
    yunzaiConfig: { skip_login: true, ignore_self: true },
    globalBot: {
      isOnline() {
        return false
      },
    },
  })

  assert.equal(mode.mode, "yunzai-takeover")
  assert.equal(mode.adapter, "onebotv11")
})

test("ServiceRegistry starts in registration order and stops in reverse order", async () => {
  const calls = []
  const registry = new ServiceRegistry()

  registry.register("a", {
    async start() {
      calls.push("start:a")
    },
    async stop() {
      calls.push("stop:a")
    },
  })
  registry.register("b", {
    async start() {
      calls.push("start:b")
    },
    async stop() {
      calls.push("stop:b")
    },
  })

  await registry.startAll({})
  await registry.stopAll()

  assert.deepEqual(calls, ["start:a", "start:b", "stop:b", "stop:a"])
})

test("createBotFacade keeps runtime bot and bot core aligned", () => {
  const previousBot = globalThis.Bot
  const runtimeBot = { uin: 10000, nickname: "runtime-bot" }
  const botCore = { name: "bot-core" }
  const driver = {
    getRuntimeBot() {
      return runtimeBot
    },
    getBotCore() {
      return botCore
    },
  }

  try {
    const facade = createBotFacade({ driver })
    assert.equal(facade.runtimeBot, runtimeBot)
    assert.equal(facade.botCore, botCore)
    assert.equal(globalThis.Bot, runtimeBot)
  } finally {
    globalThis.Bot = previousBot
  }
})

test("RuntimeKernel delegates status and reload to driver without replacing facade bot", async () => {
  const previousBot = globalThis.Bot
  const runtimeBot = { uin: 10000, nickname: "kernel-bot" }
  const fakeDriver = {
    async reloadPlugins() {
      return ["plugin-a"]
    },
    getRuntimeBot() {
      return runtimeBot
    },
    getBotCore() {
      return {
        pluginCatalog: {
          "plugin-a": { name: "plugin-a", title: "Plugin A" },
        },
      }
    },
    getLoadedPlugins() {
      return [{ name: "plugin-a", title: "Plugin A" }]
    },
    getStatus() {
      return { protocol: "milky", adapterType: "Milky" }
    },
  }

  try {
    const kernel = new RuntimeKernel({
      modeState: {
        mode: "standalone-milky",
        adapter: "milky",
      },
    })
    kernel.driver = fakeDriver
    kernel.facade = createBotFacade({ driver: fakeDriver })
    kernel.services.register("fake", {
      health() {
        return { ok: true }
      },
    })
    kernel.services.started = ["fake"]
    kernel.started = true

    const reloaded = await kernel.reloadPlugins({ cacheBust: true })
    assert.deepEqual(reloaded, ["plugin-a"])
    assert.equal(kernel.getRuntimeBot(), runtimeBot)

    const status = kernel.getStatus()
    assert.equal(status.mode, "standalone-milky")
    assert.equal(status.driver.protocol, "milky")
    assert.equal(status.pluginCount, 1)
  } finally {
    globalThis.Bot = previousBot
  }
})
