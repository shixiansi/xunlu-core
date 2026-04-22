import BaseAdapterDriver from "./base-adapter-driver.js"
import { createOneBotV11Binding } from "./onebotv11-binding.js"
import { createOneBotV11RuntimeListener } from "../../Bot/adapter/onebotV11/runtime.js"

export class OneBotV11Driver extends BaseAdapterDriver {
  async start(runtime) {
    this.runtime = runtime
    this.listener = createOneBotV11RuntimeListener({
      binding: createOneBotV11Binding(),
    })
    await this.listener.load()
    return this.getRuntimeBot()
  }
}

export default OneBotV11Driver
