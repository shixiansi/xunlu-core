import assert from "node:assert/strict"
import test from "node:test"

import { getPluginApiServer } from "../src/lib/server.js"
import { createRuntimeKernel } from "../src/runtime/runtime-kernel.js"
import { resolveRuntimeMode } from "../src/runtime/mode-resolver.js"
import RuntimeKernel from "../src/runtime/runtime-kernel.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

test("api-only runtime kernel really starts api service with loaded plugins", async () => {
  const kernel = await createRuntimeKernel({
    mode: "api-only",
    apiService: {
      host: "127.0.0.1",
      port: 0,
    },
  })

  try {
    await kernel.start()

    assert.equal(kernel.mode, "api-only")
    assert.equal(kernel.getRuntimeBot(), null)
    assert.equal(kernel.getBotCore(), null)
    assert.ok(kernel.getLoadedPlugins().length > 0)

    const status = kernel.getStatus()
    assert.equal(status.mode, "api-only")
    assert.deepEqual(status.services, ["api"])
    assert.ok(status.pluginCount > 0)

    const reloaded = await kernel.reloadPlugins({ cacheBust: true })
    assert.ok(Array.isArray(reloaded))
    assert.ok(reloaded.length > 0)
    assert.ok(kernel.getLoadedPlugins().length > 0)

    const api = getPluginApiServer()
    assert.ok(api?.server)
    const address = api.server.address()
    const port = Number(address?.port || 0)
    assert.ok(port > 0)

    const healthRes = await fetch(`http://127.0.0.1:${port}/health`)
    assert.equal(healthRes.status, 200)
    const healthJson = await healthRes.json()
    assert.equal(healthJson.status, "ok")

    const eventRes = await fetch(`http://127.0.0.1:${port}/bot/event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "smoke", id: 1 }),
    })
    assert.equal(eventRes.status, 200)
    const eventJson = await eventRes.json()
    assert.equal(eventJson.ok, true)
  } finally {
    await kernel.stop()
  }
})

test("standalone icqq runtime kernel fails fast with unsupported mode", async () => {
  const mode = await resolveRuntimeMode({
    env: { CurEnv: "xunlu-core" },
    botConfig: { adapter: "icqq" },
    globalBot: null,
  })
  assert.equal(mode.mode, "standalone-icqq-unsupported")

  const kernel = await createRuntimeKernel({ modeState: mode })
  await assert.rejects(async () => await kernel.start(), /icqq only works in yunzai plugin mode or takeover mode/i)
})

test("runtime kernel start/stop order stays stable for fake milky and onebot drivers", async () => {
  for (const [mode, adapter] of [
    ["standalone-milky", "milky"],
    ["standalone-onebotv11", "onebotv11"],
  ]) {
    const calls = []
    const kernel = new RuntimeKernel({
      modeState: {
        mode,
        adapter,
      },
    })

    kernel.createDriver = async () => ({
      async start() {
        calls.push(`driver:start:${adapter}`)
      },
      getRuntimeBot() {
        return { uin: 10000, nickname: `fake-${adapter}` }
      },
      getBotCore() {
        return null
      },
      getLoadedPlugins() {
        return []
      },
      getStatus() {
        return { protocol: adapter, adapterType: adapter }
      },
      async reloadPlugins() {
        return []
      },
      async stop() {
        calls.push(`driver:stop:${adapter}`)
      },
    })

    kernel.registerDefaultServices = function registerSpyServices() {
      this.services.register("control", {
        async start() {
          calls.push(`service:start:control:${adapter}`)
        },
        async stop() {
          calls.push(`service:stop:control:${adapter}`)
        },
      })
      this.services.register("webui", {
        async start() {
          calls.push(`service:start:webui:${adapter}`)
        },
        async stop() {
          calls.push(`service:stop:webui:${adapter}`)
        },
      })
    }

    await kernel.start()
    await kernel.stop()

    assert.deepEqual(calls, [
      `driver:start:${adapter}`,
      `service:start:control:${adapter}`,
      `service:start:webui:${adapter}`,
      `service:stop:webui:${adapter}`,
      `service:stop:control:${adapter}`,
      `driver:stop:${adapter}`,
    ])
  }
})
