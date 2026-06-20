import { PluginState, isValidTransition } from "./states.js"
import { RWLock } from "./lock.js"

export class LifecycleManager {
  constructor() {
    this._states = new Map()
    this._locks = new Map()
    this._hooks = new Map()
  }

  getState(pluginName) {
    return this._states.get(pluginName) ?? PluginState.UNLOADED
  }

  getLock(pluginName) {
    let lock = this._locks.get(pluginName)
    if (!lock) {
      lock = new RWLock()
      this._locks.set(pluginName, lock)
    }
    return lock
  }

  _setState(pluginName, state) {
    this._states.set(pluginName, state)
  }

  async transition(pluginName, toState, hookFn) {
    const from = this.getState(pluginName)
    if (!isValidTransition(from, toState)) {
      throw new Error(
        `[Lifecycle] Invalid transition ${from} -> ${toState} for plugin "${pluginName}"`,
      )
    }

    const lock = this.getLock(pluginName)
    await lock.acquireWrite()

    try {
      this._setState(pluginName, toState)

      if (typeof hookFn === "function") {
        try {
          await hookFn(pluginName)
        } catch (err) {
          this._setState(pluginName, PluginState.ERROR)
          throw err
        }
      }
    } finally {
      lock.releaseWrite()
    }
  }

  getHook(pluginDef, hookName) {
    if (typeof pluginDef[hookName] === "function") return pluginDef[hookName]
    return null
  }

  async load(pluginDef) {
    const name = pluginDef.name
    return this.transition(name, PluginState.LOADING, async () => {
      const hook = this.getHook(pluginDef, "onLoad")
      if (hook) await hook(pluginDef)
      this._setState(name, PluginState.LOADED)
    })
  }

  async enable(pluginDef, context) {
    const name = pluginDef.name
    return this.transition(name, PluginState.ENABLING, async () => {
      const hook = this.getHook(pluginDef, "onEnable")
      if (hook) await hook(pluginDef, context)
      this._setState(name, PluginState.ENABLED)
    })
  }

  async disable(pluginDef) {
    const name = pluginDef.name
    return this.transition(name, PluginState.DISABLING, async () => {
      const hook = this.getHook(pluginDef, "onDisable")
      if (hook) await hook(pluginDef)
      this._setState(name, PluginState.DISABLED)
    })
  }

  async unload(pluginDef) {
    const name = pluginDef.name
    return this.transition(name, PluginState.UNLOADING, async () => {
      const hook = this.getHook(pluginDef, "onUnload")
      if (hook) await hook(pluginDef)
      this._setState(name, PluginState.UNLOADED)
    })
  }

  async onConfigChange(pluginDef, oldConfig, newConfig) {
    const name = pluginDef.name
    const hook = this.getHook(pluginDef, "onConfigChange")
    if (hook) {
      const lock = this.getLock(name)
      await lock.acquireRead()
      try {
        await hook(pluginDef, oldConfig, newConfig)
      } finally {
        lock.releaseRead()
      }
    }
  }

  async acquireCommandLock(pluginName) {
    const lock = this.getLock(pluginName)
    await lock.acquireRead()
    let released = false
    return {
      release: () => {
        if (released) return
        released = true
        lock.releaseRead()
      },
    }
  }
}

export default LifecycleManager
