import BaseAdapterDriver from "./base-adapter-driver.js"
import { createOneBotV11Binding } from "./onebotv11-binding.js"

export class OneBotV11Driver extends BaseAdapterDriver {
  async start(runtime) {
    this.runtime = runtime
    const { default: OneBotV11EventListener } = await import("../../Bot/onebotV11/event/index.js")
    this.listener = new OneBotV11EventListener({
      manageServices: false,
      binding: createOneBotV11Binding(),
    })
    await this.listener.load()
    return this.getRuntimeBot()
  }
}

export default OneBotV11Driver
