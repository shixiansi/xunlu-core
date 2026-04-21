import BaseAdapterDriver from "./base-adapter-driver.js"

export class MilkyDriver extends BaseAdapterDriver {
  async start(runtime) {
    this.runtime = runtime
    const { default: LLoneBotEventListener } = await import("../../Bot/llonebot/event/index.js")
    this.listener = new LLoneBotEventListener({
      manageServices: false,
    })
    await this.listener.load()
    return this.getRuntimeBot()
  }
}

export default MilkyDriver
