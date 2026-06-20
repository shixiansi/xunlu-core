import { getWebuiServer, startWebuiServer, stopWebuiServer } from "../../lib/webuiServer.js"

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
