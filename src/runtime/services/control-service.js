import {
  getControlServer,
  startControlServer,
  stopControlServer,
} from "../../lib/controlServer.js"

export class ControlServiceModule {
  async start(runtime) {
    return startControlServer({
      getStatus: () => runtime.getStatus(),
      reloadPlugins: async () => await runtime.reloadPlugins({ cacheBust: true }),
      sendMessage: async payload => await runtime.simulateIncoming(payload),
      exitProcess: () => {
        void runtime
          .stop()
          .catch(err => console.warn("[runtime.control] stop failed before exit:", err))
          .finally(() => setTimeout(() => process.exit(0), 50))
      },
    })
  }

  async stop() {
    return await stopControlServer()
  }

  health() {
    return { ok: Boolean(getControlServer()) }
  }
}

export default ControlServiceModule
