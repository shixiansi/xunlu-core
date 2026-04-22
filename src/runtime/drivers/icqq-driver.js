import BaseAdapterDriver from "./base-adapter-driver.js"
import { createIcqqBinding } from "./icqq-binding.js"
import { createIcqqRuntimeListener } from "../../Bot/adapter/icqq/runtime.js"

export class IcqqDriver extends BaseAdapterDriver {
  async start(runtime) {
    this.runtime = runtime
    const globalBot = this.options.globalBot
    if (!globalBot) throw new Error("[IcqqDriver] globalBot is required")

    const { startYunzaiCommandUsageBridge } = await import("../../Bot/yunzai/command-bridge.js")
    await startYunzaiCommandUsageBridge().catch(err => {
      console.warn("[IcqqDriver] command usage bridge init failed:", err?.message || err)
    })

    this.listener = createIcqqRuntimeListener({
      binding: createIcqqBinding(),
    })
    await this.listener.load(globalBot)
    return this.getRuntimeBot()
  }
}

export default IcqqDriver
