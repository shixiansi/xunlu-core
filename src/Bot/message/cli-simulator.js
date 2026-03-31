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

function renderUniversalSegments(segments) {
  if (!Array.isArray(segments)) return ""
  const parts = []
  for (const seg of segments) {
    if (!seg || typeof seg !== "object") continue
    switch (seg.type) {
      case UniversalSegmentType.TEXT:
        parts.push(seg.data?.content ?? "")
        break
      case UniversalSegmentType.MENTION:
        parts.push(`@${seg.data?.target ?? ""}`)
        break
      case UniversalSegmentType.MENTION_ALL:
        parts.push("@全体")
        break
      case UniversalSegmentType.EMOJI:
        parts.push(`[face:${seg.data?.id ?? ""}]`)
        break
      case UniversalSegmentType.REPLY:
        parts.push(`[reply:${seg.data?.msgId ?? seg.data?.seq ?? ""}]`)
        break
      case UniversalSegmentType.IMAGE:
        parts.push(`[image:${seg.data?.url ?? seg.data?.fileId ?? ""}]`)
        break
      case UniversalSegmentType.FILE:
        parts.push(`[file:${seg.data?.name ?? seg.data?.url ?? seg.data?.fileId ?? ""}]`)
        break
      case UniversalSegmentType.VOICE:
        parts.push(`[record:${seg.data?.url ?? seg.data?.fileId ?? ""}]`)
        break
      case UniversalSegmentType.VIDEO:
        parts.push(`[video:${seg.data?.url ?? seg.data?.fileId ?? ""}]`)
        break
      default:
        parts.push(`[${seg.type}]`)
        break
    }
  }
  return parts.join("")
}

export async function simulateIncomingMessage({
  bot,
  protocol,
  adapterType,
  payload = {},
  selfId,
  bindEvent,
}) {
  if (!bot || typeof bot.deal !== "function") {
    throw new Error("simulateIncomingMessage requires bot instance with deal()")
  }

  const botCfg = cfg.getConfig("bot") || {}

  const masters = (typeof bot.getMaster === "function" ? await bot.getMaster() : []) || []

  const defaultUserId =
    toInt(payload.user_id) ??
    toInt(payload.userId) ??
    (payload.asMaster === false ? undefined : toInt(botCfg.ctl_default_user_id) ?? toInt(pickFirst(masters))) ??
    10000

  const defaultGroupId =
    toInt(payload.group_id) ??
    toInt(payload.groupId) ??
    toInt(botCfg.ctl_default_group_id) ??
    undefined

  const sceneRaw = payload.scene || payload.message_scene || botCfg.ctl_default_scene || ""
  const scene =
    String(sceneRaw).toLowerCase() === "private" || String(sceneRaw).toLowerCase() === "friend"
      ? "private"
      : defaultGroupId
        ? "group"
        : "private"

  const groupId = scene === "group" ? defaultGroupId || 10000 : undefined

  const incoming = payload.message ?? payload.text ?? payload.msg ?? ""

  const rawSegmentsOverride =
    payload.rawSegments ??
    payload.raw_segments ??
    payload.segments ??
    payload.rawSegmentsOverride ??
    undefined

  const useRawSegments = Array.isArray(rawSegmentsOverride)
  const universalMsg = useRawSegments ? null : coerceToUniversalMessage(incoming)

  const now = Date.now()
  const seq = Number(now % 100000000)
  const messageId = String(now)
  const senderId = defaultUserId
  const botSelfId = selfId !== undefined ? selfId : toInt(payload.self_id) ?? toInt(global.Bot?.uin) ?? 0

  // 防止被 BaseBot.deal() 当作自己发的消息而丢弃
  const safeSenderId = String(senderId) === String(botSelfId) ? senderId + 1 : senderId

  const replies = []
  const bindObj = bindEvent && typeof bindEvent === "object" ? bindEvent : null

  const e = {
    protocol,
    adapterType,
    post_type: "message",
    message_type: scene === "group" ? "group" : "private",
    sub_type: "normal",
    time: Math.floor(now / 1000),
    message_id: messageId,
    seq,
    message_seq: seq,
    self_id: botSelfId,
    raw_message: String(incoming),
    universalMessage: universalMsg || undefined,
    // 当传入 rawSegmentsOverride 时，交给 BaseBot.dealMsg 做协议→通用转换
    message: useRawSegments ? rawSegmentsOverride : universalMsg.segments,
    segments: useRawSegments ? rawSegmentsOverride : undefined,
    rawSegments: useRawSegments ? rawSegmentsOverride : undefined,
    user_id: safeSenderId,
    sender_id: safeSenderId,
    group_id: groupId,
    peer_id: scene === "group" ? groupId : safeSenderId,
    message_scene: scene === "group" ? "group" : "friend",
    group_name: groupId ? String(botCfg.ctl_default_group_name || groupId) : undefined,
    friend: scene === "private" ? { nickname: "CLI" } : undefined,
    sender: { user_id: safeSenderId, nickname: "CLI", card: "CLI" },
    messageRef: { msgId: messageId, seq },

    // 关键：截获 bot 的发消息行为
    sendMessage: async (targetOrCtx, msg) => {
      replies.push(msg)

      // Optional: validate/produce mock send result (without breaking reply capture)
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

    // 常用方法兜底（避免插件报错）
    recallMessage: async () => true,
    sendGroupMessageReaction: async () => true,
    getMsg: async () => null,
    getReplyMsg: async () => null,
    makeGroupForwardMsg: async (_e, msg) => msg,
    renderImg: async () => null,
  }

  // 注入 bindEvent（允许覆盖默认 stub；但保留 sendMessage 以便收集 replies）
  if (bindObj) {
    const skipKeys = new Set(["sendMessage", "reply", "getMessage", "getReplyMessage"])
    for (const [key, value] of Object.entries(bindObj)) {
      if (skipKeys.has(key)) continue
      if (value === undefined) continue
      e[key] = value
    }
  }

  const startedAt = Date.now()
  const res = await bot.deal(e)
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
  const errors = Array.isArray(bindObj?.errors) ? bindObj.errors : []
  const ok = errors.length === 0

  return {
    ok,
    protocol,
    adapterType,
    scene,
    user_id: safeSenderId,
    group_id: groupId,
    input: String(incoming),
    replies: renderedReplies,
    ...(ok ? {} : { error: errors[0] }),
    warnings,
    errors,
    tookMs,
    result: res,
  }
}
