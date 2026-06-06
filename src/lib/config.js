import {
  getCurrentRuntimeContext,
  getRuntimeContext,
} from "../runtime/runtime-context.js"

function getConfigManager() {
  return getRuntimeContext().config
}

function getExistingConfigManager() {
  return getCurrentRuntimeContext()?.getConfigManager?.({ create: false }) || null
}

const cfgTarget = {}

const cfg = new Proxy(
  cfgTarget,
  {
    get(target, key, receiver) {
      if (key === Symbol.toStringTag) return "XunLuConfig"
      if (Reflect.has(target, key)) return Reflect.get(target, key, receiver)
      if (key === "cleanup") {
        return (...args) => getExistingConfigManager()?.cleanup?.(...args)
      }

      const manager = getConfigManager()
      const value = Reflect.get(manager, key, manager)
      return typeof value === "function" ? value.bind(manager) : value
    },

    set(target, key, value, receiver) {
      return Reflect.set(target, key, value, receiver)
    },

    deleteProperty(target, key) {
      return Reflect.deleteProperty(target, key)
    },

    has(target, key) {
      if (Reflect.has(target, key)) return true
      if (key === "cleanup") return true
      const manager = getExistingConfigManager()
      return manager ? key in manager : false
    },

    ownKeys(target) {
      const manager = getExistingConfigManager()
      const keys = new Set(Reflect.ownKeys(target))
      if (manager) {
        for (const key of Reflect.ownKeys(manager)) keys.add(key)
      }
      return [...keys]
    },

    getOwnPropertyDescriptor(target, key) {
      const targetDesc = Reflect.getOwnPropertyDescriptor(target, key)
      if (targetDesc) return targetDesc

      const manager = getExistingConfigManager()
      if (!manager) return undefined
      const desc = Reflect.getOwnPropertyDescriptor(manager, key)
      if (!desc) return undefined
      return {
        ...desc,
        configurable: true,
      }
    },
  },
)

export default cfg
