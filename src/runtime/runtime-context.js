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
    this.configOptions = {
      isWatcher: options.isWatcher,
    }
    this.configManager = null
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

  get config() {
    return this.getConfigManager()
  }

  getConfigManager({ create = true } = {}) {
    if (!this.configManager && create) {
      this.configManager = createRuntimeConfigManager({
        rootDir: this.paths.rootDir,
        isWatcher: this.configOptions.isWatcher,
      })
    }
    return this.configManager
  }

  ensureRuntimeLayout() {
    return this.paths.ensureRuntimeLayout()
  }

  cleanupConfig() {
    this.configManager?.cleanup()
    this.configManager = null
  }

  cleanup() {
    this.cleanupConfig()
  }
}

let runtimeContext = null

export function getCurrentRuntimeContext() {
  return runtimeContext
}

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
