/**
 * 运行时 Driver 基类。
 *
 * 统一约束适配器驱动的最小接口，避免 Runtime Kernel 再去感知
 * “某个监听器类到底叫什么、暴露了哪些内部字段”。
 */
export class BaseAdapterDriver {
  constructor(options = {}) {
    this.options = options
    this.runtime = null
    this.listener = null
    this.ingressHandler = null
  }

  bindIngress(handler) {
    this.ingressHandler = typeof handler === "function" ? handler : null
    return this.ingressHandler
  }

  getRuntimeBot() {
    return this.listener?.getRuntimeBot?.() || null
  }

  getBotCore() {
    return this.listener?.getBotCore?.() || null
  }

  getStatus() {
    return this.listener?.getStatus?.() || {
      protocol: this.options.protocol || "",
      adapterType: this.options.adapterType || "",
    }
  }

  getLoadedPlugins() {
    const botCore = this.getBotCore()
    if (!botCore?.pluginCatalog || typeof botCore.pluginCatalog !== "object") return []
    return Object.values(botCore.pluginCatalog)
  }

  async reloadPlugins(options = {}) {
    const botCore = this.getBotCore()
    if (typeof botCore?.reloadBotPlugins === "function") {
      return await botCore.reloadBotPlugins(options)
    }
    return []
  }

  async simulateIncoming(payload) {
    if (typeof this.listener?.simulateIncoming === "function") {
      return await this.listener.simulateIncoming(payload)
    }
    throw new Error(`[${this.constructor.name}] simulateIncoming is not implemented`)
  }

  async stop() {
    try {
      if (typeof this.listener?.dispose === "function") this.listener.dispose()
    } catch (err) {
      console.warn(`[${this.constructor.name}] dispose failed:`, err?.message || err)
    }
    return true
  }
}

export default BaseAdapterDriver
