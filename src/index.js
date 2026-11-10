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
  // 独立运行时以非零码退出，让 PM2/systemd 能感知并重启；
  // Yunzai 插件形态（xunLuEnv 已设置）下宿主不允许退出，仅记录失败状态。
  if (!process.env.xunLuEnv) {
    process.exitCode = 1
    setTimeout(() => process.exit(1), 300).unref?.()
  }
})

export default {}
