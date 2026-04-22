import path from "path"

import { loadPlugins } from "../../lib/pluginLoader.js"
import { getRuntimePaths } from "../runtime-context.js"
import BaseAdapterDriver from "./base-adapter-driver.js"

/**
 * API only driver 只负责插件定义、API 路由和 onBotEvent 广播所需的数据源。
 *
 * 它刻意不构建 Bot Core，也不执行 plugin.register(botApi)，
 * 用于表达“仅 API / 事件模式”的真实语义。
 */
export class ApiOnlyDriver extends BaseAdapterDriver {
  constructor(options = {}) {
    super(options)
    this.plugins = []
  }

  async start(runtime) {
    this.runtime = runtime
    this.plugins = await loadPlugins(path.join(getRuntimePaths().rootDir, "src", "plugins"), {
      cacheBust: Boolean(this.options.cacheBust),
    })
    return null
  }

  getRuntimeBot() {
    return null
  }

  getBotCore() {
    return null
  }

  getLoadedPlugins() {
    return [...this.plugins]
  }

  getStatus() {
    return {
      protocol: "api-only",
      adapterType: "api-only",
      pluginCount: this.plugins.length,
      plugins: this.plugins.map(item => item?.name || item?.title).filter(Boolean),
    }
  }

  async reloadPlugins(options = {}) {
    this.plugins = await loadPlugins(path.join(getRuntimePaths().rootDir, "src", "plugins"), {
      cacheBust: options.cacheBust !== false,
    })
    return this.plugins.map(item => item?.name || item?.title).filter(Boolean)
  }

  async simulateIncoming() {
    throw new Error("[ApiOnlyDriver] simulateIncoming is not supported in api-only mode")
  }

  async stop() {
    this.plugins = []
    return true
  }
}

export default ApiOnlyDriver
