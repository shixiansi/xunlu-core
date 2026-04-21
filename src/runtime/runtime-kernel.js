import cfg from "../lib/config.js"
import ServiceRegistry from "./service-registry.js"
import { createBotFacade } from "./bot-facade-factory.js"
import { resolveRuntimeMode } from "./mode-resolver.js"
import ControlServiceModule from "./services/control-service.js"
import WebuiServiceModule from "./services/webui-service.js"
import ApiServiceModule from "./services/api-service.js"
import MilkyDriver from "./drivers/milky-driver.js"
import OneBotV11Driver from "./drivers/onebotv11-driver.js"
import IcqqDriver from "./drivers/icqq-driver.js"
import YunzaiTakeoverDriver from "./drivers/yunzai-takeover-driver.js"
import ApiOnlyDriver from "./drivers/api-only-driver.js"
import UnsupportedStandaloneIcqqDriver from "./drivers/unsupported-standalone-icqq-driver.js"

async function loadRuntimeEnvironment() {
  const { default: logjs } = await import("../component/logger/log.js")
  await logjs()
  const { default: startRedis } = await import("../component/redis/redis.js")
  await startRedis()
}

/**
 * 统一运行时内核。
 *
 * 它只负责 4 件事：
 * 1. 解析当前 mode
 * 2. 启动对应 driver
 * 3. 构建 facade
 * 4. 装配并回收服务
 */
export class RuntimeKernel {
  constructor(options = {}) {
    this.options = options
    this.modeState = options.modeState || null
    this.mode = this.modeState?.mode || ""
    this.driver = null
    this.facade = null
    this.services = new ServiceRegistry()
    this.started = false
  }

  static async create(options = {}) {
    const modeState = options.modeState || (await resolveRuntimeMode(options))
    return new RuntimeKernel({ ...options, modeState })
  }

  async start() {
    if (this.started) return this

    await loadRuntimeEnvironment()
    this.driver = await this.createDriver()
    if (!this.driver?.__startedByAutoFallback) {
      await this.driver.start(this)
    }
    this.facade =
      this.mode === "api-only"
        ? null
        : createBotFacade({
            driver: this.driver,
            globalBot: this.modeState?.globalBot,
          })
    this.registerDefaultServices()
    await this.services.startAll(this)
    this.started = true
    return this
  }

  async createDriver() {
    switch (this.modeState?.mode) {
      case "yunzai-icqq":
        return new IcqqDriver({ globalBot: this.modeState?.globalBot })
      case "yunzai-takeover":
        return new YunzaiTakeoverDriver({
          globalBot: this.modeState?.globalBot,
          ignoreSelf: this.modeState?.ignoreSelf,
        })
      case "standalone-onebotv11":
        return new OneBotV11Driver()
      case "standalone-auto":
        return await this.createAutoFallbackDriver()
      case "standalone-milky":
        return new MilkyDriver()
      case "standalone-icqq-unsupported":
        return new UnsupportedStandaloneIcqqDriver({
          mode: this.modeState?.mode,
          adapter: this.modeState?.adapter,
        })
      case "api-only":
        return new ApiOnlyDriver()
      default:
        return new MilkyDriver()
    }
  }

  /**
   * auto 模式在 Kernel 内部做 fallback，而不是入口文件里手写 switch。
   */
  async createAutoFallbackDriver() {
    const candidates = [MilkyDriver, OneBotV11Driver]
    let lastError = null
    for (const DriverCtor of candidates) {
      const driver = new DriverCtor()
      try {
        await driver.start(this)
        // auto 路径上 driver 已经成功启动，直接返回这个已启动实例。
        driver.__startedByAutoFallback = true
        return driver
      } catch (err) {
        lastError = err
        console.warn("[RuntimeKernel] auto fallback failed:", err?.message || err)
        await driver.stop().catch(() => false)
      }
    }

    this.modeState = {
      ...this.modeState,
      mode: "api-only",
      adapter: "api-only",
      fallbackReason: lastError?.message || "auto-driver-fallback",
    }
    this.mode = "api-only"
    return new ApiOnlyDriver({
      cacheBust: true,
      fallbackReason: this.modeState?.fallbackReason || "",
    })
  }

  registerDefaultServices() {
    const botCfg = cfg.getConfig("bot") || {}

    if (this.mode === "api-only") {
      this.services.register("api", new ApiServiceModule())
      return
    }

    if (botCfg.ctl_enable !== false) {
      this.services.register("control", new ControlServiceModule())
    }
    if (botCfg.webui_enable !== false) {
      this.services.register("webui", new WebuiServiceModule())
    }
  }

  getRuntimeBot() {
    if (this.mode === "api-only" || this.mode === "standalone-icqq-unsupported") return null
    return this.facade?.runtimeBot || this.driver?.getRuntimeBot?.() || globalThis.Bot || null
  }

  getBotCore() {
    if (this.mode === "api-only" || this.mode === "standalone-icqq-unsupported") return null
    return this.facade?.botCore || this.driver?.getBotCore?.() || null
  }

  getLoadedPlugins() {
    return this.driver?.getLoadedPlugins?.() || []
  }

  async reloadPlugins(options = {}) {
    return await this.driver?.reloadPlugins?.(options)
  }

  async dispatchIncoming(event) {
    const botCore = this.getBotCore()
    if (typeof botCore?.deal === "function") return await botCore.deal(event)
    return false
  }

  async simulateIncoming(payload) {
    return await this.driver?.simulateIncoming?.(payload)
  }

  getStatus() {
    return {
      ok: true,
      mode: this.modeState?.mode || this.mode,
      adapter: this.modeState?.adapter || "",
      services: this.services.getStartedNames(),
      driver: this.driver?.getStatus?.() || {},
      pluginCount: this.getLoadedPlugins().length,
      plugins: this.getLoadedPlugins().map(item => item?.name || item?.title).filter(Boolean),
    }
  }

  async health() {
    return {
      runtime: {
        ok: this.started,
        mode: this.modeState?.mode || this.mode,
      },
      services: await this.services.health(),
    }
  }

  async stop() {
    await this.services.stopAll()
    await this.driver?.stop?.()
    this.started = false
    return true
  }
}

export async function createRuntimeKernel(options = {}) {
  return await RuntimeKernel.create(options)
}

/**
 * 兼容性的 API only 启动入口。
 *
 * 保留这个函数是为了让旧代码逐步迁移，而不是一次性把所有启动姿势都打碎。
 */
export async function startApiOnlyRuntime() {
  const kernel = await createRuntimeKernel({ mode: "api-only" })
  await kernel.start()
  return kernel
}

export default RuntimeKernel
