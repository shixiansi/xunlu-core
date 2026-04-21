/**
 * 统一构造运行时 Bot facade。
 *
 * 第一阶段不强制重写所有 `global.Bot` 的来源，而是把“当前运行时应该暴露哪一个 Bot”
 * 这件事集中到一个工厂里，保证 Runtime Kernel、Service 和插件上下文拿到的是同一视图。
 */
export function createBotFacade({ driver, globalBot } = {}) {
  const runtimeBot = driver?.getRuntimeBot?.() || globalBot || globalThis.Bot || null
  const botCore = driver?.getBotCore?.() || null

  if (runtimeBot) {
    globalThis.Bot = runtimeBot
  }

  return {
    runtimeBot,
    botCore,
    createBindEvent(extra = {}) {
      const bindEvent = botCore?.bindEvent && typeof botCore.bindEvent === "object" ? botCore.bindEvent : {}
      return {
        ...bindEvent,
        ...(extra && typeof extra === "object" ? extra : {}),
      }
    },
  }
}

export default createBotFacade
