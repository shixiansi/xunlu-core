import { getPluginApiServer, startServer, stopServer } from "../../lib/server.js"

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
