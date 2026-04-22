import BaseAdapterDriver from "./base-adapter-driver.js"
import { createMilkyBinding } from "./milky-binding.js"
import { createMilkyRuntimeListener } from "../../Bot/adapter/index.js"

export class MilkyDriver extends BaseAdapterDriver {
  async start(runtime) {
    this.runtime = runtime
    this.listener = createMilkyRuntimeListener({
      binding: createMilkyBinding(),
    })
    await this.listener.load()
    return this.getRuntimeBot()
  }
}

export default MilkyDriver
