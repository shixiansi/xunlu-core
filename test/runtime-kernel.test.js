import assert from "node:assert/strict"
import test from "node:test"

import { createBotFacade } from "../src/runtime/bot-facade-factory.js"
import { resolveRuntimeMode } from "../src/runtime/mode-resolver.js"
import RuntimeKernel from "../src/runtime/runtime-kernel.js"
import ServiceRegistry from "../src/runtime/service-registry.js"
import ApiOnlyDriver from "../src/runtime/drivers/api-only-driver.js"
import UnsupportedStandaloneIcqqDriver from "../src/runtime/drivers/unsupported-standalone-icqq-driver.js"
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

test("resolveRuntimeMode respects explicit yunzai icqq adapter even when login is skipped", async () => {
  const mode = await resolveRuntimeMode({
    env: { CurEnv: "QQBot-YunZai" },
    botConfig: { adapter: "icqq" },
    yunzaiConfig: { skip_login: true, ignore_self: true },
    globalBot: {
      isOnline() {
        return false
      },
    },
  })

  assert.equal(mode.mode, "yunzai-icqq")
  assert.equal(mode.adapter, "icqq")
})

test("resolveRuntimeMode respects explicit yunzai onebot adapter even when bot is online", async () => {
  const mode = await resolveRuntimeMode({
    env: { CurEnv: "QQBot-YunZai" },
    botConfig: { adapter: "onebotv11" },
    yunzaiConfig: { skip_login: false, ignore_self: true },
    globalBot: {
      isOnline() {
        return true
      },
    },
  })

  assert.equal(mode.mode, "yunzai-takeover")
  assert.equal(mode.adapter, "onebotv11")
})

test("resolveRuntimeMode marks standalone icqq as unsupported when no global bot exists", async () => {
  const mode = await resolveRuntimeMode({
    env: { CurEnv: "xunlu-core" },
    botConfig: { adapter: "icqq" },
    globalBot: null,
  })

  assert.equal(mode.mode, "standalone-icqq-unsupported")
  assert.equal(mode.adapter, "icqq")
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

test("ApiOnlyDriver loads plugin definitions and supports reload without Bot Core", async () => {
  const driver = new ApiOnlyDriver()
  await driver.start({})

  try {
    assert.equal(driver.getRuntimeBot(), null)
    assert.equal(driver.getBotCore(), null)
    assert.ok(driver.getLoadedPlugins().length > 0)

    const status = driver.getStatus()
    assert.equal(status.protocol, "api-only")
    assert.ok(status.pluginCount > 0)

    const reloaded = await driver.reloadPlugins({ cacheBust: true })
    assert.ok(Array.isArray(reloaded))
    assert.ok(reloaded.length > 0)
  } finally {
    await driver.stop()
  }
})

test("UnsupportedStandaloneIcqqDriver fails fast with a clear standalone guidance", async () => {
  const driver = new UnsupportedStandaloneIcqqDriver()

  await assert.rejects(
    async () => await driver.start(),
    /icqq only works in yunzai plugin mode or takeover mode/i,
  )

  const status = driver.getStatus()
  assert.equal(status.supported, false)
  assert.match(String(status.message || ""), /milky \/ onebotv11 \/ auto/i)
})

test("RuntimeKernel registers only api service in api-only mode", () => {
  const kernel = new RuntimeKernel({
    modeState: {
      mode: "api-only",
      adapter: "api-only",
    },
  })

  kernel.registerDefaultServices()
  assert.deepEqual(kernel.services.list(), ["api"])
})

test("RuntimeKernel rolls back started services and driver when startup fails", async () => {
  const calls = []
  const hadBot = Object.prototype.hasOwnProperty.call(globalThis, "Bot")
  const originalBot = globalThis.Bot
  const hadRuntimeBot = Object.prototype.hasOwnProperty.call(globalThis, "__xunlu_runtime_bot")
  const originalRuntimeBot = globalThis.__xunlu_runtime_bot
  const previousBot = { uin: 90000, nickname: "previous-bot" }
  const previousRuntimeBot = { uin: 90001, nickname: "previous-runtime-bot" }
  const runtimeBot = { uin: 10000, nickname: "runtime-bot" }

  try {
    globalThis.Bot = previousBot
    globalThis.__xunlu_runtime_bot = previousRuntimeBot

    const fakeDriver = {
      async start() {
        calls.push("driver:start")
      },
      async stop() {
        calls.push("driver:stop")
      },
      getRuntimeBot() {
        return runtimeBot
      },
      getBotCore() {
        return {}
      },
    }

    const kernel = new RuntimeKernel({
      modeState: {
        mode: "standalone-milky",
        adapter: "milky",
      },
      context: {
        ensureRuntimeLayout() {
          calls.push("layout")
        },
      },
      async loadRuntimeEnvironment() {
        calls.push("environment")
      },
    })

    kernel.createDriver = async () => fakeDriver
    kernel.registerDefaultServices = () => {
      kernel.services.register("ok", {
        async start() {
          calls.push("service:start:ok")
        },
        async stop() {
          calls.push("service:stop:ok")
        },
      })
      kernel.services.register("bad", {
        async start() {
          calls.push("service:start:bad")
          throw new Error("service failed")
        },
        async stop() {
          calls.push("service:stop:bad")
        },
      })
    }

    await assert.rejects(() => kernel.start(), /service failed/)

    assert.equal(kernel.started, false)
    assert.equal(kernel.driver, null)
    assert.equal(kernel.facade, null)
    assert.equal(globalThis.Bot, previousBot)
    assert.equal(globalThis.__xunlu_runtime_bot, previousRuntimeBot)
    assert.deepEqual(calls, [
      "layout",
      "environment",
      "driver:start",
      "service:start:ok",
      "service:start:bad",
      "service:stop:ok",
      "driver:stop",
    ])
  } finally {
    if (hadBot) globalThis.Bot = originalBot
    else delete globalThis.Bot
    if (hadRuntimeBot) globalThis.__xunlu_runtime_bot = originalRuntimeBot
    else delete globalThis.__xunlu_runtime_bot
  }
})
