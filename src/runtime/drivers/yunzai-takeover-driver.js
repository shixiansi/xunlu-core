import BaseAdapterDriver from "./base-adapter-driver.js"
import { createIcqqBinding } from "./icqq-binding.js"
import { createIcqqRuntimeListener } from "../../Bot/adapter/icqq/runtime.js"

/**
 * takeover 驱动把“外部适配器接入”与“云崽插件消费事件”拼装在一起。
 *
 * 它不自己启动 control/webui，这部分交给 Runtime Kernel 的服务注册表统一处理。
 */
export class YunzaiTakeoverDriver extends BaseAdapterDriver {
  async start(runtime) {
    this.runtime = runtime
    const globalBot = this.options.globalBot
    if (!globalBot) throw new Error("[YunzaiTakeoverDriver] globalBot is required")

    const { startYunzaiCommandUsageBridge } = await import("../../Bot/yunzai/command-bridge.js")
    const { startYunzaiTakeover } = await import("../../Bot/yunzai/takeover.js")

    await startYunzaiCommandUsageBridge().catch(err => {
      console.warn("[YunzaiTakeoverDriver] command usage bridge init failed:", err?.message || err)
    })

    await startYunzaiTakeover({
      bot: globalBot,
      ignoreSelf: this.options.ignoreSelf !== false,
    })

    this.listener = createIcqqRuntimeListener({
      binding: createIcqqBinding(),
    })
    await this.listener.load(globalBot)
    return this.getRuntimeBot()
  }
}

export default YunzaiTakeoverDriver
