/**
 * BaseBot 运行时共享工具。
 *
 * 这些工具原先散落在 BaseBot 顶层，拆出来后可以被
 * MessagePipeline / CommandBus / RoleResolver 复用。
 */
export function normalizeEventId(value) {
  if (value === undefined || value === null) return undefined
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined
  const text = String(value).trim()
  if (!text) return undefined
  const num = Number(text)
  return Number.isFinite(num) ? num : text
}

export function normalizeOptionalString(value) {
  const text = String(value ?? "").trim()
  return text || ""
}

export function normalizeProtocolName(value) {
  const text = String(value ?? "")
    .trim()
    .toLowerCase()
  if (!text) return ""
  if (text.includes("milky")) return "milky"
  if (text.includes("onebot")) return "onebotv11"
  if (text.includes("icqq")) return "icqq"
  return text
}

export function resolveSyntheticProtocol({ protocol, baseMessageRecord, adapter, runtimeBot } = {}) {
  const explicit = normalizeProtocolName(protocol)
  if (explicit) return explicit

  const fromBase = normalizeProtocolName(baseMessageRecord?.protocol)
  if (fromBase) return fromBase

  const takeoverProtocol = normalizeProtocolName(runtimeBot?.__xunlu_takeover_state?.protocol)
  if (takeoverProtocol) return takeoverProtocol

  const runtimeAdapter = normalizeProtocolName(runtimeBot?.adapterType)
  if (runtimeAdapter) return runtimeAdapter

  return normalizeProtocolName(adapter)
}

/**
 * 统一补齐 target/operator/sender 相关字段，减少 notice/request 事件分支里的散落修正逻辑。
 */
export function normalizeEventTargetFields(e) {
  if (!e || typeof e !== "object") return

  const targetIdRaw = e.target_id ?? e.targetId ?? e.receiver_id ?? e.receiverId
  const targetId = normalizeEventId(targetIdRaw)

  if (targetId !== undefined) {
    e.target_id = targetId
    e.targetId = targetId
    e.receiver_id = targetId
    e.receiverId = targetId
  }

  const senderIdRaw = e.sender_id ?? e.senderId ?? e.initiator_id ?? e.initiatorId
  const senderId = normalizeEventId(senderIdRaw)
  if (senderId !== undefined) {
    e.sender_id = senderId
    e.senderId = senderId
  }

  const operatorIdRaw = e.operator_id ?? e.operatorId ?? senderId
  const operatorId = normalizeEventId(operatorIdRaw)
  if (operatorId !== undefined) {
    e.operator_id = operatorId
    e.operatorId = operatorId
  }

  if (e.post_type === "notice" && e.sub_type === "poke") {
    const inferredTarget = targetId ?? normalizeEventId(e.user_id)
    if (inferredTarget !== undefined) {
      e.target_id = inferredTarget
      e.targetId = inferredTarget
      e.receiver_id = inferredTarget
      e.receiverId = inferredTarget
    }
    if (senderId !== undefined) e.user_id = senderId
    return
  }

  if (senderId !== undefined) e.user_id = senderId
}
