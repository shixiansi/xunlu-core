import cfg from "../../lib/config.js"
import { coerceToUniversalMessage } from "./context.js"
import { UniversalSegmentType } from "./universal-message.js"

function toInt(value) {
  if (value === undefined || value === null) return undefined
  const v = typeof value === "string" ? value.trim() : value
  if (v === "") return undefined
  const num = Number(v)
  return Number.isFinite(num) ? num : undefined
}

function pickFirst(arr) {
  return Array.isArray(arr) && arr.length ? arr[0] : undefined
}

function snapshotValue(value) {
  try {
    return structuredClone(value)
  } catch {
    try {
      return JSON.parse(JSON.stringify(value))
    } catch {
      return value
    }
  }
}

export function renderUniversalSegments(segments) {
  if (!Array.isArray(segments)) return ""
  const parts = []
  for (const seg of segments) {
    if (!seg || typeof seg !== "object") continue
    switch (seg.type) {
      case UniversalSegmentType.TEXT:
        parts.push(seg.data?.text ?? seg.data?.content ?? "")
        break
      case UniversalSegmentType.MENTION:
        parts.push(`@${seg.data?.qq ?? seg.data?.target ?? ""}`)
        break
      case UniversalSegmentType.MENTION_ALL:
        parts.push("@全体")
        break
      case UniversalSegmentType.EMOJI:
        parts.push(`[face:${seg.data?.id ?? ""}]`)
        break
      case UniversalSegmentType.REPLY:
        parts.push(`[reply:${seg.data?.id ?? seg.data?.msgId ?? seg.data?.seq ?? ""}]`)
        break
      case UniversalSegmentType.IMAGE:
        parts.push(`[image:${seg.data?.file ?? seg.data?.url ?? seg.data?.fileId ?? ""}]`)
        break
      case UniversalSegmentType.FILE:
        parts.push(
          `[file:${seg.data?.name ?? seg.data?.file ?? seg.data?.url ?? seg.data?.fileId ?? ""}]`,
        )
        break
      case UniversalSegmentType.VOICE:
        parts.push(`[record:${seg.data?.file ?? seg.data?.url ?? seg.data?.fileId ?? ""}]`)
        break
      case UniversalSegmentType.VIDEO:
        parts.push(`[video:${seg.data?.file ?? seg.data?.url ?? seg.data?.fileId ?? ""}]`)
        break
      case UniversalSegmentType.FORWARD:
        parts.push(`[forward:${seg.data?.id ?? seg.data?.summary ?? "forward"}]`)
        break
      default:
        parts.push(`[${seg.type}]`)
        break
    }
  }
  return parts.join("")
}

function resolveEventSpec(rawEvent, payload = {}) {
  const payloadEvent =
    payload.event_name ??
    payload.eventName ??
    payload.event ??
    payload.event_type ??
    payload.eventType ??
    ""

  const eventText = String(rawEvent || payloadEvent || "").trim().toLowerCase()
  if (!eventText) {
    const sceneRaw = payload.scene || payload.message_scene || ""
    const scene =
      String(sceneRaw).toLowerCase() === "private" || String(sceneRaw).toLowerCase() === "friend"
        ? "private"
        : payload.group_id ?? payload.groupId
          ? "group"
          : "private"
    return {
      eventName: `message.${scene}.normal`,
      post_type: "message",
      middle: scene,
      sub_type: "normal",
    }
  }

  const parts = eventText.split(".").filter(Boolean)
  if (parts.length < 3) {
    throw new Error(`invalid event name: ${eventText}`)
  }

  const [post_type, middle, ...rest] = parts
  if (!["message", "notice", "request"].includes(post_type)) {
    throw new Error(`unsupported post_type: ${post_type}`)
  }

  return {
    eventName: [post_type, middle, ...rest].join("."),
    post_type,
    middle,
    sub_type: rest.join(".") || "normal",
  }
}

function buildCommonSyntheticEvent({
  eventSpec,
  protocol,
  adapterType,
  payload = {},
  selfId,
  masters = [],
}) {
  const botCfg = cfg.getConfig("bot") || {}
  const isMessage = eventSpec.post_type === "message"
  const isGroup = eventSpec.middle === "group"
  const isPrivate = !isGroup

  const defaultUserId =
    toInt(payload.user_id) ??
    toInt(payload.userId) ??
    (payload.asMaster === false
      ? undefined
      : toInt(botCfg.ctl_default_user_id) ?? toInt(pickFirst(masters))) ??
    10000

  const defaultGroupId =
    toInt(payload.group_id) ?? toInt(payload.groupId) ?? toInt(botCfg.ctl_default_group_id) ?? 10000

  const now = Date.now()
  const seq = Number(now % 100000000)
  const messageId = String(now)
  const botSelfId = selfId !== undefined ? selfId : toInt(payload.self_id) ?? toInt(global.Bot?.uin) ?? 0

  const rawUserId =
    toInt(payload.user_id ?? payload.userId ?? payload.sender_id ?? payload.senderId) ?? defaultUserId
  const userId = isMessage && String(rawUserId) === String(botSelfId) ? rawUserId + 1 : rawUserId
  const groupId = isGroup ? toInt(payload.group_id ?? payload.groupId ?? defaultGroupId) : undefined
  const peerId = isGroup ? groupId : userId
  const operatorId = toInt(payload.operator_id ?? payload.operatorId ?? userId)
  const targetId = toInt(payload.target_id ?? payload.targetId ?? payload.receiver_id ?? payload.receiverId ?? userId)
  const comment = payload.comment ?? payload.message ?? payload.request_comment ?? ""
  const flag = payload.flag ?? payload.notification_seq ?? payload.notificationSeq

  const baseEvent = {
    protocol,
    adapterType,
    post_type: eventSpec.post_type,
    sub_type: eventSpec.sub_type,
    time: Math.floor(now / 1000),
    self_id: botSelfId,
    user_id: userId,
    sender_id: userId,
    group_id: groupId,
    peer_id: peerId,
    operator_id: operatorId,
    target_id: targetId,
    receiver_id: targetId,
    flag,
    comment,
    message_id: messageId,
    seq,
    message_seq: seq,
    messageRef: { msgId: messageId, seq },
    group_name: groupId ? String(botCfg.ctl_default_group_name || groupId) : undefined,
    sender: { user_id: userId, nickname: "CLI", card: "CLI" },
    ...(isGroup
      ? { group_member: { user_id: userId, nickname: "CLI", card: "CLI", role: "member" } }
      : { friend: { user_id: userId, nickname: "CLI", remark: "CLI" } }),
  }

  if (eventSpec.post_type === "message") {
    baseEvent.message_type = eventSpec.middle
    baseEvent.message_scene = isGroup ? "group" : "friend"
  } else if (eventSpec.post_type === "notice") {
    baseEvent.notice_type = eventSpec.middle
  } else if (eventSpec.post_type === "request") {
    baseEvent.request_type = eventSpec.middle
  }

  return baseEvent
}

export async function simulateIncomingEvent({
  bot,
  protocol,
  adapterType,
  event,
  payload = {},
  selfId,
  bindEvent,
}) {
  if (!bot || typeof bot.deal !== "function") {
    throw new Error("simulateIncomingEvent requires bot instance with deal()")
  }

  const masters = (typeof bot.getMaster === "function" ? await bot.getMaster() : []) || []
  const eventSpec = resolveEventSpec(event, payload)
  const bindObj = bindEvent && typeof bindEvent === "object" ? bindEvent : null
  const replies = []

  const baseEvent = buildCommonSyntheticEvent({
    eventSpec,
    protocol,
    adapterType,
    payload,
    selfId,
    masters,
  })

  const rawSegmentsOverride =
    payload.rawSegments ??
    payload.raw_segments ??
    payload.segments ??
    payload.rawSegmentsOverride ??
    undefined

  const incoming = payload.message ?? payload.text ?? payload.msg ?? ""
  const useRawSegments = Array.isArray(rawSegmentsOverride)
  const universalMsg =
    eventSpec.post_type === "message" && !useRawSegments ? coerceToUniversalMessage(incoming) : null

  const e = {
    ...baseEvent,
    __xunluThrowCommandError: true,
    raw_message: eventSpec.post_type === "message" ? String(incoming) : String(payload.raw_message ?? ""),
    ...(eventSpec.post_type === "message"
      ? {
          message: useRawSegments ? rawSegmentsOverride : universalMsg.segments,
          segments: useRawSegments ? rawSegmentsOverride : undefined,
          rawSegments: useRawSegments ? rawSegmentsOverride : undefined,
          universalMessage: universalMsg || undefined,
        }
      : {}),

    sendMessage: async (targetOrCtx, msg) => {
      replies.push(msg)

      if (bindObj) {
        if (typeof bindObj.sendMsg === "function") {
          return await bindObj.sendMsg(targetOrCtx, msg)
        }
        if (typeof bindObj.sendMessage === "function") {
          return await bindObj.sendMessage(targetOrCtx, msg)
        }
      }

      return { seq: Number(Date.now() % 100000000), message_id: String(Date.now()) }
    },

    recallMessage: async () => true,
    sendGroupMessageReaction: async () => true,
    getMsg: async () => null,
    getReplyMsg: async () => null,
  }

  if (bindObj) {
    const skipKeys = new Set([
      "adapterType",
      "comment",
      "flag",
      "friend",
      "getMessage",
      "getReplyMessage",
      "group_id",
      "group_member",
      "group_name",
      "message",
      "message_id",
      "message_type",
      "message_seq",
      "messageRef",
      "notice_type",
      "operator_id",
      "peer_id",
      "post_type",
      "protocol",
      "rawSegments",
      "raw_message",
      "receiver_id",
      "reply",
      "request_type",
      "segments",
      "self_id",
      "sendMessage",
      "sender",
      "sender_id",
      "seq",
      "sub_type",
      "target_id",
      "time",
      "universalMessage",
      "user_id",
    ])
    for (const [key, value] of Object.entries(bindObj)) {
      if (skipKeys.has(key)) continue
      if (value === undefined) continue
      e[key] = value
    }
  }

  if (payload.protocolPayload && typeof payload.protocolPayload === "object") {
    Object.assign(e, payload.protocolPayload)
  }
  if (payload.extra && typeof payload.extra === "object") {
    Object.assign(e, payload.extra)
  }

  const startedAt = Date.now()
  let res
  let thrown = null
  try {
    res = await bot.deal(e)
  } catch (error) {
    thrown = error
  }
  const tookMs = Date.now() - startedAt

  const renderedReplies = replies.map(m => {
    if (typeof m === "string") return { text: m, message: m }
    if (Array.isArray(m)) return { text: renderUniversalSegments(m), message: m }
    if (m && typeof m === "object" && Array.isArray(m.message)) {
      return { text: renderUniversalSegments(m.message), message: m.message }
    }
    return { text: renderUniversalSegments([m]), message: m }
  })

  const warnings = Array.isArray(bindObj?.warnings) ? bindObj.warnings : []
  const errors = Array.isArray(bindObj?.errors) ? [...bindObj.errors] : []
  if (thrown) {
    const text = thrown?.stack || thrown?.message || String(thrown)
    if (!errors.includes(text)) errors.push(text)
  }
  const apiCalls = Array.isArray(bindObj?.calls) ? bindObj.calls.map(snapshotValue) : []
  const renderCalls = Array.isArray(bindObj?.renderCalls) ? bindObj.renderCalls.map(snapshotValue) : []
  const ok = errors.length === 0

  return {
    ok,
    event: eventSpec.eventName,
    protocol,
    adapterType,
    scene: eventSpec.middle,
    user_id: e.user_id,
    group_id: e.group_id,
    input: eventSpec.post_type === "message" ? String(incoming) : undefined,
    replies: renderedReplies,
    ...(ok ? {} : { error: errors[0] || (thrown?.message ?? String(thrown)) }),
    apiCalls,
    renderCalls,
    warnings,
    errors,
    tookMs,
    result: res,
  }
}

export async function simulateIncomingMessage({
  bot,
  protocol,
  adapterType,
  payload = {},
  selfId,
  bindEvent,
}) {
  return await simulateIncomingEvent({
    bot,
    protocol,
    adapterType,
    event: payload.event ?? payload.event_name ?? payload.eventName ?? undefined,
    payload,
    selfId,
    bindEvent,
  })
}
