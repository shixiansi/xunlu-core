import assert from "node:assert/strict"
import test from "node:test"

import { createPluginTestHarness } from "../src/dev/plugin-test-harness.js"
import { setStatusCardTestHooks } from "../src/plugins/status-card/services/status-service.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

const shouldRun = Boolean(process.env.XUNLU_RUN_RENDER_TESTS)

installTestRuntime(test)

function createStaticSystemSnapshot() {
  return {
    cpu: {
      model: "Intel(R) Core(TM) i5-8600T CPU @ 2.30GHz",
      usagePercent: 12.53,
      speedGHz: 2.31,
      cores: 6,
      threads: 12,
    },
    memory: {
      used: 4.08 * 1024 * 1024 * 1024,
      total: 7.76 * 1024 * 1024 * 1024,
      usagePercent: 52.58,
    },
    network: {
      enabled: true,
      supported: true,
      name: "Ethernet",
      ip: "192.168.1.8",
      sampleMs: 1000,
      downloadBps: 18.55 * 1024,
      uploadBps: 8.52 * 1024,
    },
    disk: {
      path: "C:\\",
      mount: "C:\\",
      used: 69.93 * 1024 * 1024 * 1024,
      total: 93.65 * 1024 * 1024 * 1024,
      usagePercent: 74.67,
    },
    system: {
      platform: "win32",
      distro: "Windows 11 Pro",
      release: "23H2",
      arch: "x64",
      hostname: "status-lab",
    },
    gpu: {
      summary: "Intel UHD Graphics 630",
    },
  }
}

test(
  "real render smoke",
  { skip: !shouldRun },
  async () => {
    const harness = await createPluginTestHarness({
      plugins: ["help"],
      protocol: "milky",
      renderMode: "real",
    })
    try {
      const res = await harness.emitMessage({
        scene: "group",
        text: "帮助",
        group_id: 123,
        user_id: 1765629830,
      })
      assert.equal(res.ok, true)
      assert.ok(res.replies.length >= 1)
    } finally {
      await harness.dispose()
    }
  },
)

test(
  "real render smoke status-card",
  { skip: !shouldRun },
  async () => {
    setStatusCardTestHooks({
      systemSnapshot: createStaticSystemSnapshot(),
      now: new Date(2026, 3, 10, 12, 30, 45),
    })

    const harness = await createPluginTestHarness({
      plugins: ["status-card"],
      protocol: "milky",
      renderMode: "real",
    })

    try {
      const res = await harness.emitMessage({
        scene: "group",
        text: "系统状态",
        group_id: 123,
        user_id: 1765629830,
      })
      assert.equal(res.ok, true)
      assert.ok(res.replies.length >= 1)
    } finally {
      setStatusCardTestHooks(null)
      await harness.dispose()
    }
  },
)
