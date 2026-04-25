import _ from "lodash"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { coerceToUniversalMessage } from "../../../Bot/message/index.js"
import { getMemberInfoWithFallback } from "../../../Bot/role/index.js"
import MessageDB from "../../../db/MessageDB.js"
import env from "../../../lib/env.js"
import cfg from "../../../lib/config.js"
import { applyRkeyToUrl, getSceneRkey } from "../../../utils/rkey.js"
import { getSystemNoticeConfig } from "../model/notice-store.js"

const noticeDedupe = new Map()

function toInt(value) {
  if (value === undefined || value === null) return undefined
  const v = typeof value === "string" ? value.trim() : value
  if (v === "") return undefined
  const num = Number(v)
  return Number.isFinite(num) ? Math.floor(num) : undefined
}

function clampText(text, maxLen = 120) {
  const s = String(text || "").trim()
  if (!s) return ""
  if (s.length <= maxLen) return s
  return s.slice(0, maxLen - 1) + "…"
}

function renderUniversalBrief(segments) {
  const list = Array.isArray(segments) ? segments : []
  const parts = []
  for (const seg of list) {
    if (!seg || typeof seg !== "object") continue
    switch (seg.type) {
      case "text":
        parts.push(seg.data?.content ?? "")
        break
      case "at":
        parts.push(`@${seg.data?.target ?? ""}`)
        break
      case "atAll":
        parts.push("@全体")
        break
      case "face":
        parts.push(`[face:${seg.data?.id ?? ""}]`)
        break
      case "reply":
        parts.push("[回复]")
        break
      case "image":
        parts.push("[图片]")
        break
      case "record":
        parts.push("[语音]")
        break
      case "video":
        parts.push("[视频]")
        break
      case "file":
        parts.push(`[文件${seg.data?.name ? `:${seg.data.name}` : ""}]`)
        break
      case "forward":
        parts.push("[转发]")
        break
      default:
        parts.push(`[${seg.type}]`)
        break
    }
  }
  return parts.join("")
}

function shouldSendOnce(key, ttlSec) {
  const k = String(key || "").trim()
  if (!k) return true

  const ttlMs = Math.max(1, Math.floor(Number(ttlSec) || 60)) * 1000
  const now = Date.now()
  const exp = noticeDedupe.get(k)
  if (typeof exp === "number" && exp > now) return false

  noticeDedupe.set(k, now + ttlMs)

  if (noticeDedupe.size > 1500) {
    for (const [kk, ee] of noticeDedupe.entries()) {
      if (typeof ee !== "number" || ee <= now) noticeDedupe.delete(kk)
    }
  }

  return true
}

async function getMasterList() {
  if (env.CurEnv === "QQBot-YunZai") {
    try {
      const mod = await import(pathToFileURL(path.resolve(process.cwd(), "lib", "config", "config.js")).href)
      const ycfg = mod?.default ?? mod
      const masters = ycfg?.masterQQ
      if (Array.isArray(masters) && masters.length) return masters
    } catch {}
  }

  const masters = cfg.getConfig("bot")?.masterQQ
  return Array.isArray(masters) ? masters : []
}

function normalizeNotifyPayloads(message) {
  if (
    message &&
    typeof message === "object" &&
    !Array.isArray(message) &&
    Array.isArray(message.payloads)
  ) {
    return message.payloads.filter(i => i !== undefined && i !== null && i !== false)
  }
  return message === undefined || message === null || message === false ? [] : [message]
}

export async function sendMasterPayload(ctx, uid, message) {
  const proto = String(ctx?.protocol || "").toLowerCase()
  if (isNoticeForwardRelayPayload(message)) {
    const sent = await sendForwardRelayToMaster(ctx, uid, message).catch(err => {
      console.warn("[group] notify master forward relay failed:", err?.message || err)
      return false
    })
    if (sent) return sent
    return false
  }

  if (proto === "onebotv11") {
    const fallbackMsgList = normalizeForwardPayloadForPrivateFallback(ctx, uid, message)
    if (fallbackMsgList.length) {
      return await sendForwardRelayFallbackToMaster(ctx, uid, {}, fallbackMsgList)
    }
  }

  return await sendMasterRawPayload(ctx, uid, message)
}

async function sendMasterRawPayload(ctx, uid, message) {
  if (ctx && typeof ctx.sendMessage === "function") {
    return await ctx.sendMessage(String(uid), message)
  }
  if (ctx && typeof ctx.pickUser === "function") {
    return await ctx.pickUser(uid).sendMsg(message)
  }
  if (typeof Bot?.sendMessage === "function") {
    return await Bot.sendMessage(String(uid), message)
  }
  if (typeof Bot?.pickUser === "function") {
    return await Bot.pickUser(uid).sendMsg(message)
  }
  throw new Error("master notify send API not available")
}

export async function sendToMasters(ctx, message, { dedupeKey } = {}) {
  const sys = getSystemNoticeConfig()
  const ttl = Math.max(1, Math.floor(Number(sys.cache_ttl_sec) || 60))
  if (dedupeKey && !shouldSendOnce(dedupeKey, ttl)) return false

  const payloads = normalizeNotifyPayloads(message)
  if (!payloads.length) return false

  const masters = (await getMasterList()).map(toInt).filter(Boolean)
  if (!masters.length) return false

  const targets = sys.notify_all_masters ? masters : [masters[0]]
  for (const uid of targets) {
    for (const payload of payloads) {
      try {
        await sendMasterPayload(ctx, uid, payload)
      } catch (err) {
        console.warn("[group] notify master failed:", err?.message || err)
      }
    }
  }
  return true
}

export function isTempMessage(ctx) {
  const proto = String(ctx?.protocol || "").toLowerCase()
  if (proto === "milky") return String(ctx?.message_scene || "") === "temp"
  if (proto === "onebotv11") {
    return String(ctx?.message_type || "") === "private" && String(ctx?.sub_type || "") === "group"
  }
  return Boolean(ctx?.group_id) && String(ctx?.message_type || "") === "private"
}

export function getTempGroupId(ctx) {
  return (
    toInt(ctx?.group_id) ?? toInt(ctx?.group?.group_id) ?? toInt(ctx?.group?.groupId) ?? undefined
  )
}

function withTimeout(promise, timeoutMs, timeoutValue = null) {
  const ms = Math.max(1, Math.floor(Number(timeoutMs) || 1))
  return Promise.race([
    Promise.resolve(promise),
    new Promise(resolve => setTimeout(() => resolve(timeoutValue), ms)),
  ])
}

function patchImageSegmentsRkey(segments, rkeySuffix) {
  const list = Array.isArray(segments) ? segments : []
  if (!list.length) return list

  const suffixRaw = String(rkeySuffix || "").trim()
  if (!suffixRaw) return list

  let changed = false
  const out = list.map(seg => {
    if (!seg || typeof seg !== "object") return seg
    if (!["image", "video", "record"].includes(String(seg.type || ""))) return seg

    let next = seg
    let nextData = seg.data
    let dataChanged = false

    if (seg.data && typeof seg.data === "object") {
      const data = seg.data
      const patchedData = { ...data }
      for (const k of ["url", "fileId", "path", "uri", "temp_url", "file"]) {
        if (typeof patchedData[k] !== "string") continue
        const patched = applyRkeyToUrl(patchedData[k], suffixRaw)
        if (patched && patched !== patchedData[k]) {
          patchedData[k] = patched
          dataChanged = true
        }
      }
      if (dataChanged) nextData = patchedData
    }

    let topChanged = false
    const patchedTop = { ...seg }
    for (const k of ["file", "url"]) {
      if (typeof patchedTop[k] !== "string") continue
      const patched = applyRkeyToUrl(patchedTop[k], suffixRaw)
      if (patched && patched !== patchedTop[k]) {
        patchedTop[k] = patched
        topChanged = true
      }
    }

    if (dataChanged || topChanged) {
      changed = true
      if (dataChanged) patchedTop.data = nextData
      next = patchedTop
    }

    return next
  })

  return changed ? out : list
}

export function toForwardSafeSegments(content, { rkeySuffix } = {}) {
  const segments = Array.isArray(content) ? content : content ? [content] : []
  const out = []

  for (const seg of segments) {
    if (!seg) continue

    if (typeof seg === "string" || typeof seg === "number") {
      out.push({ type: "text", data: { text: String(seg) } })
      continue
    }

    if (typeof seg !== "object") {
      out.push({ type: "text", data: { text: String(seg) } })
      continue
    }

    const type = String(seg.type || "")
    const data = seg.data && typeof seg.data === "object" ? seg.data : {}
    if (
      type === "video" &&
      Boolean(data.url || data.fileId || data.path || seg.url || seg.file || seg.fid)
    ) {
      if (rkeySuffix) out.push(patchImageSegmentsRkey([seg], rkeySuffix)[0])
      else out.push(seg)
      continue
    }

    if (type === "video") {
      const duration = data.duration ?? data.seconds
      const extra = duration ? ` ${duration}s` : ""
      out.push({ type: "text", data: { text: `[视频]${extra}` } })
      continue
    }

    if (type === "file") {
      const name = data.name ?? data.file_name ?? seg.name ?? ""
      const size = data.size ?? data.file_size
      const extra = name ? ` ${name}` : ""
      const sizeText = size ? ` (${size})` : ""
      out.push({ type: "text", data: { text: `[文件]${extra}${sizeText}`.trim() } })
      continue
    }

    if (type === "record") {
      const duration = data.duration ?? data.seconds
      const extra = duration ? ` ${duration}s` : ""
      out.push({ type: "text", data: { text: `[语音]${extra}` } })
      continue
    }

    if (type === "forward" || type === "node") {
      out.push({ type: "text", data: { text: "[转发消息]" } })
      continue
    }

    if (type === "image" && rkeySuffix) {
      out.push(patchImageSegmentsRkey([seg], rkeySuffix)[0])
      continue
    }

    out.push(seg)
  }

  return out
}

function getQqAvatarUrl(userId, size = 100) {
  const uid = toInt(userId)
  if (!uid) return ""
  const s = Math.max(40, Math.floor(Number(size) || 100))
  return `https://q1.qlogo.cn/g?b=qq&nk=${uid}&s=${s}`
}

async function getMemberInfoSafe(ctx, groupId, userId) {
  return await getMemberInfoWithFallback(ctx, groupId, userId)
}

function makeNoticeTextSegment(content) {
  return { type: "text", data: { content: String(content || "") } }
}

function makeNoticeImageSegment(url, summary = "") {
  const raw = String(url || "").trim()
  if (!raw) return null
  return {
    type: "image",
    data: {
      url: raw,
      ...(summary ? { summary } : {}),
    },
  }
}

function isResolvableMediaRef(value) {
  const raw = String(value || "").trim()
  if (!raw) return false
  if (/^(https?:|file:|base64:)/i.test(raw)) return true
  if (/^[a-z]:[\\/]/i.test(raw)) return true
  if (/^[\\/]{1,2}/.test(raw)) return true
  return false
}

async function resolveNoticeUser(
  ctx,
  { userId, groupId, label = "用户", preferredName = "" } = {},
) {
  const uid = toInt(userId)
  if (!uid) return null

  let name = String(preferredName || "").trim()

  if (!name && groupId) {
    const member = await withTimeout(getMemberInfoSafe(ctx, groupId, uid), 1500, null)
    name = String(member?.card || member?.nickname || "").trim()
  }

  if (!name && ctx && typeof ctx.getUserInfo === "function") {
    const info = await withTimeout(
      Promise.resolve().then(() => ctx.getUserInfo({ user_id: uid })),
      1500,
      null,
    )
    name = String(info?.card || info?.nickname || info?.remark || "").trim()
  }

  return {
    label: String(label || "用户"),
    userId: uid,
    name,
    avatarUrl: getQqAvatarUrl(uid),
  }
}

async function resolveNoticeUsers(ctx, users = [], { groupId } = {}) {
  const out = []
  for (const item of Array.isArray(users) ? users : []) {
    if (!item) continue
    const next =
      typeof item === "object"
        ? await resolveNoticeUser(ctx, {
            ...item,
            groupId: item.groupId ?? groupId,
          })
        : await resolveNoticeUser(ctx, { userId: item, groupId })
    if (next) out.push(next)
  }
  return out
}

function formatNoticeUser(user) {
  if (!user) return ""
  const uid = toInt(user.userId)
  if (!uid) return ""
  return user.name ? `${user.name}(${uid})` : String(uid)
}

function buildSummaryNoticePayload({ title, groupId, groupName, users = [], lines = [] } = {}) {
  const textLines = [String(title || "").trim()]
  if (groupId) {
    textLines.push(`群：${groupName ? `${groupName}(${groupId})` : groupId}`)
  }
  for (const user of users) {
    const text = formatNoticeUser(user)
    if (!text) continue
    textLines.push(`${user.label || "用户"}：${text}`)
  }
  for (const line of lines) {
    const text = String(line || "").trim()
    if (text) textLines.push(text)
  }

  const seen = new Set()
  const avatars = []
  for (const user of users) {
    const uid = toInt(user?.userId)
    if (!uid || seen.has(uid)) continue
    seen.add(uid)
    const seg = makeNoticeImageSegment(user?.avatarUrl || getQqAvatarUrl(uid), "[头像]")
    if (seg) avatars.push(seg)
  }

  return [...avatars, makeNoticeTextSegment(textLines.filter(Boolean).join("\n"))]
}

export function normalizeNoticeMessageSegments(input) {
  const raw =
    input?.universal_message ??
    input?.universalMessage?.segments ??
    input?.message ??
    input?.segments ??
    input

  try {
    return coerceToUniversalMessage(raw).segments
  } catch {
    return []
  }
}

export function collectNoticeMessageSegmentCandidates(input) {
  if (Array.isArray(input)) return [input]
  if (!input || typeof input !== "object") return []

  const candidates = []
  const push = value => {
    if (!Array.isArray(value) || !value.length) return
    if (candidates.includes(value)) return
    candidates.push(value)
  }

  push(input.message)
  push(input.rawSegments)
  push(input.raw_segments)
  push(input.segments)
  push(input.universal_message)
  push(input.universalMessage?.segments)
  push(input.universalMessage)

  return candidates
}

function extractNoticeText(segments) {
  return (Array.isArray(segments) ? segments : [])
    .filter(seg => seg?.type === "text")
    .map(seg => seg?.data?.content ?? seg?.data?.text ?? seg?.text ?? "")
    .join("")
    .trim()
}

function analyzeNoticeMessage(segments) {
  const list = Array.isArray(segments) ? segments : []
  const text = clampText(extractNoticeText(list), 160)
  const brief = clampText(renderUniversalBrief(list), 160)
  const requiresForward = list.some(seg => {
    const type = String(seg?.type || "")
    if (!type) return false
    if (type === "image") return true
    return !["text", "at", "atAll", "face", "reply"].includes(type)
  })

  return {
    text,
    brief: brief || text,
    requiresForward,
    hasContent: list.length > 0,
  }
}

async function getNoticeRkeySuffix(ctx) {
  const proto = String(ctx?.protocol || "").toLowerCase()
  if (proto !== "milky") return ""

  const scene = String(ctx?.message_scene || (ctx?.group_id ? "group" : "friend")).toLowerCase()
  const targetScene = scene === "friend" ? "private" : "group"
  const data = await withTimeout(
    Promise.resolve().then(() => getSceneRkey(targetScene)),
    5000,
    null,
  )
  return String(data?.value || "").trim()
}

function getRuntimeBotSafe() {
  try {
    return Bot || globalThis.Bot || null
  } catch {
    return globalThis.Bot || null
  }
}

function getContextApiCall(ctx) {
  const runtimeBot = getRuntimeBotSafe()
  return (
    (ctx &&
      (typeof ctx.callApi === "function"
        ? ctx.callApi
        : typeof ctx.sendApi === "function"
          ? ctx.sendApi
          : null)) ||
    (runtimeBot &&
      (typeof runtimeBot.callApi === "function"
        ? runtimeBot.callApi.bind(runtimeBot)
        : typeof runtimeBot.sendApi === "function"
          ? runtimeBot.sendApi.bind(runtimeBot)
          : null)) ||
    null
  )
}

function normalizeForwardSenderName(name, userId) {
  const text = String(name || "").trim()
  if (text) return text
  const uid = toInt(userId)
  return uid ? String(uid) : "用户"
}

function normalizeForwardUserId(candidates = [], fallbackUserId) {
  for (const value of Array.isArray(candidates) ? candidates : [candidates]) {
    const uid = toInt(value)
    if (uid !== undefined && uid >= 10001) return uid
  }

  const fallback = toInt(fallbackUserId)
  if (fallback !== undefined && fallback >= 10001) return fallback
  return 10001
}

export function normalizeForwardApiMessages(messages, { rkeySuffix, fallbackUserId } = {}) {
  const list = Array.isArray(messages) ? messages : []
  const out = []

  for (const item of list) {
    if (!item || typeof item !== "object") continue

    if (item.type === "node") {
      const data = item.data && typeof item.data === "object" ? item.data : {}
      const userId = normalizeForwardUserId(
        [data.uin, data.user_id, item.user_id, item.uin, item.sender_id, item.senderId],
        fallbackUserId,
      )
      const nickname = normalizeForwardSenderName(data.name, userId)
      const content = toForwardSafeSegments(normalizeNoticeMessageSegments(data.content ?? []), {
        rkeySuffix,
      })
      out.push({
        user_id: userId,
        nickname,
        sender_name: nickname,
        name: nickname,
        content,
        ...(data.time ? { time: data.time } : {}),
      })
      continue
    }

    const userId = normalizeForwardUserId(
      [item.user_id, item.uin, item.qq, item.sender_id, item.senderId, item.sender?.user_id, item.sender?.id],
      fallbackUserId,
    )
    const nickname = normalizeForwardSenderName(
      item.nickname ?? item.sender_name ?? item.name ?? item.sender?.name,
      userId,
    )
    const content = toForwardSafeSegments(
      normalizeNoticeMessageSegments(item.message ?? item.content ?? item.segments ?? []),
      { rkeySuffix },
    )
    out.push({
      user_id: userId,
      nickname,
      sender_name: nickname,
      name: nickname,
      content,
      ...(item.time ? { time: item.time } : {}),
    })
  }

  return out.filter(item =>
    Array.isArray(item.content) ? item.content.length > 0 : Boolean(item.content),
  )
}

export function getForwardSegmentId(seg) {
  const data = seg?.data && typeof seg.data === "object" ? seg.data : {}
  const raw =
    data.forward_id ??
    data.id ??
    data.resid ??
    data.message_id ??
    data.messageId ??
    seg?.forward_id ??
    seg?.id ??
    seg?.resid
  return raw !== undefined && raw !== null ? String(raw).trim() : ""
}

export function findStandaloneForwardSegment(message) {
  for (const candidate of collectNoticeMessageSegmentCandidates(message)) {
    const list = Array.isArray(candidate) ? candidate : []
    if (list.length !== 1) continue
    const seg = list[0]
    const type = String(seg?.type || "").toLowerCase()
    if (!["forward", "multimsg", "long_msg"].includes(type)) continue
    const forwardId = getForwardSegmentId(seg)
    if (!forwardId) continue
    return seg
  }

  const forwardMetaList = Array.isArray(message?.forward_meta)
    ? message.forward_meta
    : message?.forward_meta
      ? [message.forward_meta]
      : []
  const meta = forwardMetaList.find(item => String(item?.forward_id || "").trim())
  if (meta) {
    return {
      type: "forward",
      data: {
        forward_id: meta.forward_id,
        title: meta.title,
        preview: meta.preview,
        summary: meta.summary,
      },
    }
  }

  return null
}

export function buildNoticeForwardRelayPayload(ctx, { title, message } = {}) {
  const seg = findStandaloneForwardSegment(message)
  const forwardId = getForwardSegmentId(seg)
  if (!forwardId) return null

  return {
    __xunlu_notice_forward_relay__: true,
    title: String(title || "").trim(),
    forward_id: forwardId,
  }
}

export function isNoticeForwardRelayPayload(payload) {
  return Boolean(payload?.__xunlu_notice_forward_relay__ && payload?.forward_id)
}

async function makePrivateForwardPayloadForUser(userId, msgList = []) {
  const runtimeBot = getRuntimeBotSafe()
  const takeoverState = runtimeBot?.__xunlu_takeover_state
  const takeoverUser =
    takeoverState && typeof takeoverState.getUser === "function"
      ? takeoverState.getUser(userId)
      : null

  if (typeof takeoverUser?.makeForwardMsg === "function") {
    return await takeoverUser.makeForwardMsg(msgList)
  }

  if (typeof runtimeBot?.pickFriend === "function") {
    const friend = runtimeBot.pickFriend(userId)
    if (typeof friend?.makeForwardMsg === "function") {
      return await friend.makeForwardMsg(msgList)
    }
  }

  if (typeof runtimeBot?.pickUser === "function") {
    const user = runtimeBot.pickUser(userId)
    if (typeof user?.makeForwardMsg === "function") {
      return await user.makeForwardMsg(msgList)
    }
  }

  if (typeof runtimeBot?.makePrivateForwardMsg === "function") {
    return await runtimeBot.makePrivateForwardMsg(msgList, userId)
  }

  throw new Error("private forward API not available")
}

function normalizePrivateRelaySegments(segments = []) {
  const list = Array.isArray(segments) ? segments : []
  const out = []

  for (const seg of list) {
    if (!seg || typeof seg !== "object") continue

    if (seg.type === "at") {
      const target = seg?.data?.qq ?? seg?.data?.target ?? seg?.data?.user_id ?? ""
      out.push(makeNoticeTextSegment(`@${target}`))
      continue
    }

    if (seg.type === "atAll") {
      out.push(makeNoticeTextSegment("@全体"))
      continue
    }

    if (seg.type === "reply") {
      out.push(makeNoticeTextSegment("[回复]"))
      continue
    }

    if (["image", "video", "record", "file"].includes(String(seg.type || ""))) {
      const data = seg?.data && typeof seg.data === "object" ? seg.data : {}
      const mediaRef = data.file ?? data.url ?? data.uri ?? data.path
      if (!isResolvableMediaRef(mediaRef)) {
        const labels = {
          image: "[图片]",
          video: "[视频]",
          record: "[语音]",
          file: `[文件${data.name ? `:${data.name}` : ""}]`,
        }
        out.push(makeNoticeTextSegment(labels[String(seg.type || "")] || `[${seg.type}]`))
        continue
      }
    }

    out.push(seg)
  }

  return out
}

function normalizeForwardPayloadForPrivateFallback(ctx, uid, message) {
  if (!Array.isArray(message) || !message.length) return []
  return normalizeForwardApiMessages(message, {
    fallbackUserId: ctx?.user_id ?? ctx?.sender_id ?? ctx?.self_id ?? uid,
  })
}

async function sendForwardRelayFallbackToMaster(ctx, uid, payload, msgList = []) {
  const title = String(payload?.title || "").trim()
  const list = Array.isArray(msgList) ? msgList : []
  let sent = false

  for (const item of list) {
    const content = normalizePrivateRelaySegments(item?.content)
    if (!content.length) continue

    const senderName = normalizeForwardSenderName(
      item?.nickname ?? item?.sender_name ?? item?.name,
      item?.user_id,
    )
    const prefix = []
    if (title || senderName) {
      prefix.push(makeNoticeTextSegment(`${title || "转发详情"}\n发送者：${senderName}\n`))
    }

    await sendMasterRawPayload(ctx, uid, [...prefix, ...content])
    sent = true
  }

  return sent
}

async function sendForwardRelayToMaster(ctx, uid, payload) {
  const forwardId = String(payload?.forward_id || "").trim()
  if (!forwardId) return false

  const fetched = await fetchForwardMessagesBySegment(ctx, {
    type: "forward",
    data: { forward_id: forwardId },
  })

  const rkeySuffix = await getNoticeRkeySuffix(ctx)
  const msgList = normalizeForwardApiMessages(fetched, {
    rkeySuffix,
    fallbackUserId: ctx?.user_id ?? ctx?.sender_id ?? ctx?.self_id ?? uid,
  })
  if (!msgList.length) {
    throw new Error(`forward ${forwardId} resolved to empty messages`)
  }

  const proto = String(ctx?.protocol || "").toLowerCase()
  if (proto === "onebotv11") {
    return await sendForwardRelayFallbackToMaster(ctx, uid, payload, msgList)
  }

  try {
    const forwardPayload = await makePrivateForwardPayloadForUser(uid, msgList)
    await sendMasterRawPayload(ctx, uid, forwardPayload)
    return true
  } catch (err) {
    console.warn("[group] private forward relay fallback:", err?.message || err)
    return await sendForwardRelayFallbackToMaster(ctx, uid, payload, msgList)
  }
}

async function expandNoticeForwardSegments(ctx, segments, { rkeySuffix } = {}) {
  const list = Array.isArray(segments) ? segments : []
  if (!list.length) return []

  const types = list.map(item => String(item?.type || "").toLowerCase())
  if (types.length && types.every(type => type === "node")) {
    const normalized = normalizeForwardApiMessages(list, { rkeySuffix })
    if (normalized.length) return normalized
  }

  if (list.length !== 1) return []

  const seg = list[0]
  const type = String(seg?.type || "").toLowerCase()
  if (type === "node") {
    const normalized = normalizeForwardApiMessages(list, { rkeySuffix })
    if (normalized.length) return normalized
    return []
  }

  const embedded = normalizeForwardApiMessages(seg?.data?.messages ?? seg?.messages, { rkeySuffix })
  if (embedded.length) return embedded

  if (!["forward", "multimsg", "long_msg"].includes(type)) return []

  const fetched = await fetchForwardMessagesBySegment(ctx, seg)
  const expanded = normalizeForwardApiMessages(fetched, { rkeySuffix })
  if (expanded.length) return expanded

  return []
}

async function fetchForwardMessagesBySegment(ctx, seg) {
  const runtimeBot = getRuntimeBotSafe()
  const forwardId = getForwardSegmentId(seg)
  if (!forwardId) return []

  const proto = String(ctx?.protocol || "").toLowerCase()
  if (proto === "milky" && typeof runtimeBot?.getForwardMessage === "function") {
    try {
      const detail = await withTimeout(
        Promise.resolve().then(() =>
          runtimeBot.getForwardMessage({
            forward_id: forwardId,
            peer_id: ctx?.group_id ?? ctx?.user_id ?? "",
            message_scene: ctx?.group_id ? "group" : String(ctx?.message_scene || "friend"),
          }),
        ),
        2500,
        null,
      )
      if (Array.isArray(detail?.messages) && detail.messages.length) return detail.messages
    } catch {}
  }

  const apiCall = getContextApiCall(ctx)
  if (typeof apiCall !== "function") return []

  const onebotRes = await withTimeout(
    Promise.resolve().then(() => apiCall("get_forward_msg", { message_id: forwardId })),
    2500,
    null,
  ).catch(() => null)
  const onebotMessages = onebotRes?.messages ?? onebotRes?.data?.messages
  if (Array.isArray(onebotMessages) && onebotMessages.length) return onebotMessages

  const milkyRes = await withTimeout(
    Promise.resolve().then(() => apiCall("get_forwarded_messages", { forward_id: forwardId })),
    2500,
    null,
  ).catch(() => null)
  const milkyMessages = milkyRes?.messages ?? milkyRes?.data?.messages
  if (Array.isArray(milkyMessages) && milkyMessages.length) return milkyMessages

  return []
}

export async function buildNoticeForwardMsgList(ctx, { sender, message, time } = {}) {
  const rkeySuffix = await getNoticeRkeySuffix(ctx)

  for (const candidate of collectNoticeMessageSegmentCandidates(message)) {
    const expanded = await expandNoticeForwardSegments(ctx, candidate, { rkeySuffix })
    if (expanded.length) return expanded
  }

  const rawSegments = normalizeNoticeMessageSegments(message)
  if (!rawSegments.length) return []

  const expanded = await expandNoticeForwardSegments(ctx, rawSegments, { rkeySuffix })
  if (expanded.length) return expanded

  const content = toForwardSafeSegments(rawSegments, { rkeySuffix })
  const senderId = toInt(sender?.userId) ?? toInt(ctx?.user_id) ?? toInt(ctx?.self_id) ?? 0
  const senderName = String(sender?.name || sender?.nickname || senderId || "用户").trim()

  return [
    {
      user_id: senderId,
      nickname: senderName,
      sender_name: senderName,
      name: senderName,
      content,
      ...(time ? { time } : {}),
    },
  ]
}

async function buildNoticeForwardPayload(ctx, { title, sender, message, time } = {}) {
  const msgList = await buildNoticeForwardMsgList(ctx, { sender, message, time })
  if (!msgList.length) return null

  try {
    if (ctx && typeof ctx.makeGroupForwardMsg === "function") {
      return await ctx.makeGroupForwardMsg(ctx, msgList, title || "")
    }
    if (typeof Bot?.makeGroupForwardMsg === "function") {
      return await Bot.makeGroupForwardMsg(msgList, ctx?.group_id)
    }
  } catch (err) {
    console.warn("[group] build notice forward failed:", err?.message || err)
  }

  return null
}

function buildNotifyEnvelope(payloads = []) {
  return { payloads: payloads.filter(Boolean) }
}

export async function createSummaryNotice(
  ctx,
  { title, groupId, groupName, users = [], lines = [] } = {},
) {
  const resolvedUsers = await resolveNoticeUsers(ctx, users, { groupId })
  const summary = buildSummaryNoticePayload({
    title,
    groupId,
    groupName,
    users: resolvedUsers,
    lines,
  })
  return buildNotifyEnvelope([summary])
}

export async function createMessageAwareNotice(
  ctx,
  {
    title,
    groupId,
    groupName,
    users = [],
    lines = [],
    message,
    time,
    missingLine = "",
    forwardTitle = "",
    alwaysForward = false,
  } = {},
) {
  const resolvedUsers = await resolveNoticeUsers(ctx, users, { groupId })
  const segments = normalizeNoticeMessageSegments(message)
  const analyzed = analyzeNoticeMessage(segments)
  const summaryLines = [...lines]

  if (analyzed.hasContent) {
    summaryLines.push(
      `内容：${analyzed.requiresForward ? analyzed.brief || "(无文本)" : analyzed.text || analyzed.brief || "(无文本)"}`,
    )
  } else if (missingLine) {
    summaryLines.push(missingLine)
  }

  const summary = buildSummaryNoticePayload({
    title,
    groupId,
    groupName,
    users: resolvedUsers,
    lines: summaryLines,
  })

  const payloads = [summary]
  const forceForward =
    alwaysForward || /撤回/.test(String(title || "")) || /撤回/.test(String(forwardTitle || ""))
  if (analyzed.hasContent && (forceForward || analyzed.requiresForward)) {
    const relay = buildNoticeForwardRelayPayload(ctx, {
      title: forwardTitle || title,
      message,
    })
    const forward =
      relay ||
      (await buildNoticeForwardPayload(ctx, {
        title: forwardTitle || title,
        sender: resolvedUsers[0],
        message: segments,
        time,
      }))
    if (forward) payloads.push(forward)
  }

  return buildNotifyEnvelope(payloads)
}

function getRecallMessageRef(ctx) {
  const msgIdRaw =
    ctx?.message_id ??
    ctx?.msg_id ??
    ctx?.messageId ??
    ctx?.msgId ??
    ctx?.source?.message_id ??
    ctx?.source?.msg_id ??
    ctx?.source?.messageId ??
    ctx?.source?.msgId ??
    ctx?.data?.message_id ??
    ctx?.data?.msg_id ??
    ctx?.extra?.message_id ??
    ctx?.extra?.msg_id ??
    ctx?.extra?.id ??
    ctx?.extra?.milky?.message_id ??
    ctx?.extra?.milky?.msg_id ??
    ctx?.extra?.milky?.message_seq ??
    ctx?.milky?.message_id ??
    ctx?.milky?.msg_id ??
    ctx?.milky?.message_seq
  const seqRaw =
    ctx?.message_seq ??
    ctx?.seq ??
    ctx?.messageSeq ??
    ctx?.source?.message_seq ??
    ctx?.source?.seq ??
    ctx?.source?.messageSeq ??
    ctx?.data?.message_seq ??
    ctx?.data?.seq ??
    ctx?.extra?.message_seq ??
    ctx?.extra?.seq ??
    ctx?.extra?.messageSeq ??
    ctx?.extra?.milky?.message_seq ??
    ctx?.extra?.milky?.seq ??
    ctx?.milky?.message_seq ??
    ctx?.milky?.seq

  return {
    msgId: msgIdRaw !== undefined && msgIdRaw !== null ? String(msgIdRaw) : "",
    seq: toInt(seqRaw) ?? toInt(msgIdRaw),
  }
}

function hasForwardLikeSegments(input) {
  return collectNoticeMessageSegmentCandidates(input).some(candidate =>
    (Array.isArray(candidate) ? candidate : []).some(seg =>
      ["forward", "node", "multimsg", "long_msg"].includes(String(seg?.type || "").toLowerCase()),
    ),
  )
}

export function isDegradedForwardPlaceholderRecord(record) {
  if (!record || typeof record !== "object") return false
  if (hasForwardLikeSegments(record)) return false

  const text = String(record?.raw_message || extractNoticeText(normalizeNoticeMessageSegments(record)) || "")
    .trim()
    .toLowerCase()
  if (!text) return false

  return ["[forward]", "[转发]", "[转发消息]"].includes(text)
}

function hasResolvableMediaSegments(input) {
  return collectNoticeMessageSegmentCandidates(input).some(candidate =>
    (Array.isArray(candidate) ? candidate : []).some(seg => {
      const type = String(seg?.type || "").toLowerCase()
      if (!["image", "video", "record", "file"].includes(type)) return false
      const data = seg?.data && typeof seg.data === "object" ? seg.data : {}
      const mediaRef =
        data.url ??
        data.temp_url ??
        data.uri ??
        data.file ??
        data.path ??
        seg?.url ??
        seg?.file ??
        seg?.path
      return isResolvableMediaRef(mediaRef)
    }),
  )
}

export async function fetchRecalledMessageViaApi(ctx, ref = {}) {
  const apiCall = getContextApiCall(ctx)
  if (typeof apiCall !== "function") return null

  const proto = String(ctx?.protocol || "").toLowerCase()
  if (proto === "milky") {
    const seq = toInt(ref.seq ?? ref.msgId)
    const peer_id = toInt(ctx?.group_id ?? ctx?.user_id)
    const message_scene = ctx?.group_id ? "group" : String(ctx?.message_scene || "friend")
    if (!seq || !peer_id) return null

    const res = await withTimeout(
      Promise.resolve().then(() => apiCall("get_message", { message_scene, peer_id, message_seq: seq })),
      2500,
      null,
    ).catch(() => null)

    const msgObj = res?.message ?? res?.data?.message ?? (res && typeof res === "object" ? res : null)
    const rawSegments = Array.isArray(msgObj?.segments) ? msgObj.segments : []
    if (!rawSegments.length) return null

    return {
      ...(msgObj && typeof msgObj === "object" ? msgObj : {}),
      protocol: "milky",
      message_scene: msgObj?.message_scene ?? message_scene,
      peer_id: msgObj?.peer_id ?? peer_id,
      message_seq: msgObj?.message_seq ?? seq,
      seq: msgObj?.message_seq ?? seq,
      raw_message: msgObj?.raw_message ?? "",
      segments: rawSegments,
      universal_message: normalizeNoticeMessageSegments(rawSegments),
      message: rawSegments,
    }
  }

  if (proto === "onebotv11") {
    const msgId = ref.msgId !== undefined && ref.msgId !== null ? String(ref.msgId) : ""
    if (!msgId) return null

    const res = await withTimeout(
      Promise.resolve().then(() => apiCall("get_msg", { message_id: msgId })),
      2500,
      null,
    ).catch(() => null)

    const rawSegments = res?.message ?? res?.data?.message
    if (!Array.isArray(rawSegments) || !rawSegments.length) return null

    return {
      ...(res && typeof res === "object" ? res : {}),
      protocol: "onebotv11",
      raw_message: res?.raw_message ?? "",
      segments: rawSegments,
      message: rawSegments,
    }
  }

  return null
}

async function findRecalledMessageFromDbFallback(ctx, { groupId, senderId, ref } = {}) {
  if (!groupId) return null

  const eventTime = toInt(ctx?.time) ?? Math.floor(Date.now() / 1000)
  const startTime = Math.max(0, eventTime - 24 * 3600)
  const endTime = eventTime + 5

  let rows = []
  try {
    rows = await MessageDB.getGroupMsgByTimeRange(groupId, startTime, endTime)
  } catch {
    rows = []
  }

  const list = (Array.isArray(rows) ? rows : [rows]).filter(Boolean)
  if (!list.length) return null

  const candidateIds = _.uniq(
    [ref?.msgId, ref?.seq !== undefined ? String(ref.seq) : ""].filter(Boolean).map(v => String(v)),
  )

  if (candidateIds.length) {
    const exact = list.find(row => candidateIds.includes(String(row?.message_id ?? "")))
    if (exact) return exact
  }

  const senderNum = toInt(senderId)
  const bySender = list.filter(row => {
    if (senderNum === undefined) return true
    return toInt(row?.user_id) === senderNum
  })
  if (!bySender.length) return null

  bySender.sort((a, b) => {
    const aTime = Number(a?.time || 0)
    const bTime = Number(b?.time || 0)
    const aValid = aTime > 0 && aTime <= endTime
    const bValid = bTime > 0 && bTime <= endTime
    if (aValid !== bValid) return aValid ? -1 : 1

    const aDiff = Math.abs(endTime - aTime)
    const bDiff = Math.abs(endTime - bTime)
    if (aDiff !== bDiff) return aDiff - bDiff

    return bTime - aTime
  })

  return bySender[0] || null
}

export async function getRecalledMessageSafe(ctx) {
  const groupId = toInt(ctx?.group_id)
  const senderId = ctx?.user_id ?? ctx?.sender_id ?? ctx?.operator_id
  const proto = String(ctx?.protocol || "").toLowerCase()
  const ref = getRecallMessageRef(ctx)
  const candidates = []
  let cachedRecord = null
  if (ref.seq !== undefined) candidates.push(String(ref.seq))
  if (ref.msgId) candidates.push(ref.msgId)

  if (groupId) {
    for (const id of _.uniq(candidates.filter(Boolean))) {
      try {
        const record = await MessageDB.getMessageById(groupId, id)
        if (!record) continue
        if (!isDegradedForwardPlaceholderRecord(record) && (proto !== "onebotv11" || hasResolvableMediaSegments(record))) {
          return record
        }
        cachedRecord = record
      } catch {}
    }
  }

  if ((proto === "milky" || proto === "onebotv11") && (cachedRecord || ref.msgId || ref.seq !== undefined)) {
    const apiRecord = await fetchRecalledMessageViaApi(ctx, ref)
    if (apiRecord) return apiRecord
  }

  const getMessageFn =
    ctx && typeof ctx.getMessage === "function"
      ? async ({ msgId, seq }) => await ctx.getMessage({ msgId, seq })
      : ctx && typeof ctx.getMsg === "function"
        ? async ({ msgId, seq }) => await ctx.getMsg(msgId ?? seq)
        : null

  if (getMessageFn && (ref.msgId || ref.seq !== undefined)) {
    try {
      const direct = await withTimeout(
        getMessageFn({ msgId: ref.msgId || undefined, seq: ref.seq }),
        2000,
        null,
      )
      if (direct && !isDegradedForwardPlaceholderRecord(direct)) return direct
    } catch {}
    if (ref.msgId) {
      try {
        const byMsgId = await withTimeout(getMessageFn({ msgId: ref.msgId }), 2000, null)
        if (byMsgId && !isDegradedForwardPlaceholderRecord(byMsgId)) return byMsgId
      } catch {}
    }
    if (ref.seq !== undefined) {
      try {
        const bySeq = await withTimeout(getMessageFn({ seq: ref.seq }), 2000, null)
        if (bySeq && !isDegradedForwardPlaceholderRecord(bySeq)) return bySeq
      } catch {}
    }
  }

  if (cachedRecord) return cachedRecord

  if (groupId) {
    const approx = await findRecalledMessageFromDbFallback(ctx, {
      groupId,
      senderId,
      ref,
    })
    if (approx) return approx
  }

  return null
}
