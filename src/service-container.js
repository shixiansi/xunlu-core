/**
 * 全局服务容器。
 *
 * 所有基础设施服务（logger / redis / puppeteer / ffmpeg / config / renderer
 * / scheduler / messageDB）集中于此，由 runtime-kernel.js 统一初始化。
 *
 * 插件通过 ctx.services.xxx 访问，无需手动 import。
 */
export const services = {
  logger: null,
  redis: null,
  puppeteer: null,
  ffmpeg: null,
  config: null,
  renderer: null,
  scheduler: null,
  messageDB: null,
}
