import BaseBot from "../index.js"

/**
 * icqq 事件链路专用的 Bot Core 工厂。
 *
 * 旧实现直接导出一个全局单例，导致 listener、事件类和测试共用同一份隐式状态。
 * 这里改成“显式创建 + 显式激活”的模式，仍保留默认获取能力，但不再把单例藏在 import 副作用里。
 */
export class IcqqPluginLoader extends BaseBot {
  constructor(options = {}) {
    super({
      adapter: "icqqbot",
      ...(options && typeof options === "object" ? options : {}),
    })
  }
}

let activePluginLoader = null

export function createIcqqPluginLoader(options = {}) {
  return new IcqqPluginLoader(options)
}

export function getActiveIcqqPluginLoader() {
  if (!activePluginLoader) {
    activePluginLoader = createIcqqPluginLoader()
  }
  return activePluginLoader
}

export function setActiveIcqqPluginLoader(loader) {
  activePluginLoader = loader || createIcqqPluginLoader()
  return activePluginLoader
}

export function resetActiveIcqqPluginLoader() {
  activePluginLoader = null
}

const defaultPluginLoader = getActiveIcqqPluginLoader()

export default defaultPluginLoader
