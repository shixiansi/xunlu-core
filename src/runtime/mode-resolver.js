import env from "../lib/env.js"
import cfg from "../lib/config.js"

function getGlobalBotOrNull() {
  try {
    // eslint-disable-next-line no-undef
    return Bot || globalThis.Bot || null
  } catch {
    return globalThis.Bot || null
  }
}

async function readYunzaiBotYaml() {
  try {
    const { default: YamlReader } = await import("../utils/YamlReader.js")
    const filePath = `${process.cwd()}/config/config/bot.yaml`
    return new YamlReader(filePath).jsonData || {}
  } catch (err) {
    console.warn("[runtime.mode] read yunzai bot.yaml failed:", err?.message || err)
    return {}
  }
}

async function waitIcqqOnline(bot, { timeoutMs = 60000, intervalMs = 1000 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      if (typeof bot?.isOnline === "function" && bot.isOnline()) return true
    } catch {}
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  return false
}

/**
 * 统一判定当前运行形态。
 *
 * 这里刻意只返回 mode + 运行所需上下文，不负责真正启动任何服务或适配器，
 * 让入口文件退化成纯粹的“拿到 mode -> 交给 Runtime Kernel”。
 */
export async function resolveRuntimeMode(options = {}) {
  const runtimeEnv = options.env || env
  const botCfg = options.botConfig || cfg.getConfig("bot") || {}
  const globalBot = options.globalBot !== undefined ? options.globalBot : getGlobalBotOrNull()

  const forcedMode = String(process.env.XUNLU_RUNTIME_MODE || options.mode || "")
    .trim()
    .toLowerCase()
  if (forcedMode === "api-only") {
    return {
      mode: "api-only",
      adapter: "api-only",
      isYunzai: false,
      globalBot,
      botConfig: botCfg,
    }
  }

  const adapter = String(process.env.XUNLU_ADAPTER || botCfg.adapter || "milky")
    .trim()
    .toLowerCase()
  const isYunzai = runtimeEnv?.CurEnv === "QQBot-YunZai"

  if (isYunzai || globalBot) {
    const yunzaiCfg = options.yunzaiConfig || (await readYunzaiBotYaml())
    const skipLogin = Boolean(yunzaiCfg?.skip_login)
    const ignoreSelf = yunzaiCfg?.ignore_self !== undefined ? Boolean(yunzaiCfg.ignore_self) : true

    const isOnline =
      typeof globalBot?.isOnline === "function"
        ? (() => {
            try {
              return Boolean(globalBot.isOnline())
            } catch {
              return false
            }
          })()
        : false

    if (!skipLogin && isOnline) {
      return {
        mode: "yunzai-icqq",
        adapter: "icqq",
        isYunzai,
        globalBot,
        yunzaiConfig: yunzaiCfg,
        botConfig: botCfg,
        skipLogin,
        ignoreSelf,
      }
    }

    if (!skipLogin && globalBot) {
      const ready = await waitIcqqOnline(globalBot, {
        timeoutMs: Number(options.waitIcqqTimeoutMs || 60000),
      })
      if (ready) {
        return {
          mode: "yunzai-icqq",
          adapter: "icqq",
          isYunzai,
          globalBot,
          yunzaiConfig: yunzaiCfg,
          botConfig: botCfg,
          skipLogin,
          ignoreSelf,
        }
      }
    }

    return {
      mode: "yunzai-takeover",
      adapter,
      isYunzai,
      globalBot,
      yunzaiConfig: yunzaiCfg,
      botConfig: botCfg,
      skipLogin,
      ignoreSelf,
    }
  }

  switch (adapter) {
    case "milky":
      return { mode: "standalone-milky", adapter, isYunzai: false, globalBot, botConfig: botCfg }
    case "onebotv11":
    case "onebot-v11":
      return {
        mode: "standalone-onebotv11",
        adapter: "onebotv11",
        isYunzai: false,
        globalBot,
        botConfig: botCfg,
      }
    case "auto":
      return { mode: "standalone-auto", adapter: "auto", isYunzai: false, globalBot, botConfig: botCfg }
    case "api":
    case "api-only":
      return { mode: "api-only", adapter: "api-only", isYunzai: false, globalBot, botConfig: botCfg }
    case "icqq":
      return { mode: "yunzai-icqq", adapter: "icqq", isYunzai: false, globalBot, botConfig: botCfg }
    default:
      return { mode: "standalone-auto", adapter: "auto", isYunzai: false, globalBot, botConfig: botCfg }
  }
}

export default resolveRuntimeMode
