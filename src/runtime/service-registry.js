/**
 * 统一管理运行时服务的注册、启动和回收顺序。
 *
 * 这里故意保持实现简单：只解决“谁该启动、谁先停、当前状态如何看”这件事，
 * 不把它做成重量级 IOC 容器，避免 Runtime Kernel 自己再次膨胀。
 */
export class ServiceRegistry {
  constructor() {
    this.services = new Map()
    this.started = []
  }

  register(name, serviceModule) {
    const key = String(name || "").trim()
    if (!key || !serviceModule || typeof serviceModule !== "object") return null
    this.services.set(key, serviceModule)
    return serviceModule
  }

  get(name) {
    return this.services.get(String(name || "").trim()) || null
  }

  list() {
    return [...this.services.keys()]
  }

  getStartedNames() {
    return [...this.started]
  }

  async startAll(runtime, names = []) {
    const targets = names.length ? names : this.list()
    for (const name of targets) {
      const service = this.get(name)
      if (!service || this.started.includes(name)) continue
      if (typeof service.start === "function") await service.start(runtime)
      this.started.push(name)
    }
    return this.getStartedNames()
  }

  async stopAll() {
    const names = [...this.started].reverse()
    for (const name of names) {
      const service = this.get(name)
      if (!service) continue
      if (typeof service.stop === "function") await service.stop()
    }
    this.started = []
    return true
  }

  async health() {
    const report = {}
    for (const name of this.list()) {
      const service = this.get(name)
      report[name] =
        typeof service?.health === "function"
          ? await service.health()
          : { ok: this.started.includes(name) }
    }
    return report
  }
}

export default ServiceRegistry
