import { createRuntimeConfigManager } from "./runtime-config.js"
import { createRuntimePaths } from "./runtime-paths.js"

class RuntimeEnvFacade {
  constructor(context) {
    this.context = context
  }

  get package() {
    return this.context.packageInfo
  }

  get CurEnv() {
    return this.context.currentEnv
  }

  get RootPath() {
    return this.context.rootPath
  }
}

export class RuntimeContext {
  constructor(options = {}) {
    this.paths = createRuntimePaths(options)
    this.paths.ensureRuntimeLayout()
    this.config = createRuntimeConfigManager({
      rootDir: this.paths.rootDir,
      isWatcher: options.isWatcher,
    })
    this.env = new RuntimeEnvFacade(this)
  }

  get packageInfo() {
    return this.paths.packageInfo
  }

  get currentEnv() {
    return this.paths.currentEnv
  }

  get rootDir() {
    return this.paths.rootDir
  }

  get rootPath() {
    return this.paths.rootPath
  }

  ensureRuntimeLayout() {
    return this.paths.ensureRuntimeLayout()
  }

  cleanup() {
    this.config.cleanup()
  }
}

let runtimeContext = null

export function getRuntimeContext(options = {}) {
  if (!runtimeContext) {
    runtimeContext = new RuntimeContext(options)
  }
  return runtimeContext
}

export function getRuntimePaths() {
  return getRuntimeContext().paths
}

export function resetRuntimeContextForTests() {
  if (!runtimeContext) return
  runtimeContext.cleanup()
  runtimeContext = null
}

export default getRuntimeContext
