import Filemage from "../../../utils/Filemage.js"
import lodash from "lodash"
import { fileURLToPath } from "node:url"
import pluginLoader from "./pluginLoader.js"
import { UniversalMessage } from "../../message/universal-message.js"
import { coerceToUniversalMessage } from "../../message/context.js"
import { applyUniversalBotApi } from "../../api/universal-bot-api.js"
import { rememberRuntimeLastGroupMessage } from "../../state/index.js"
import { simulateIncomingMessage } from "../../message/cli-simulator.js"
import { createIcqqBinding } from "../../../runtime/drivers/icqq-binding.js"
import { normalizeProtocolName } from "../../runtime/shared.js"

let BotEnv

const OUTGOING_GROUP_SEND_MARK = Symbol.for("xunlu.outgoing.group.send.remembered")
const OUTGOING_GROUP_SEND_DEDUPE_TTL_MS = 5000

function toId(value) {
  if (value === undefined || value === null) return ""
  return String(value).trim()
}

function toFiniteId(value) {
  const text = toId(value)
  if (!text) return undefined
  const num = Number(text)
  return Number.isFinite(num) ? num : text
}

function getRuntimeBotSelfId(botLike) {
  return (
    botLike?.uin ??
    botLike?.self_id ??
    botLike?.user_id ??
    globalThis.Bot?.uin ??
    globalThis.Bot?.self_id ??
    globalThis.Bot?.user_id ??
    ""
  )
}

function getGroupIdFromSendTarget(target) {
  if (!target || typeof target !== "object") return undefined
  return target.group_id ?? target.groupId ?? target.gid ?? undefined
}

function getOutgoingGroupSendDedupeMap() {
  if (!(globalThis.__xunlu_outgoing_group_send_dedupe_map instanceof Map)) {
    globalThis.__xunlu_outgoing_group_send_dedupe_map = new Map()
  }
  return globalThis.__xunlu_outgoing_group_send_dedupe_map
}

function cleanupOutgoingGroupSendDedupe(now = Date.now()) {
  const map = getOutgoingGroupSendDedupeMap()
  for (const [key, ts] of map.entries()) {
    if (now - Number(ts || 0) > OUTGOING_GROUP_SEND_DEDUPE_TTL_MS) {
      map.delete(key)
    }
  }
  while (map.size > 1000) {
    const firstKey = map.keys().next()
    if (firstKey.done) break
    map.delete(firstKey.value)
  }
}

function getSendResultId(result) {
  const raw =
    result?.message_id ??
    result?.data?.message_id ??
    result?.seq ??
    result?.data?.seq ??
    result?.message_seq ??
    result?.data?.message_seq
  if (raw === undefined || raw === null) return ""
  if (Array.isArray(raw)) return raw.map(v => String(v)).join(",")
  return String(raw)
}

function rememberOutgoingGroupMessage({ bot, groupId, message, result } = {}) {
  const gid = toId(groupId)
  if (!gid) return false

  if (result && typeof result === "object" && result[OUTGOING_GROUP_SEND_MARK]) {
    return false
  }

  const now = Date.now()
  cleanupOutgoingGroupSendDedupe(now)

  const sendResultId = getSendResultId(result)
  const dedupeKey = sendResultId ? `${gid}:${sendResultId}` : ""
  const dedupeMap = getOutgoingGroupSendDedupeMap()
  if (dedupeKey && dedupeMap.has(dedupeKey)) {
    if (result && typeof result === "object") {
      try {
        result[OUTGOING_GROUP_SEND_MARK] = true
      } catch {}
    }
    return false
  }

  const selfId = getRuntimeBotSelfId(bot)
  const remembered = rememberRuntimeLastGroupMessage({
    group_id: gid,
    user_id: selfId,
    sender_id: selfId,
    self_id: selfId,
    message,
    isMaster: false,
    isBot: true,
    ts: now,
  })

  if (dedupeKey && remembered) dedupeMap.set(dedupeKey, now)
  if (result && typeof result === "object") {
    try {
      result[OUTGOING_GROUP_SEND_MARK] = true
    } catch {}
  }
  return remembered
}

function patchMethodOnce(target, methodName, patchKey, wrapFn) {
  if (!target || typeof target !== "object") return
  const current = target[methodName]
  if (typeof current !== "function") return
  if (current?.[patchKey]) return

  const raw = current
  const wrapped = wrapFn(raw)
  try {
    wrapped[patchKey] = true
    wrapped.__xunlu_raw = raw
  } catch {}
  target[methodName] = wrapped
}

function installIcqqRuntimeGroupSendHooks(bot) {
  if (!bot || typeof bot !== "object") return
  if (globalThis.__xunlu_icqq_runtime_group_send_hooks_installed) return

  const tryGetProto = fn => {
    try {
      const obj = fn()
      if (!obj) return null
      return Object.getPrototypeOf(obj)
    } catch {
      return null
    }
  }

  const patchGroupProto = proto => {
    patchMethodOnce(proto, "sendMsg", "__xunlu_runtime_group_send_hook", raw => {
      return async function patchedGroupSendMsg(content, ...args) {
        const res = await raw.call(this, content, ...args)
        rememberOutgoingGroupMessage({
          bot: this?.c || bot,
          groupId: this?.gid ?? this?.group_id,
          message: content,
          result: res,
        })
        return res
      }
    })
  }

  const patchBotMethods = targetBot => {
    if (!targetBot || typeof targetBot !== "object") return

    patchMethodOnce(targetBot, "sendGroupMsg", "__xunlu_runtime_send_group_msg_hook", raw => {
      return async function patchedSendGroupMsg(group_id, message, ...args) {
        const res = await raw.call(this, group_id, message, ...args)
        rememberOutgoingGroupMessage({
          bot: this || targetBot,
          groupId: group_id,
          message,
          result: res,
        })
        return res
      }
    })

    patchMethodOnce(targetBot, "sendMsg", "__xunlu_runtime_send_msg_hook", raw => {
      return async function patchedSendMsg(target, message, ...args) {
        const res = await raw.call(this, target, message, ...args)
        const groupId = getGroupIdFromSendTarget(target)
        if (groupId !== undefined && groupId !== null) {
          rememberOutgoingGroupMessage({
            bot: this || targetBot,
            groupId,
            message,
            result: res,
          })
        }
        return res
      }
    })
  }

  const mainBot = bot
  const subBot = bot?.botQQ ? bot?.[bot.botQQ] : null
  const seedId = toFiniteId(mainBot?.uin ?? subBot?.uin ?? 10000)

  patchGroupProto(tryGetProto(() => mainBot?.pickGroup?.(seedId)))
  patchBotMethods(mainBot)

  if (subBot && subBot !== mainBot) {
    patchGroupProto(tryGetProto(() => subBot?.pickGroup?.(seedId)))
    patchBotMethods(subBot)
  }

  globalThis.__xunlu_icqq_runtime_group_send_hooks_installed = true
}

function resolveLiveProtocol(ctx, runtimeBot) {
  const candidates = [
    ctx?.protocol,
    ctx?.adapterType,
    ctx?.bot?.adapter?.name,
    ctx?.bot?.adapterType,
    runtimeBot?.adapterType,
    runtimeBot?.adapter?.name,
    runtimeBot?.[runtimeBot?.botQQ]?.adapter?.name,
    runtimeBot?.[runtimeBot?.botQQ]?.adapterType,
    BotEnv,
  ]

  for (const candidate of candidates) {
    const normalized = normalizeProtocolName(candidate)
    if (normalized === "onebotv11" || normalized === "milky" || normalized === "icqq") {
      return normalized
    }
  }

  return "icqq"
}

const sendMessage = async (ctx, message) => {
  try {
    const runtimeBot = globalThis.__xunlu_runtime_bot || pluginLoader.Bot || globalThis.Bot
    const protocol = resolveLiveProtocol(ctx, runtimeBot)

    const pickPrivate = userId => {
      const uid = Number(userId)
      if (!Number.isFinite(uid)) return null
      if (typeof runtimeBot?.pickFriend === "function") return runtimeBot.pickFriend(uid)
      if (typeof runtimeBot?.pickUser === "function") return runtimeBot.pickUser(uid)
      return null
    }

    const rawList = Array.isArray(message) ? message : message ? [message] : []

    if (protocol === "onebotv11" && rawList.some(i => i?.type === "node")) {
      if (typeof ctx === "string" || typeof ctx === "number") {
        const target = pickPrivate(ctx)
        if (!target) throw new Error("invalid private target (pickFriend/pickUser not available)")
        return await target.sendMsg(rawList)
      }
      if (ctx?.group_id) {
        if (typeof runtimeBot?.pickGroup !== "function") {
          throw new Error("invalid group target (pickGroup not available)")
        }
        return await runtimeBot.pickGroup(Number(ctx.group_id)).sendMsg(rawList)
      }
    }

    const universalMsg =
      message instanceof UniversalMessage ? message : coerceToUniversalMessage(message)

    const outSegments = protocol === "milky" ? universalMsg.segments : universalMsg.convertTo(protocol)

    if (typeof ctx === "string" || typeof ctx === "number") {
      const target = pickPrivate(ctx)
      if (!target) throw new Error("invalid private target (pickFriend/pickUser not available)")
      return await target.sendMsg(outSegments)
    }

    if (ctx?.group_id) {
      if (typeof runtimeBot?.pickGroup !== "function") {
        throw new Error("invalid group target (pickGroup not available)")
      }
      return await runtimeBot.pickGroup(Number(ctx.group_id)).sendMsg(outSegments)
    }

    if (ctx?.user_id) {
      const target = pickPrivate(ctx.user_id)
      if (!target) throw new Error("invalid private target (pickFriend/pickUser not available)")
      return await target.sendMsg(outSegments)
    }

    throw new Error("invalid send target")
  } catch (err) {
    console.error("[sendMessage] failed:", err)
    return null
  }
}
try {
  sendMessage.__xunlu_legacy_sendMessage = true
} catch {}

const filemag = new Filemage(fileURLToPath(new URL("./Event", import.meta.url)))

export default class EventListener {
  /**
   * 事件监听基类。
   *
   * 各事件文件只描述要监听的 event/prefix/once，
   * 真正的协议绑定和 Bot Core 调度都由 ListenerLoader 统一注入。
   */
  constructor(data) {
    this.prefix = data.prefix || ""
    this.event = data.event
    this.once = data.once || false
    this.plugins = pluginLoader
  }
}

class ListenerLoader {
  constructor(options = {}) {
    this.binding = options.binding || createIcqqBinding()
  }

  checkEnv() {
    return this.binding.detectEnv(this.client)
  }

  async bindEvent(e, env) {
    return await this.binding.decorateBindEvent(e, {
      envName: env,
      client: this.client,
      pluginLoader,
      fileManager: filemag,
      sendMessage,
    })
  }

  async load(client) {
    this.client = client
    pluginLoader.Bot = client
    globalThis.__xunlu_runtime_bot = client

    const botenv = this.checkEnv()
    BotEnv = botenv
    if (botenv === "icqq") {
      installIcqqRuntimeGroupSendHooks(this.client)
    }

    const bindEvent = { reply: pluginLoader.reply.bind(pluginLoader) }
    await this.bindEvent(bindEvent, botenv)
    pluginLoader.bindEvent = bindEvent

    const universalOverride = [
      "getLoginInfo",
      "getFriendList",
      "getFriendInfo",
      "getGroupList",
      "getGroupInfo",
      "setGroupName",
      "setGroupMemberCard",
      "setGroupMemberAdmin",
      "setGroupMemberSpecialTitle",
      "setGroupWholeMute",
      "kickGroupMember",
      "quitGroup",
      "acceptFriendRequest",
      "rejectFriendRequest",
      "sendGroupMessageReaction",
      "acceptGroupRequest",
      "rejectGroupRequest",
      "getUserInfo",
      "getGroupMemberList",
      "getGroupMemberInfo",
      "setGroupMemberMute",
      "pickUser",
    ]

    applyUniversalBotApi(bindEvent, { bot: pluginLoader, adapterHint: botenv, override: universalOverride })
    try {
      applyUniversalBotApi(Bot, { bot: pluginLoader, adapterHint: botenv, override: universalOverride, exclude: ["sendApi", "callApi"] })
    } catch {}

    await pluginLoader.initBot()
    await pluginLoader.runMount()

    const runtimeBot = this.binding.decorateRuntimeBot({
      bot: globalThis.Bot,
      envName: botenv,
      pluginLoader,
      fileManager: filemag,
      sendMessage,
    })
    globalThis.__xunlu_runtime_bot = runtimeBot
    globalThis.Bot = runtimeBot

    const files = filemag.GetfileList().filter(file => file.endsWith(".js"))
    for (let File of files) {
      try {
        let listener = await import(`./Event/${File}`)

        if (!listener.default) continue
        listener = new listener.default()
        listener.client = this.client
        const on = listener.once ? "once" : "on"

        if (lodash.isArray(listener.event)) {
          listener.event.forEach(type => {
            const e = listener[type] ? type : "execute"
            this.client[on](listener.prefix + type, async event => {
              await this.bindEvent(event, botenv)
              return listener[e](event)
            })
          })
        } else {
          const e = listener[listener.event] ? listener.event : "execute"
          this.client[on](listener.prefix + listener.event, async event => {
            await this.bindEvent(event, botenv)
            return listener[e](event)
          })
        }
      } catch (e) {
        logger.mark(`监听事件错误：${File}`)
        logger.error(e)
      }
    }
  }

  getBotCore() {
    return pluginLoader
  }

  getRuntimeBot() {
    return globalThis.Bot || this.client || null
  }

  getStatus() {
    const protocol = BotEnv === "OneBotv11" ? "onebotv11" : BotEnv === "milky" ? "milky" : "icqq"
    return {
      protocol,
      adapterType: BotEnv,
      pluginCount: Object.keys(pluginLoader.plugins || {}).length,
      plugins: Object.keys(pluginLoader.plugins || {}),
    }
  }

  async reloadPlugins(options = {}) {
    return await pluginLoader.reloadBotPlugins(options)
  }

  async simulateIncoming(payload) {
    const protocol = BotEnv === "OneBotv11" ? "onebotv11" : BotEnv === "milky" ? "milky" : "icqq"
    return await simulateIncomingMessage({
      bot: pluginLoader,
      protocol,
      adapterType: BotEnv,
      payload,
      selfId: this.client?.uin,
    })
  }

  dispose() {
    return true
  }
}

export { ListenerLoader }
