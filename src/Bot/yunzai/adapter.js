import cfg from "../../lib/config.js"
import MilkyAdapter from "../adapter/milky/milky-adapter.js"
import OneBotV11Adapter from "../adapter/onebotV11/onebot.js"
import { toInt, logWarn } from "./_helpers.js"

function normalizeAdapterName(name) {
  const v = String(name || "").toLowerCase()
  if (v === "auto") return "auto"
  if (v === "icqq") return "icqq"
  if (v === "milky") return "milky"
  if (v === "onebotv11" || v === "onebot-v11" || v === "onebot") return "onebotv11"
  return "auto"
}

function getAutoAdapterOrder() {
  return ["icqq", "onebotv11", "milky"]
}

function preprocessOutboundMessage(input) {
  const fixCorruptedJpegHeader = buf => {
    if (!Buffer.isBuffer(buf) || buf.length < 12) return buf

    const looksLikeJfif =
      buf[0] === 0xfd &&
      buf[1] === 0xfd &&
      buf[2] === 0xfd &&
      buf[3] === 0xfd &&
      buf[4] === 0x00 &&
      buf[5] === 0x10 &&
      buf[6] === 0x4a &&
      buf[7] === 0x46 &&
      buf[8] === 0x49 &&
      buf[9] === 0x46 &&
      buf[10] === 0x00

    if (!looksLikeJfif) return buf

    const fixed = Buffer.from(buf)
    fixed[0] = 0xff
    fixed[1] = 0xd8
    fixed[2] = 0xff
    fixed[3] = 0xe0
    return fixed
  }

  const convertOne = seg => {
    if (!seg || typeof seg !== "object") return seg

    if (seg.type === "image") {
      if (Buffer.isBuffer(seg.file)) {
        const fixed = fixCorruptedJpegHeader(seg.file)
        return { ...seg, file: `base64://${fixed.toString("base64")}` }
      }
      if (Buffer.isBuffer(seg?.data?.file)) {
        const fixed = fixCorruptedJpegHeader(seg.data.file)
        return { ...seg, data: { ...(seg.data || {}), file: `base64://${fixed.toString("base64")}` } }
      }
    }

    if (seg.type === "record" || seg.type === "voice") {
      if (Buffer.isBuffer(seg.file)) {
        return { ...seg, file: `base64://${seg.file.toString("base64")}` }
      }
      if (Buffer.isBuffer(seg?.data?.file)) {
        return { ...seg, data: { ...(seg.data || {}), file: `base64://${seg.data.file.toString("base64")}` } }
      }
    }

    return seg
  }

  if (Array.isArray(input)) return input.map(convertOne)
  return convertOne(input)
}

function isButtonSegment(segment) {
  return Boolean(
    segment &&
      typeof segment === "object" &&
      !Array.isArray(segment) &&
      String(segment.type || "").trim() === "button",
  )
}

function isOfficialBotAdapter({ bot, adapter } = {}) {
  return String(bot?.adapter?.id || adapter?.id || "").trim() === "QQBot"
}

function sanitizeOutboundMessageForAdapter(input, context = {}) {
  if (isOfficialBotAdapter(context)) return input

  if (Array.isArray(input)) {
    return input.filter(segment => !isButtonSegment(segment))
  }

  return isButtonSegment(input) ? null : input
}

async function connectAdapterByName(
  adapterName,
  { botCfg = {}, onebotCfg = {}, runtimeBot = null } = {},
) {
  const name = normalizeAdapterName(adapterName)

  const tryIcqq = async runtimeBot => {
    const candidate = runtimeBot && typeof runtimeBot === "object" ? runtimeBot : null
    const loginInfoRaw =
      typeof candidate?.getLoginInfo === "function"
        ? await candidate.getLoginInfo().catch(() => null)
        : null
    const fallbackInfo = {
      uin: candidate?.uin ?? candidate?.self_id ?? candidate?.user_id ?? candidate?.botQQ,
      nickname: candidate?.nickname,
    }
    const loginInfo = loginInfoRaw && typeof loginInfoRaw === "object" ? loginInfoRaw : fallbackInfo
    const uin = toInt(
      loginInfo?.uin ??
        loginInfo?.self_id ??
        loginInfo?.user_id ??
        loginInfo?.userId ??
        loginInfo?.botQQ,
    )
    const hasIcqqApis = Boolean(
      candidate &&
        (typeof candidate.pickGroup === "function" ||
          typeof candidate.pickFriend === "function" ||
          typeof candidate.pickUser === "function" ||
          typeof candidate.sendGroupMsg === "function" ||
          typeof candidate.sendPrivateMsg === "function"),
    )

    if (!candidate || !hasIcqqApis || uin === undefined) {
      throw new Error("[xunlu-core][takeover] icqq runtime bot unavailable")
    }

    return { protocol: "icqq", adapter: candidate, loginInfoRaw: loginInfo }
  }

  const tryMilky = async () => {
    const adapter = new MilkyAdapter({ ...(botCfg || {}) })
    const loginInfoRaw = await adapter.getLoginInfo()
    return { protocol: "milky", adapter, loginInfoRaw }
  }

  const tryOnebot = async () => {
    const wsPort = onebotCfg.wsPort || 2955
    const wsPath = onebotCfg.wsPath || "/OneBotV11"
    const adapter = new OneBotV11Adapter({ wsPort, wsPath })
    adapter.startServer()
    await adapter.waitUntilConnected({ timeoutMs: 60000 })
    const loginInfoRaw = await adapter.getLoginInfo()
    return { protocol: "onebotv11", adapter, loginInfoRaw }
  }

  if (name === "icqq") return await tryIcqq(runtimeBot)
  if (name === "milky") return await tryMilky()
  if (name === "onebotv11") return await tryOnebot()

  // auto
  for (const protocol of getAutoAdapterOrder()) {
    try {
      if (protocol === "icqq") return await tryIcqq(runtimeBot)
      if (protocol === "onebotv11") return await tryOnebot()
      if (protocol === "milky") return await tryMilky()
    } catch (err) {
      logWarn(
        `[xunlu-core][takeover] ${protocol} connect failed, fallback next adapter:`,
        err?.message || err,
      )
    }
  }

  throw new Error("[xunlu-core][takeover] no available adapter found for auto mode")
}

export {
  connectAdapterByName,
  normalizeAdapterName,
  getAutoAdapterOrder,
  isOfficialBotAdapter,
  preprocessOutboundMessage,
  sanitizeOutboundMessageForAdapter,
}
