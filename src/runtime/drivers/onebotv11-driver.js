import BaseAdapterDriver from "./base-adapter-driver.js"

export class OneBotV11Driver extends BaseAdapterDriver {
  async start(runtime) {
    this.runtime = runtime
    const { default: OneBotV11EventListener } = await import("../../Bot/onebotV11/event/index.js")
    this.listener = new OneBotV11EventListener({
      manageServices: false,
    })
    await this.listener.load()
    return this.getRuntimeBot()
  }
}

export default OneBotV11Driver
