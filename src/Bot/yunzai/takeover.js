import cfg from "../../lib/config.js"
import { createTakeoverState, fillBotListsBestEffort, getLoginInfoFromAdapter } from "./state.js"
import {
  connectAdapterByName,
  normalizeAdapterName,
  getAutoAdapterOrder,
  isOfficialBotAdapter,
  sanitizeOutboundMessageForAdapter,
} from "./adapter.js"
import { patchYunzaiBot, installTakeoverBotCompatProxy } from "./api-compat.js"
import { startMilkyTakeoverBridge, startOnebotTakeoverBridge } from "./events/index.js"
import { toInt, logInfo, logWarn, logError } from "./_helpers.js"

export async function startYunzaiTakeover({ bot, ignoreSelf } = {}) {
  const runtimeBot = bot || globalThis.Bot
  if (!runtimeBot) throw new Error("[takeover] global Bot not found")

  if (runtimeBot.__xunlu_takeover_started) {
    return runtimeBot.__xunlu_takeover_started
  }

  const botCfg = cfg.getConfig("bot") || {}
  const onebotCfg = cfg.getConfig("onebot") || {}
  const adapterName = normalizeAdapterName(process.env.XUNLU_ADAPTER || botCfg.adapter || "auto")

  logInfo("[xunlu-core][takeover] starting...", { adapter: adapterName })

  const { protocol, adapter, loginInfoRaw } = await connectAdapterByName(adapterName, {
    botCfg,
    onebotCfg,
    runtimeBot,
  })
  const loginInfo = getLoginInfoFromAdapter(protocol, loginInfoRaw)

  logInfo("[xunlu-core][takeover] adapter ready:", { protocol, uin: loginInfo.uin, nickname: loginInfo.nickname })

  if (protocol === "icqq") {
    globalThis.__xunlu_runtime_bot = runtimeBot
    runtimeBot.__xunlu_takeover_started = { protocol, loginInfo, adapterName }
    return runtimeBot.__xunlu_takeover_started
  }

  const state = createTakeoverState({
    bot: runtimeBot,
    protocol,
    adapter,
    ignoreSelf: ignoreSelf !== undefined ? Boolean(ignoreSelf) : true,
  })

  patchYunzaiBot(runtimeBot, state, { loginInfo })
  globalThis.__xunlu_runtime_bot = adapter
  globalThis.Bot = installTakeoverBotCompatProxy(runtimeBot)
  await fillBotListsBestEffort(runtimeBot, state)

  const bridgeHelpers = { toInt, logError, logWarn }

  if (protocol === "onebotv11") startOnebotTakeoverBridge({ bot: runtimeBot, state, helpers: bridgeHelpers })
  else if (protocol === "milky") startMilkyTakeoverBridge({ bot: runtimeBot, state, helpers: bridgeHelpers })
  else throw new Error(`[takeover] unsupported protocol=${protocol}`)

  runtimeBot.__xunlu_takeover_started = { protocol, loginInfo, adapterName }
  return runtimeBot.__xunlu_takeover_started
}

export { installTakeoverBotCompatProxy }

export const __test = {
  connectAdapterByName,
  getAutoAdapterOrder,
  isOfficialBotAdapter,
  patchYunzaiBot,
  sanitizeOutboundMessageForAdapter,
  installTakeoverBotCompatProxy,
}
