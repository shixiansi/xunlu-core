import { createRuntimeKernel } from "./runtime/runtime-kernel.js"
import { resolveRuntimeMode } from "./runtime/mode-resolver.js"

/**
 * xunlu-core 主入口。
 *
 * 新结构下入口不再直接管理：
 * - 云崽 / standalone 分支
 * - takeover 细节
 * - auto fallback
 * - control/webui/api 的装配
 *
 * 它只负责两件事：解析 mode，然后启动 Runtime Kernel。
 */
async function main() {
  const modeState = await resolveRuntimeMode()
  const kernel = await createRuntimeKernel({ modeState })
  await kernel.start()

  return kernel
}

main().catch(err => {
  console.error("[xunlu-core] 启动失败：", err)
})

export default {}
