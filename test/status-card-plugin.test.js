import assert from "node:assert/strict"
import test from "node:test"

import { createPluginTestHarness } from "../src/dev/plugin-test-harness.js"
import { handleStatusCardCommand } from "../src/plugins/status-card/controllers/handlers.js"
import { normalizeStatusCardConfig } from "../src/plugins/status-card/model/config.js"
import {
  collectSystemSnapshot,
  createStatusCardViewModel,
  prepareStatusCardRenderData,
  setStatusCardTestHooks,
} from "../src/plugins/status-card/services/status-service.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

test.afterEach(() => {
  setStatusCardTestHooks(null)
})

function createMockSystemInformation({
  platform = "linux",
  distro = platform === "win32" ? "Windows 11 Pro" : "Ubuntu",
  release = platform === "win32" ? "23H2" : "24.04",
  diskMount = platform === "win32" ? "C:" : "/",
  iface = platform === "win32" ? "Ethernet" : "eth0",
  gpu = "Intel UHD Graphics 630",
} = {}) {
  let statsCall = 0

  return {
    async currentLoad() {
      return { currentLoad: 12.53 }
    },
    async cpu() {
      return {
        brand: "Intel(R) Core(TM) i5-8600T CPU @ 2.30GHz",
        physicalCores: 6,
        cores: 12,
        speed: 2.3,
      }
    },
    async cpuCurrentSpeed() {
      return { avg: 2.31 }
    },
    async mem() {
      return {
        active: 4.08 * 1024 * 1024 * 1024,
        total: 7.76 * 1024 * 1024 * 1024,
      }
    },
    async fsSize() {
      return [
        {
          mount: diskMount,
          size: 93.65 * 1024 * 1024 * 1024,
          used: 69.93 * 1024 * 1024 * 1024,
        },
      ]
    },
    async osInfo() {
      return {
        platform,
        distro,
        release,
        arch: "x64",
        hostname: "status-lab",
      }
    },
    async graphics() {
      return {
        controllers: gpu ? [{ model: gpu }] : [],
      }
    },
    async networkInterfaces() {
      return iface
        ? [
            {
              iface,
              default: true,
              operstate: "up",
              internal: false,
              ip4: platform === "win32" ? "192.168.1.8" : "10.0.0.8",
            },
          ]
        : []
    },
    async networkStats() {
      statsCall += 1
      if (!iface) return []
      if (statsCall === 1) {
        return [{ iface, rx_bytes: 1000, tx_bytes: 2000 }]
      }
      return [{ iface, rx_bytes: 1000 + 25 * 1024, tx_bytes: 2000 + 12 * 1024 }]
    },
  }
}

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

test("status-card system snapshot supports linux metrics and network sampling", async () => {
  const config = normalizeStatusCardConfig({
    display: {
      disk_path: "/",
      net_sample_ms: 1000,
    },
  })

  const system = await collectSystemSnapshot(config, {
    siLib: createMockSystemInformation({ platform: "linux", diskMount: "/" }),
    wait: async () => {},
    platform: "linux",
  })

  assert.equal(system.system.distro, "Ubuntu")
  assert.equal(system.disk.mount, "/")
  assert.equal(system.network.downloadBps, 25 * 1024)
  assert.equal(system.network.uploadBps, 12 * 1024)
})

test("status-card view model formats windows data and placeholder gpu text", async () => {
  const config = normalizeStatusCardConfig({
    display: {
      disk_path: "D:\\apps\\xunlu",
      net_sample_ms: 1000,
    },
  })

  const system = await collectSystemSnapshot(config, {
    siLib: createMockSystemInformation({
      platform: "win32",
      diskMount: "D:",
      iface: "Ethernet",
      gpu: "",
    }),
    wait: async () => {},
    platform: "win32",
  })

  const viewModel = createStatusCardViewModel({
    system,
    runtime: {
      protocol: "onebotv11",
      adapterType: "OneBotV11",
      pluginCount: 21,
      commandCount: 83,
      friendCount: 6,
      groupCount: 26,
      loginInfo: {
        userId: "12345678",
        nickname: "亚托莉",
      },
      appVersion: "0.1.0",
    },
    config,
    now: new Date(2026, 3, 10, 12, 30, 45),
  })

  assert.match(viewModel.metrics.find(item => item.label === "CPU")?.value || "", /12\.53%/)
  assert.match(viewModel.metrics.find(item => item.label === "DISK")?.note || "", /D:/i)
  assert.equal(viewModel.metaRows.find(row => row.label === "GPU")?.value, "N/A")
  assert.equal(viewModel.badgeText, "OneBotV11")
  assert.equal(viewModel.heroBackground.isBuiltin, true)
  assert.match(viewModel.heroBackground.path || "", /bg\.jpg$/)
  assert.equal(viewModel.avatarImage.src, "https://q1.qlogo.cn/g?b=qq&nk=12345678&s=640")
})

test("status-card view model keeps remote background urls for rendering", () => {
  const viewModel = createStatusCardViewModel({
    system: createStaticSystemSnapshot(),
    runtime: {
      protocol: "milky",
      adapterType: "Milky",
      pluginCount: 5,
      commandCount: 12,
      friendCount: 2,
      groupCount: 3,
      loginInfo: {
        userId: "10001",
        nickname: "测试机",
      },
      appVersion: "0.1.0",
    },
    config: normalizeStatusCardConfig({
      theme: {
        background: "https://imgcloud.shipixiv.de5.net/random?type=img&dir=/pixiv",
      },
    }),
    now: new Date(2026, 3, 10, 12, 30, 45),
  })

  assert.equal(viewModel.heroBackground.isBuiltin, false)
  assert.equal(viewModel.heroBackground.src, "https://imgcloud.shipixiv.de5.net/random?type=img&dir=/pixiv")
})

test("status-card render preparation inlines remote backgrounds for puppeteer screenshots", async () => {
  const sourceUrl = "https://imgcloud.shipixiv.de5.net/random?type=img&dir=/pixiv"
  const pngBuffer = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9p6PvxQAAAAASUVORK5CYII=",
    "base64",
  )
  const viewModel = createStatusCardViewModel({
    system: createStaticSystemSnapshot(),
    runtime: {
      protocol: "milky",
      adapterType: "Milky",
      pluginCount: 5,
      commandCount: 12,
      friendCount: 2,
      groupCount: 3,
      loginInfo: {
        userId: "10001",
        nickname: "???",
      },
      appVersion: "0.1.0",
    },
    config: normalizeStatusCardConfig({
      theme: {
        background: sourceUrl,
      },
    }),
    now: new Date(2026, 3, 10, 12, 30, 45),
  })

  const prepared = await prepareStatusCardRenderData(viewModel, {
    fetch: async () => ({
      ok: true,
      headers: {
        get(name) {
          if (name === "content-type") return "image/png"
          if (name === "content-length") return String(pngBuffer.length)
          return null
        },
      },
      async arrayBuffer() {
        return pngBuffer
      },
    }),
  })

  assert.equal(viewModel.heroBackground.src, sourceUrl)
  assert.match(prepared.heroBackground.src || "", /^data:image\/png;base64,/)
})

test("status-card handler falls back to text when render fails and runtime lists are empty", async () => {
  const replies = []
  setStatusCardTestHooks({
    systemSnapshot: createStaticSystemSnapshot(),
    now: new Date(2026, 3, 10, 8, 9, 10),
  })

  const ctx = {
    protocol: "milky",
    adapterType: "Mock",
    listPlugins: () => [],
    listCommands: () => [],
    getFriendList: async () => new Map(),
    getGroupList: async () => new Map(),
    getLoginInfo: async () => ({ user_id: 10001, nickname: "测试机" }),
    renderImg: async () => false,
    reply: async message => {
      replies.push(message)
      return true
    },
  }

  const handled = await handleStatusCardCommand(ctx)
  assert.equal(handled, true)
  assert.equal(replies.length, 1)
  assert.equal(typeof replies[0], "string")
  assert.match(replies[0], /CPU:/)
  assert.match(replies[0], /Plugins: 0 loaded/)
  assert.match(replies[0], /Features: 0 commands/)
})

test("status-card plugin renders through harness on milky and onebotv11", async () => {
  const protocols = ["milky", "onebotv11"]

  for (const protocol of protocols) {
    setStatusCardTestHooks({
      systemSnapshot: createStaticSystemSnapshot(),
      now: new Date(2026, 3, 10, 12, 30, 45),
    })

    const harness = await createPluginTestHarness({
      plugins: ["status-card"],
      protocol,
    })

    try {
      const result = await harness.emitMessage({
        scene: "group",
        text: "系统状态",
        group_id: 123,
        user_id: 10001,
      })

      assert.equal(result.ok, true)
      assert.equal(result.renderCalls.length, 1)
      assert.equal(result.renderCalls[0]?.name, "status-card")
      assert.equal(result.renderCalls[0]?.data?.renderReadyTimeout, 15000)
      assert.match(String(result.renderCalls[0]?.data?.avatarImage?.src || ""), /q1\.qlogo\.cn/)
      assert.ok(result.replies.length >= 1)
    } finally {
      await harness.dispose()
      setStatusCardTestHooks(null)
    }
  }
})
