// 如果是插件环境（云崽），通过全局 Bot 获取机器人实例；否则按配置启动 milky/onebotv11/api-server

function getQQFromArray(arr) {
  // QQ号规则：纯数字，长度 4-13 位，不以 0 开头
  const qqReg = /^[1-9]\d{3,12}$/
  return arr.find(item => qqReg.test(item)) || null
}

function getGlobalBotOrNull() {
  try {
    // eslint-disable-next-line no-undef
    return Bot || null
  } catch {
    return null
  }
}

async function readYunzaiBotYaml() {
  try {
    const { default: YamlReader } = await import("./utils/YamlReader.js")
    const filePath = `${process.cwd()}/config/config/bot.yaml`
    return new YamlReader(filePath).jsonData || {}
  } catch (err) {
    console.warn("[xunlu-core] read yunzai bot.yaml failed:", err?.message || err)
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

async function ensureXunluCoreListenerLoaded(globalBot) {
  if (!globalBot || typeof globalBot !== "object") return false

  if (globalThis.__xunlu_core_listener_started) return true
  globalThis.__xunlu_core_listener_started = true

  try {
    // 复用 icqq EventListener 的插件加载/事件绑定逻辑（takeover 会让 checkEnv 返回 onebot/milky）
    await startIcqqFromYunzai(globalBot)
    console.log("[xunlu-core] ListenerLoader 已启动（takeover 事件将被插件消费）")
    return true
  } catch (err) {
    globalThis.__xunlu_core_listener_started = false
    console.error("[xunlu-core] ListenerLoader 启动失败：", err?.message || err)
    return false
  }
}

async function startIcqqFromYunzai(globalBot) {
  console.log("[xunlu-core] 检测到插件环境，启动云崽事件监听（icqq / takeover）")

  if (globalThis.__xunlu_listener_loader_loaded) return
  if (globalThis.__xunlu_listener_loader_loading) return
  globalThis.__xunlu_listener_loader_loading = true

  const tryStart = async () => {
    if (globalThis.__xunlu_listener_loader_loaded) return true
    const qq = getQQFromArray(Object.keys(globalBot || {}))
    if (!qq) return false

    const { ListenerLoader } = await import("./Bot/icqq/EventListener.js")
    globalBot.botQQ = qq
    process.env.xunLuEnv = "QQBot-ICQQYunZai"
    await new ListenerLoader().load(globalBot)
    globalThis.__xunlu_listener_loader_loaded = true
    globalThis.__xunlu_listener_loader_loading = false
    return true
  }

  // 先尝试一次，避免无意义等待
  try {
    if (await tryStart()) return
  } catch (err) {
    globalThis.__xunlu_listener_loader_loading = false
    throw err
  }

  // 云崽启动阶段 Bot 可能尚未挂载 QQ key，轮询等待
  let ticking = false
  const timer = setInterval(async () => {
    if (ticking) return
    ticking = true
    try {
      if (await tryStart()) clearInterval(timer)
    } catch (err) {
      console.error("[xunlu-core] icqq 初始化失败：", err)
    } finally {
      ticking = false
    }
  }, 2000)
}

async function startMilky() {
  const { default: EventListener } = await import("./Bot/llonebot/event/index.js")
  await new EventListener().load()
  process.env.xunLuEnv = "QQBot-LLoneBot"
  console.log("[xunlu-core] 已启动 milky (LLoneBot)")
}

async function startOneBotV11() {
  await import("./Bot/onebotV11/event/index.js")
  process.env.xunLuEnv = "QQBot-onebotV11"
  console.log("[xunlu-core] 已启动 onebotv11")
}

async function startApiServer() {
  const { startServer } = await import("./lib/server.js")
  startServer()
  process.env.xunLuEnv = "API-Server"
  console.log("[xunlu-core] 已启动 API-Server")
}

async function loadEnv() {
  const { default: logjs } = await import("./component/logger/log.js")
  await logjs()
  const { default: startRedis } = await import("./component/redis/redis.js")
  await startRedis()
}

async function startStandalone() {
  await loadEnv()

  const { default: cfg } = await import("./lib/config.js")
  const botCfg = cfg.getConfig("bot") || {}
  const adapter = String(process.env.XUNLU_ADAPTER || botCfg.adapter || "milky").toLowerCase()

  const startByAdapter = async name => {
    switch (String(name || "").toLowerCase()) {
      case "milky":
        return await startMilky()
      case "onebotv11":
      case "onebot-v11":
        return await startOneBotV11()
      case "auto": {
        try {
          return await startMilky()
        } catch (err) {
          console.error("[xunlu-core] milky 启动失败，回退 onebotv11：", err)
        }
        try {
          return await startOneBotV11()
        } catch (err) {
          console.error("[xunlu-core] onebotv11 启动失败，回退 API-Server：", err)
        }
        return await startApiServer()
      }
      case "icqq":
        throw new Error("icqq 仅支持云崽/插件环境（检测到全局 Bot 时自动启用）")
      default:
        console.warn(`[xunlu-core] 未知 adapter=${name}，按 auto 启动`)
        return await startByAdapter("auto")
    }
  }

  await startByAdapter(adapter)
}

async function main() {
  const { default: env } = await import("./lib/env.js")
  const isYunzai = env?.CurEnv === "QQBot-YunZai"

  // 云崽接管：优先 icqq，若离线/skip_login 则尝试用 milky/onebotv11 接管并注入事件
  if (isYunzai) {
    try {
      const { startYunzaiCommandUsageBridge } = await import("./Bot/yunzai/command-bridge.js")
      await startYunzaiCommandUsageBridge()
    } catch (err) {
      console.warn("[xunlu-core] yunzai command bridge init failed:", err?.message || err)
    }

    const globalBot = getGlobalBotOrNull()
    const yunzaiCfg = await readYunzaiBotYaml()

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
      return await startIcqqFromYunzai(globalBot)
    }

    // skip_login=true 时立即接管；否则等待 icqq 最多 60s
    const icqqReady = skipLogin ? false : await waitIcqqOnline(globalBot, { timeoutMs: 60000 })
    if (icqqReady) {
      console.log("[xunlu-core] icqq 已上线，跳过 takeover")
      return await startIcqqFromYunzai(globalBot)
    }

    console.warn("[xunlu-core] icqq 未上线，尝试使用 milky/onebotv11 takeover 云崽...")
    let takeoverOk = false
    try {
      const { startYunzaiTakeover } = await import("./Bot/yunzai/takeover.js")
      await startYunzaiTakeover({ bot: globalBot, ignoreSelf })
      console.log("[xunlu-core] takeover 启动完成（云崽插件将通过注入事件运行）")
      takeoverOk = true
    } catch (err) {
      console.error("[xunlu-core] takeover 启动失败：", err)
    }

    // takeover 成功后必须启动 xunlu-core 的 ListenerLoader，否则注入事件无人消费（表现为“插件不响应”）
    if (takeoverOk) {
      try {
        await ensureXunluCoreListenerLoaded(globalBot)
      } catch {}
    }

    // 可选：继续加载 xunlu-core 自己的 icqq 监听（可能引入额外覆写/噪音，默认关闭）
    let enableIcqqBridge = false
    try {
      const { default: cfg } = await import("./lib/config.js")
      const botCfg = cfg.getConfig("bot") || {}
      enableIcqqBridge = Boolean(
        botCfg.icqq_bridge_enable ?? botCfg.enable_icqq_bridge ?? botCfg.enableIcqqBridge,
      )
    } catch (err) {
      console.warn("[xunlu-core] read xunlu bot.config.yaml failed:", err?.message || err)
    }

    if (enableIcqqBridge) {
      try {
        if (globalBot) startIcqqFromYunzai(globalBot).catch(() => {})
      } catch {}
    }
    return
  }

  const globalBot = getGlobalBotOrNull()
  if (globalBot) return await startIcqqFromYunzai(globalBot)
  return await startStandalone()
}

main().catch(err => {
  console.error("[xunlu-core] 启动失败：", err)
})

export default {}
