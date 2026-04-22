/**
 * 统一构造运行时 Bot facade。
 *
 * Runtime Kernel 只消费 driver 暴露出的显式接口，
 * 不再从 `globalThis.Bot` 或历史兼容对象回退拼装。
 */
export function createBotFacade({ driver } = {}) {
  const runtimeBot = driver?.getRuntimeBot?.() || null
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
