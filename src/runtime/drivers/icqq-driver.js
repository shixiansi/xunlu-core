import BaseAdapterDriver from "./base-adapter-driver.js"
import { createIcqqBinding } from "./icqq-binding.js"

export class IcqqDriver extends BaseAdapterDriver {
  async start(runtime) {
    this.runtime = runtime
    if (this.options.globalBot) {
      const { startYunzaiCommandUsageBridge } = await import("../../Bot/yunzai/command-bridge.js")
      await startYunzaiCommandUsageBridge().catch(err => {
        console.warn("[IcqqDriver] command usage bridge init failed:", err?.message || err)
      })
    }
    const { ListenerLoader } = await import("../../Bot/icqq/EventListener.js")
    this.listener = new ListenerLoader({
      manageServices: false,
      binding: createIcqqBinding(),
    })
    await this.listener.load(this.options.globalBot || globalThis.Bot)
    return this.getRuntimeBot()
  }
}

export default IcqqDriver
