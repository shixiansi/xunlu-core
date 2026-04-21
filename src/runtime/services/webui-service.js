import { getWebuiServer, startWebuiServer, stopWebuiServer } from "../../lib/webuiServer.js"

/**
 * WebUI 服务模块。
 *
 * WebUI 需要消费已经加载好的插件清单，这样它和 Bot 内核看到的是同一份插件视图，
 * 不会再因为服务层二次 `loadPlugins()` 导致状态分叉。
 */
export class WebuiServiceModule {
  async start(runtime) {
    return await startWebuiServer({
      plugins: runtime.getLoadedPlugins(),
      registry: runtime.getWebUiRegistry?.() || null,
    })
  }

  async stop() {
    return await stopWebuiServer()
  }

  health() {
    return { ok: Boolean(getWebuiServer()) }
  }
}

export default WebuiServiceModule
