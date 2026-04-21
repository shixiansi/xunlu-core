import {
  getControlServer,
  startControlServer,
  stopControlServer,
} from "../../lib/controlServer.js"

/**
 * Control Server 服务模块。
 *
 * 对 Runtime Kernel 来说，它只依赖 runtime 暴露的统一能力：
 * `getStatus / reloadPlugins / simulateIncoming / stop`。
 */
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
