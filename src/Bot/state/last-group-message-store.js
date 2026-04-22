import { coerceToUniversalMessage } from "../message/context.js"

const BOT_STREAK_MAX = 10
const BOT_STREAK_DEDUPE_WINDOW_MS = 2000

function toId(value) {
  if (value === undefined || value === null) return ""
  return String(value).trim()
}

function normalizeSegments(message) {
  try {
    const universal = coerceToUniversalMessage(message)
    return Array.isArray(universal?.segments) ? universal.segments : []
  } catch {
    return []
  }
}

function messageKey(message) {
  try {
    return JSON.stringify(message)
  } catch {
    return ""
  }
}

export function getRuntimeLastGroupMessageMap() {
  if (!(globalThis.__xunlu_last_group_message_map instanceof Map)) {
    globalThis.__xunlu_last_group_message_map = new Map()
  }
  return globalThis.__xunlu_last_group_message_map
}

export function getRuntimeBotGroupMessageStreakMap() {
  if (!(globalThis.__xunlu_bot_group_message_streak_map instanceof Map)) {
    globalThis.__xunlu_bot_group_message_streak_map = new Map()
  }
  return globalThis.__xunlu_bot_group_message_streak_map
}

function trimMapSize(map, maxSize = 500) {
  if (!(map instanceof Map)) return
  while (map.size > maxSize) {
    const firstKey = map.keys().next()
    if (firstKey.done) break
    map.delete(firstKey.value)
  }
}

function updateRuntimeBotGroupMessageStreak(gid, record) {
  const map = getRuntimeBotGroupMessageStreakMap()
  if (!record?.isBot) {
    map.delete(gid)
    return
  }

  const prev = Array.isArray(map.get(gid)) ? [...map.get(gid)] : []
  const prevLast = prev[prev.length - 1]
  const isDuplicateLast =
    prevLast &&
    prevLast.senderId === record.senderId &&
    messageKey(prevLast.message) === messageKey(record.message) &&
    Math.abs(Number(record.ts || 0) - Number(prevLast.ts || 0)) <= BOT_STREAK_DEDUPE_WINDOW_MS

  if (isDuplicateLast) {
    prev[prev.length - 1] = record
  } else {
    prev.push(record)
  }

  if (prev.length > BOT_STREAK_MAX) {
    prev.splice(0, prev.length - BOT_STREAK_MAX)
  }

  map.set(gid, prev)
  trimMapSize(map)
}

export function rememberRuntimeLastGroupMessage(input = {}) {
  const gid = toId(input.group_id ?? input.groupId)
  if (!gid) return false

  const message = normalizeSegments(input.message)
  if (!message.length) return false

  const senderId = toId(input.user_id ?? input.userId ?? input.sender_id ?? input.senderId)
  const selfId = toId(input.self_id ?? input.selfId)
  const map = getRuntimeLastGroupMessageMap()
  const record = {
    message,
    senderId,
    selfId,
    isMaster: Boolean(input.isMaster),
    isBot: Boolean(input.isBot ?? (senderId && selfId && senderId === selfId)),
    ts: Number(input.ts) || Date.now(),
  }
  map.set(gid, record)
  trimMapSize(map)
  updateRuntimeBotGroupMessageStreak(gid, record)

  return true
}

export function getRuntimeLastGroupMessage(groupId) {
  const gid = toId(groupId)
  if (!gid) return null
  return getRuntimeLastGroupMessageMap().get(gid) || null
}

export function getRuntimeBotGroupMessageStreak(groupId) {
  const gid = toId(groupId)
  if (!gid) return []
  const list = getRuntimeBotGroupMessageStreakMap().get(gid)
  return Array.isArray(list) ? [...list] : []
}
