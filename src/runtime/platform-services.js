import { services } from "../service-container.js"

export function createPlatformFacade({ runtime, api, services: svc } = {}) {
  return {
    runtime,
    api,
    services: svc || services,
    getRuntimeBot() {
      if (runtime?.getRuntimeBot) return runtime.getRuntimeBot()
      return globalThis.__xunlu_runtime_bot || globalThis.Bot || null
    },
  }
}

export function getCompatRuntimeBot() {
  return globalThis.__xunlu_runtime_bot || globalThis.Bot || null
}

export function getPlatformLogger() {
  return services.logger || global.logger || null
}

export function getPlatformRedis() {
  return services.redis || global.redis || null
}

export function getPlatformFfmpeg() {
  return services.ffmpeg || null
}

export function getPlatformPuppeteer() {
  return services.puppeteer || null
}
