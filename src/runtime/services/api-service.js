import { getPluginApiServer, startServer, stopServer } from "../../lib/server.js"

/**
 * Plugin API 服务模块。
 *
 * 这里显式透传 Runtime Kernel 中的插件注册表，避免 API 层自行再 discover 一次插件。
 */
export class ApiServiceModule {
  async start(runtime) {
    return await startServer({
      plugins: runtime.getLoadedPlugins(),
      registerPlugins: false,
      port: runtime?.options?.apiService?.port,
      host: runtime?.options?.apiService?.host,
    })
  }

  async stop() {
    return await stopServer()
  }

  health() {
    return { ok: Boolean(getPluginApiServer()) }
  }
}

export default ApiServiceModule
