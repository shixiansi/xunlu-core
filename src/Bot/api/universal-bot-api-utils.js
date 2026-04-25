import { extractMemberRoleFlags } from "../role/index.js"
import { rememberRuntimeLastGroupMessage } from "../state/index.js"

/**
 * 通用 Bot API 的底层工具集合。
 *
 * 这些方法原先全部堆在 `universal-bot-api.js` 顶部，
 * 现在统一抽到独立模块，方便后续继续按能力拆分。
 */

export function getRuntimeBotOrNull() {
  if (globalThis.__xunlu_runtime_bot) return globalThis.__xunlu_runtime_bot
  try {
    // eslint-disable-next-line no-undef
    return Bot || globalThis.Bot || null
  } catch {
    return globalThis.Bot || null
  }
}

export function toInt(value) {
  if (value === undefined || value === null) return undefined
  const v = typeof value === "string" ? value.trim() : value
  if (v === "") return undefined
  const num = Number(v)
  return Number.isFinite(num) ? num : undefined
}

export function getSelfIdFromTarget(ctx, runtimeBot) {
  return (
    toInt(ctx?.self_id) ??
    toInt(ctx?.bot?.uin) ??
    toInt(ctx?.bot?.self_id) ??
    toInt(runtimeBot?.uin) ??
    toInt(runtimeBot?.self_id) ??
    toInt(runtimeBot?.user_id) ??
    toInt(runtimeBot?.botQQ)
  )
}

export function getFastMemberRoleFlags(ctx, userId) {
  if (!ctx || userId === undefined || userId === null) return null
  const uid = toInt(userId)
  if (uid === undefined) return null

  const currentUserId = toInt(ctx?.user_id ?? ctx?.sender_id)
  if (currentUserId === undefined || currentUserId !== uid) return null

  return (
    extractMemberRoleFlags(ctx?.member) ??
    extractMemberRoleFlags(ctx?.group_member) ??
    extractMemberRoleFlags(ctx?.sender) ??
    extractMemberRoleFlags({
      role: ctx?.isOwner ? "owner" : ctx?.isAdmin ? "admin" : "",
      is_owner: ctx?.isOwner,
      is_admin: ctx?.isAdmin,
    })
  )
}

export function getFastBotRoleFlags(ctx) {
  if (!ctx || typeof ctx !== "object") return null
  return (
    extractMemberRoleFlags(ctx?.botMember) ??
    extractMemberRoleFlags({
      role: ctx?.botRole,
      is_owner: ctx?.botIsOwner,
      is_admin: ctx?.botIsAdmin,
    })
  )
}

export function normalizeProtocol(value) {
  const v = String(value || "").toLowerCase()
  if (v.includes("onebot")) return "onebotv11"
  if (v.includes("milky")) return "milky"
  if (v.includes("icqq")) return "icqq"
  if (v === "onebotv11") return "onebotv11"
  if (v === "milky") return "milky"
  if (v === "icqq") return "icqq"
  return "icqq"
}

function pickProtocolIdentity(raw) {
  const value = String(raw || "").toLowerCase()
  if (!value) return ""
  if (value.includes("onebot") || value.includes("milky") || value.includes("icqq")) {
    return value
  }
  return ""
}

function getAdapterIdentity(target) {
  if (!target || typeof target !== "object") return ""
  return pickProtocolIdentity(
    target?.adapter?.name ?? target?.adapterType ?? target?.adapter_name ?? target?.constructor?.name,
  )
}

function getSubAdapterIdentity(target) {
  if (!target || typeof target !== "object") return ""
  const botQQ = target.botQQ
  if (botQQ === undefined || botQQ === null) return ""
  const subBot = target[botQQ]
  return pickProtocolIdentity(
    subBot?.adapter?.name ??
      subBot?.adapterType ??
      subBot?.adapter_name ??
      subBot?.constructor?.name,
  )
}

export function resolveProtocol({ ctx, bot, runtimeBot, adapterHint } = {}) {
  const fromCtx = ctx && typeof ctx.protocol === "string" ? String(ctx.protocol).toLowerCase() : ""
  if (fromCtx) return normalizeProtocol(fromCtx)

  const fromCtxAdapter =
    ctx && typeof ctx.adapterType === "string" ? String(ctx.adapterType).toLowerCase() : ""
  if (fromCtxAdapter) return normalizeProtocol(fromCtxAdapter)

  const fromCtxBot = getAdapterIdentity(ctx?.bot)
  if (fromCtxBot) return normalizeProtocol(fromCtxBot)

  const fromCtxBotSubAdapter = getSubAdapterIdentity(ctx?.bot)
  if (fromCtxBotSubAdapter) return normalizeProtocol(fromCtxBotSubAdapter)

  const fromRuntime = getAdapterIdentity(runtimeBot)
  if (fromRuntime) return normalizeProtocol(fromRuntime)

  const runtimeSubAdapterName = getSubAdapterIdentity(runtimeBot)
  if (runtimeSubAdapterName) return normalizeProtocol(runtimeSubAdapterName)

  const fromBot =
    bot && typeof bot.adapter === "string" ? String(bot.adapter).toLowerCase() : getAdapterIdentity(bot)
  if (fromBot) return normalizeProtocol(fromBot)

  const fromBotSubAdapter = getSubAdapterIdentity(bot)
  if (fromBotSubAdapter) return normalizeProtocol(fromBotSubAdapter)

  const fromHint = adapterHint ? String(adapterHint).toLowerCase() : ""
  if (fromHint) return normalizeProtocol(fromHint)

  return "icqq"
}

export function getRawMethod(runtimeBot, methodName, selfFn) {
  if (!runtimeBot || (typeof runtimeBot !== "object" && typeof runtimeBot !== "function")) {
    return null
  }

  const rawKey = `__xunlu_raw_${methodName}`
  const raw = runtimeBot?.[rawKey]
  if (typeof raw === "function") return raw

  const fn = runtimeBot?.[methodName]
  if (typeof fn === "function") {
    if (fn === selfFn) return null
    if (fn?.__xunlu_universal) return null
    return fn
  }

  return null
}

export function rememberOutgoingGroupMessage(sendTarget, message, { ctx, runtimeBot } = {}) {
  const groupId = sendTarget?.group_id
  if (groupId === undefined || groupId === null) return
  const selfId =
    ctx?.self_id ??
    runtimeBot?.self_id ??
    runtimeBot?.uin ??
    runtimeBot?.user_id ??
    runtimeBot?.botQQ ??
    ""
  rememberRuntimeLastGroupMessage({
    group_id: groupId,
    user_id: selfId,
    sender_id: selfId,
    self_id: selfId,
    message,
    isMaster: false,
    isBot: true,
  })
}

export function getYunzaiSendApi(runtimeBot) {
  if (!runtimeBot || typeof runtimeBot !== "object") return null
  if (typeof runtimeBot.sendApi === "function" && !runtimeBot.sendApi?.__xunlu_universal) {
    return runtimeBot.sendApi.bind(runtimeBot)
  }

  const qq = runtimeBot.botQQ
  if (!qq) return null
  const sub = runtimeBot[qq]
  if (sub && typeof sub.sendApi === "function") return sub.sendApi.bind(sub)
  return null
}

export function normalizeApiActionName(protocol, action) {
  if (action === undefined || action === null) return ""
  let out = String(action).trim()
  while (out.startsWith("/")) out = out.slice(1)
  if (protocol === "milky" && out.startsWith("api/")) out = out.slice("api/".length)
  return out
}

export function normalizeTarget(target, fallbackCtx) {
  const ctx = fallbackCtx && typeof fallbackCtx === "object" ? fallbackCtx : null

  if (typeof target === "string" || typeof target === "number") {
    return { scene: "private", user_id: target }
  }

  if (target && typeof target === "object") {
    const gid = target.group_id ?? target.groupId
    if (gid !== undefined && gid !== null) return { scene: "group", group_id: gid }

    const uid = target.user_id ?? target.userId
    if (uid !== undefined && uid !== null) return { scene: "private", user_id: uid }
  }

  if (ctx) {
    if (ctx.group_id !== undefined && ctx.group_id !== null) {
      return { scene: "group", group_id: ctx.group_id }
    }
    if (ctx.user_id !== undefined && ctx.user_id !== null) {
      return { scene: "private", user_id: ctx.user_id }
    }
  }

  throw new Error("[sendMessage] invalid target")
}

export function hasOnebotNodeSegments(message) {
  const list = Array.isArray(message) ? message : message ? [message] : []
  return list.some(i => i && typeof i === "object" && i.type === "node")
}

export function hasMilkyForwardSegments(message) {
  const list = Array.isArray(message) ? message : message ? [message] : []
  return list.some(
    i => i && typeof i === "object" && i.type === "forward" && Array.isArray(i?.data?.messages),
  )
}

export function toSendTargetObject(t) {
  if (!t || typeof t !== "object") return t
  if (t.group_id !== undefined && t.group_id !== null) {
    const gid = toInt(t.group_id) ?? t.group_id
    return { group_id: gid }
  }
  if (t.user_id !== undefined && t.user_id !== null) {
    const uid = toInt(t.user_id) ?? t.user_id
    return String(uid)
  }
  return t
}

export function toMemberMap(listOrMap) {
  if (!listOrMap) return new Map()
  if (listOrMap instanceof Map) return listOrMap

  if (Array.isArray(listOrMap)) {
    return new Map(listOrMap.map(item => [item?.user_id ?? item?.uin ?? item?.id, item]))
  }

  if (typeof listOrMap === "object" && Array.isArray(listOrMap.members)) {
    return new Map(listOrMap.members.map(item => [item?.user_id ?? item?.uin ?? item?.id, item]))
  }

  if (typeof listOrMap === "object") {
    const values = Object.values(listOrMap)
    if (Array.isArray(values) && values.every(v => v && typeof v === "object")) {
      return new Map(values.map(item => [item?.user_id ?? item?.uin ?? item?.id, item]))
    }
  }

  return new Map()
}

export function toKeyMap(listOrMap, key) {
  if (!listOrMap) return new Map()
  if (listOrMap instanceof Map) return listOrMap
  if (!Array.isArray(listOrMap)) return new Map()

  const map = new Map()
  for (const item of listOrMap) {
    if (!item || typeof item !== "object") continue
    const id = item[key]
    if (id === undefined || id === null) continue
    map.set(id, item)
  }
  return map
}

export function mapOnebotGroupRequestSubType(input = {}) {
  const subType = input.sub_type ?? input.subType
  if (subType === "add" || subType === "invite") return subType

  const type = input.type ?? input.notification_type ?? input.notificationType
  if (type === "join_request") return "add"
  if (type === "invited_join_request") return "invite"
  if (type === "invite") return "invite"
  return "add"
}

export function mapMilkyNotificationType(input = {}) {
  const t = input.notification_type ?? input.notificationType ?? input.type
  if (t === "join_request" || t === "invited_join_request") return t

  const subType = input.sub_type ?? input.subType
  if (subType === "invite") return "invited_join_request"
  return "join_request"
}
