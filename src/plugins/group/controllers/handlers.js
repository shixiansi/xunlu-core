import _ from "lodash"
import moment from "moment"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { segment } from "../../../Bot/segment_bk.js"
import { coerceToUniversalMessage } from "../../../Bot/message/context.js"
import Filemage from "../../../utils/Filemage.js"
import MessageDB from "../../../db/MessageDB.js"
import env from "../../../lib/env.js"
import cfg from "../../../lib/config.js"
import {
  getMemberInfoWithFallback,
  getNormalizedMemberRole,
} from "../../../Bot/member-role-utils.js"
import { applyRkeyToUrl, getSceneRkey } from "../../../utils/rkey.js"
import {
  getBotNoticeConfig,
  getGlobalNoticeConfig,
  getGroupNoticeConfig,
  getSystemNoticeConfig,
  setBotNoticeConfig,
  setGlobalNoticeConfig,
  setGroupNoticeConfig,
  setSystemNoticeConfig,
} from "../model/notice-store.js"
const filemage = new Filemage()
const groupPass = {}

const CHUO_DATA_DIR = path.resolve(env.RootPath, "data", "chuo")
const CHUO_CONFIG_PATH = path.join(CHUO_DATA_DIR, "config.json")

const noticeDedupe = new Map()

function toInt(value) {
  if (value === undefined || value === null) return undefined
  const v = typeof value === "string" ? value.trim() : value
  if (v === "") return undefined
  const num = Number(v)
  return Number.isFinite(num) ? Math.floor(num) : undefined
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
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

function pickMessageBrief(ctx) {
  const text = String(ctx?.msg || "").trim()
  if (text) return clampText(text, 160)
  const rendered = renderUniversalBrief(ctx?.message)
  return clampText(rendered, 160)
}

function shouldSendOnce(key, ttlSec) {
  const k = String(key || "").trim()
  if (!k) return true

  const ttlMs = Math.max(1, Math.floor(Number(ttlSec) || 60)) * 1000
  const now = Date.now()
  const exp = noticeDedupe.get(k)
  if (typeof exp === "number" && exp > now) return false

  noticeDedupe.set(k, now + ttlMs)

  // opportunistic cleanup
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
      const mod = await import(
        pathToFileURL(path.resolve(process.cwd(), "lib", "config", "config.js")).href
      )
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

async function sendMasterPayload(ctx, uid, message) {
  if (ctx && typeof ctx.sendMessage === "function") {
    return await ctx.sendMessage(String(uid), message)
  }
  if (ctx && typeof ctx.pickUser === "function") {
    return await ctx.pickUser(uid).sendMsg(message)
  }
  // eslint-disable-next-line no-undef
  if (typeof Bot?.sendMessage === "function") {
    // eslint-disable-next-line no-undef
    return await Bot.sendMessage(String(uid), message)
  }
  // eslint-disable-next-line no-undef
  if (typeof Bot?.pickUser === "function") {
    // eslint-disable-next-line no-undef
    return await Bot.pickUser(uid).sendMsg(message)
  }
  throw new Error("master notify send API not available")
}

async function sendToMasters(ctx, message, { dedupeKey } = {}) {
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

function isTempMessage(ctx) {
  const proto = String(ctx?.protocol || "").toLowerCase()
  if (proto === "milky") return String(ctx?.message_scene || "") === "temp"
  if (proto === "onebotv11")
    return String(ctx?.message_type || "") === "private" && String(ctx?.sub_type || "") === "group"
  return Boolean(ctx?.group_id) && String(ctx?.message_type || "") === "private"
}

function getTempGroupId(ctx) {
  return (
    toInt(ctx?.group_id) ?? toInt(ctx?.group?.group_id) ?? toInt(ctx?.group?.groupId) ?? undefined
  )
}

function ensureChuoConfigFile() {
  ensureDir(CHUO_DATA_DIR)
  if (!fs.existsSync(CHUO_CONFIG_PATH)) {
    fs.writeFileSync(CHUO_CONFIG_PATH, JSON.stringify({ enabled: true }, null, 2), "utf8")
  }
}

function setChuoEnabled(enabled) {
  ensureChuoConfigFile()
  const payload = { enabled: Boolean(enabled) }
  fs.writeFileSync(CHUO_CONFIG_PATH, JSON.stringify(payload, null, 2), "utf8")
  return payload
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

function toForwardSafeSegments(content, { rkeySuffix } = {}) {
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

    // 对“文件/视频”等在转发中容易超时/不兼容的段，改为文字兜底
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

    // 避免嵌套转发导致异常/超时
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

function normalizeNoticeMessageSegments(input) {
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
    // eslint-disable-next-line no-undef
    return Bot || globalThis.Bot || null
  } catch {
    return globalThis.Bot || null
  }
}

function normalizeForwardSenderName(name, userId) {
  const text = String(name || "").trim()
  if (text) return text
  const uid = toInt(userId)
  return uid ? String(uid) : "用户"
}

function normalizeForwardApiMessages(messages, { rkeySuffix } = {}) {
  const list = Array.isArray(messages) ? messages : []
  const out = []

  for (const item of list) {
    if (!item || typeof item !== "object") continue

    if (item.type === "node") {
      const data = item.data && typeof item.data === "object" ? item.data : {}
      const userId = data.uin ?? data.user_id ?? item.user_id
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

    const userId = item.user_id ?? item.uin ?? item.qq ?? item.sender_id ?? item.senderId
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

function getForwardSegmentId(seg) {
  const data = seg?.data && typeof seg.data === "object" ? seg.data : {}
  const raw =
    data.forward_id ?? data.id ?? data.message_id ?? data.messageId ?? seg?.forward_id ?? seg?.id
  return raw !== undefined && raw !== null ? String(raw).trim() : ""
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

  const apiCall =
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
          : null))

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

async function buildNoticeForwardMsgList(ctx, { sender, message, time } = {}) {
  const rawSegments = normalizeNoticeMessageSegments(message)
  if (!rawSegments.length) return []

  const rkeySuffix = await getNoticeRkeySuffix(ctx)
  if (rawSegments.length === 1 && String(rawSegments[0]?.type || "") === "forward") {
    const embedded = normalizeForwardApiMessages(rawSegments[0]?.data?.messages, { rkeySuffix })
    if (embedded.length) return embedded

    const fetched = await fetchForwardMessagesBySegment(ctx, rawSegments[0])
    const expanded = normalizeForwardApiMessages(fetched, { rkeySuffix })
    if (expanded.length) return expanded
  }

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
    // eslint-disable-next-line no-undef
    if (typeof Bot?.makeGroupForwardMsg === "function") {
      // eslint-disable-next-line no-undef
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

async function createSummaryNotice(
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

async function createMessageAwareNotice(
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
    const forward = await buildNoticeForwardPayload(ctx, {
      title: forwardTitle || title,
      sender: resolvedUsers[0],
      message: segments,
      time,
    })
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

async function getRecalledMessageSafe(ctx) {
  const groupId = toInt(ctx?.group_id)
  const senderId = ctx?.user_id ?? ctx?.sender_id ?? ctx?.operator_id
  const ref = getRecallMessageRef(ctx)
  const candidates = []
  if (ref.seq !== undefined) candidates.push(String(ref.seq))
  if (ref.msgId) candidates.push(ref.msgId)

  if (groupId) {
    for (const id of _.uniq(candidates.filter(Boolean))) {
      try {
        const record = await MessageDB.getMessageById(groupId, id)
        if (record) return record
      } catch {}
    }
  }

  if (ctx && typeof ctx.getMessage === "function" && (ref.msgId || ref.seq !== undefined)) {
    try {
      const direct = await withTimeout(
        ctx.getMessage({ msgId: ref.msgId || undefined, seq: ref.seq }),
        2000,
        null,
      )
      if (direct) return direct
    } catch {}
    if (ref.msgId) {
      try {
        const byMsgId = await withTimeout(ctx.getMessage({ msgId: ref.msgId }), 2000, null)
        if (byMsgId) return byMsgId
      } catch {}
    }
    if (ref.seq !== undefined) {
      try {
        const bySeq = await withTimeout(ctx.getMessage({ seq: ref.seq }), 2000, null)
        if (bySeq) return bySeq
      } catch {}
    }
  }

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

function randomWithDigits(digits) {
  if (!Number.isInteger(digits) || digits <= 0) {
    throw new Error("位数必须是正整数")
  }
  const min = Math.pow(10, digits - 1) // 最小值，例如 3 位数 -> 100
  const max = Math.pow(10, digits) - 1 // 最大值，例如 3 位数 -> 999
  return _.random(min, max)
}

function parseDurationSeconds(input) {
  const raw = String(input || "").trim()
  if (!raw) return 0

  const m = raw.match(/^(\d+)\s*(秒|s|分|分钟|m|小时|h|天|d)?$/i)
  if (!m) return 0

  const n = Math.floor(Number(m[1]))
  if (!Number.isFinite(n) || n <= 0) return 0

  const unit = String(m[2] || "秒").toLowerCase()
  if (unit === "秒" || unit === "s") return n
  if (unit === "分" || unit === "分钟" || unit === "m") return n * 60
  if (unit === "小时" || unit === "h") return n * 3600
  if (unit === "天" || unit === "d") return n * 86400
  return n
}

function normalizeRole(role) {
  const r = String(role || "").toLowerCase()
  return r
}

function resolveSelfId(ctx) {
  return (
    toInt(ctx?.self_id) ??
    toInt(ctx?.bot?.uin) ??
    toInt(ctx?.bot?.self_id) ??
    toInt(globalThis.Bot?.uin) ??
    toInt(globalThis.Bot?.self_id) ??
    undefined
  )
}

function getMemberRole(info) {
  return normalizeRole(getNormalizedMemberRole(info))
}

function isAdminRole(role) {
  const r = normalizeRole(role)
  return r === "owner" || r === "admin"
}

async function getMemberInfoSafe(ctx, groupId, userId) {
  return await getMemberInfoWithFallback(ctx, groupId, userId)
}

async function checkUserAdminOrMaster(ctx) {
  if (ctx?.isMaster) return true
  if (ctx?.isOwner || ctx?.isAdmin) return true
  const gid = toInt(ctx?.group_id)
  const uid = toInt(ctx?.user_id)
  if (!gid || !uid) return false
  const info = await getMemberInfoSafe(ctx, gid, uid)
  return isAdminRole(getMemberRole(info))
}

async function checkBotAdmin(ctx) {
  if (ctx?.botIsOwner || ctx?.botIsAdmin) return true
  const gid = toInt(ctx?.group_id)
  const sid = resolveSelfId(ctx)
  if (!gid || !sid) return false
  const info = await getMemberInfoSafe(ctx, gid, sid)
  return isAdminRole(getMemberRole(info))
}

async function checkBotOwner(ctx) {
  if (ctx?.botIsOwner) return true
  const gid = toInt(ctx?.group_id)
  const sid = resolveSelfId(ctx)
  if (!gid || !sid) return false
  const info = await getMemberInfoSafe(ctx, gid, sid)
  return getMemberRole(info) === "owner"
}

function formatOnOff(enabled) {
  return enabled ? "开启" : "关闭"
}

function formatScopeLabel(scope) {
  if (scope === "group") return "群单独"
  if (scope === "bot") return "Bot 单独"
  if (scope === "global") return "全局"
  if (scope === "system") return "系统"
  return scope || ""
}

async function handleNoticeToggle(ctx, name, enable) {
  const n = String(name || "").trim()
  const on = Boolean(enable)

  const gid = toInt(ctx?.group_id)
  const sid = toInt(ctx?.self_id)

  const requireGroup = async () => {
    if (!gid) {
      await ctx.reply("请在群内使用该设置（需要群号）")
      return null
    }
    return gid
  }

  switch (n) {
    case "好友消息": {
      if (!sid) return await ctx.reply("无法识别 bot 账号（self_id 缺失）")
      const next = setBotNoticeConfig(sid, { friend_message: on })
      return await ctx.reply(
        `好友消息（${formatScopeLabel("bot")}）已${formatOnOff(next.friend_message)}`,
      )
    }
    case "群消息": {
      const groupId = await requireGroup()
      if (!groupId) return true
      const next = setGroupNoticeConfig(groupId, { group_message: on })
      return await ctx.reply(
        `群消息（${formatScopeLabel("group")}）已${formatOnOff(next.group_message)}（群:${groupId}）`,
      )
    }
    case "群临时消息": {
      const groupId = await requireGroup()
      if (!groupId) return true
      const next = setGroupNoticeConfig(groupId, { group_temp_message: on })
      return await ctx.reply(
        `群临时消息（${formatScopeLabel("group")}）已${formatOnOff(next.group_temp_message)}（群:${groupId}）`,
      )
    }
    case "群撤回": {
      const groupId = await requireGroup()
      if (!groupId) return true
      const next = setGroupNoticeConfig(groupId, { group_recall: on })
      return await ctx.reply(
        `群撤回（${formatScopeLabel("group")}）已${formatOnOff(next.group_recall)}（群:${groupId}）`,
      )
    }
    case "好友撤回": {
      if (!sid) return await ctx.reply("无法识别 bot 账号（self_id 缺失）")
      const next = setBotNoticeConfig(sid, { friend_recall: on })
      return await ctx.reply(
        `好友撤回（${formatScopeLabel("bot")}）已${formatOnOff(next.friend_recall)}`,
      )
    }
    case "好友申请": {
      if (!sid) return await ctx.reply("无法识别 bot 账号（self_id 缺失）")
      const next = setBotNoticeConfig(sid, { friend_request: on })
      return await ctx.reply(
        `好友申请（${formatScopeLabel("bot")}）已${formatOnOff(next.friend_request)}`,
      )
    }
    case "加群申请": {
      const groupId = await requireGroup()
      if (!groupId) return true
      const next = setGroupNoticeConfig(groupId, { group_join_request: on })
      return await ctx.reply(
        `加群申请（${formatScopeLabel("group")}）已${formatOnOff(next.group_join_request)}（群:${groupId}）`,
      )
    }
    case "群邀请":
    case "群聊邀请": {
      if (!sid) return await ctx.reply("无法识别 bot 账号（self_id 缺失）")
      const next = setBotNoticeConfig(sid, { group_invite: on })
      return await ctx.reply(
        `群邀请（${formatScopeLabel("bot")}）已${formatOnOff(next.group_invite)}`,
      )
    }
    case "好友列表变动": {
      const next = setGlobalNoticeConfig({ friend_list_change: on })
      return await ctx.reply(
        `好友列表变动（${formatScopeLabel("global")}）已${formatOnOff(next.friend_list_change)}（轮询未启用，暂不生效）`,
      )
    }
    case "群聊列表变动": {
      const groupId = await requireGroup()
      if (!groupId) return true
      const next = setGroupNoticeConfig(groupId, { group_list_change: on })
      return await ctx.reply(
        `群聊列表变动（${formatScopeLabel("group")}）已${formatOnOff(next.group_list_change)}（仅 bot 进/退群事件 best-effort）`,
      )
    }
    case "群成员变动": {
      const groupId = await requireGroup()
      if (!groupId) return true
      const next = setGroupNoticeConfig(groupId, { group_member_change: on })
      return await ctx.reply(
        `群成员变动（${formatScopeLabel("group")}）已${formatOnOff(next.group_member_change)}（群:${groupId}）`,
      )
    }
    case "群管理变动": {
      const groupId = await requireGroup()
      if (!groupId) return true
      const next = setGroupNoticeConfig(groupId, { group_admin_change: on })
      return await ctx.reply(
        `群管理变动（${formatScopeLabel("group")}）已${formatOnOff(next.group_admin_change)}（群:${groupId}）`,
      )
    }
    case "禁言": {
      const groupId = await requireGroup()
      if (!groupId) return true
      const next = setGroupNoticeConfig(groupId, { bot_muted: on })
      return await ctx.reply(
        `Bot 被禁言（${formatScopeLabel("group")}）已${formatOnOff(next.bot_muted)}（群:${groupId}）`,
      )
    }
    case "全部通知": {
      const next = setSystemNoticeConfig({ notify_all_masters: on })
      return await ctx.reply(
        `通知全部主人（${formatScopeLabel("system")}）已${formatOnOff(next.notify_all_masters)}`,
      )
    }
    default:
      return await ctx.reply("未知设置项，可用：#荨鹿通知设置 查看")
  }
}

export function register(bot) {
  if (!bot || !bot.registerCommand) return
  //第一个参数是数组第一个是命令，第二个是事件，第三个是优先级（第二个和第三个都可以省略）

  // ===================== 荨鹿通知设置（主人） =====================
  bot.registerCommand(
    ["^(|#)荨鹿通知设置$", { example: ["#荨鹿通知设置"], desc: "查看/提示荨鹿通知开关（主人）" }],
    async ctx => {
      if (!ctx.isMaster) return await ctx.reply("仅主人可用")

      const sys = getSystemNoticeConfig()
      const botCfg = getBotNoticeConfig(ctx.self_id)
      const globalCfg = getGlobalNoticeConfig()
      const groupId = toInt(ctx.group_id)
      const groupCfg = groupId ? getGroupNoticeConfig(groupId) : null

      const lines = []
      lines.push(`荨鹿通知设置（bot:${ctx.self_id || ""}${groupId ? ` 群:${groupId}` : ""}）`)
      lines.push("说明：群单独=当前群独立开关；Bot单独=当前bot独立开关")
      lines.push("")

      const row = (label, scope, enabled, cmdHint = "") => {
        const on = enabled ? "✅" : "❌"
        lines.push(`${on} ${label}（${formatScopeLabel(scope)}）${cmdHint ? `  ${cmdHint}` : ""}`)
      }

      row("好友消息", "bot", botCfg.friend_message, "指令：#荨鹿通知设置好友消息开启")
      row("好友撤回", "bot", botCfg.friend_recall, "指令：#荨鹿通知设置好友撤回开启")
      row("好友申请", "bot", botCfg.friend_request, "指令：#荨鹿通知设置好友申请开启")
      row("群邀请", "bot", botCfg.group_invite, "指令：#荨鹿通知设置群邀请开启")
      lines.push("")

      if (groupCfg) {
        row("群消息", "group", groupCfg.group_message, "指令：#荨鹿通知设置群消息开启")
        row("群临时消息", "group", groupCfg.group_temp_message, "指令：#荨鹿通知设置群临时消息开启")
        row("群撤回", "group", groupCfg.group_recall, "指令：#荨鹿通知设置群撤回开启")
        row("加群申请", "group", groupCfg.group_join_request, "指令：#荨鹿通知设置加群申请开启")
        row(
          "群成员变动",
          "group",
          groupCfg.group_member_change,
          "指令：#荨鹿通知设置群成员变动开启",
        )
        row("群管理变动", "group", groupCfg.group_admin_change, "指令：#荨鹿通知设置群管理变动开启")
        row("Bot 被禁言", "group", groupCfg.bot_muted, "指令：#荨鹿通知设置禁言开启")
        row(
          "群聊列表变动",
          "group",
          groupCfg.group_list_change,
          "仅 bot 进/退群事件 best-effort（无轮询）",
        )
      } else {
        lines.push("（群单独设置需在群内查看）")
      }
      lines.push("")

      row(
        "好友列表变动",
        "global",
        globalCfg.friend_list_change,
        "轮询未启用，暂不生效（指令：#荨鹿通知设置好友列表变动开启）",
      )
      lines.push("")

      row("通知全部主人", "system", sys.notify_all_masters, "指令：#荨鹿通知设置全部通知开启")
      lines.push(
        `删除缓存时间（系统）：${Math.max(1, Math.floor(Number(sys.cache_ttl_sec) || 60))} 秒`,
      )
      lines.push("指令：#荨鹿通知设置删除缓存时间 60 秒")

      return await ctx.reply(lines.join("\n").trim())
    },
  )

  bot.registerCommand(
    [
      "^(|#)荨鹿通知设置删除缓存时间\\s*(\\d+)\\s*(秒|s)?$",
      { example: ["#荨鹿通知设置删除缓存时间 60 秒"], desc: "设置通知去重缓存时间（秒）" },
    ],
    async ctx => {
      if (!ctx.isMaster) return await ctx.reply("仅主人可用")
      const m = String(ctx.msg || "").match(/删除缓存时间\s*(\d+)/)
      const sec = Math.max(1, Math.floor(Number(m?.[1] || 60)))
      const next = setSystemNoticeConfig({ cache_ttl_sec: sec })
      return await ctx.reply(
        `删除缓存时间已设置为 ${next.cache_ttl_sec} 秒（用于通知去重缓存 TTL）`,
      )
    },
  )

  bot.registerCommand(
    [
      "^(|#)荨鹿通知设置(.+?)(单独)?(开启|关闭)$",
      { example: ["#荨鹿通知设置群消息开启"], desc: "开启/关闭指定通知（主人）" },
    ],
    async ctx => {
      if (!ctx.isMaster) return await ctx.reply("仅主人可用")
      const m = String(ctx.msg || "").match(/^#?荨鹿通知设置(.+?)(?:单独)?(开启|关闭)$/)
      if (!m) return false
      const name = String(m[1] || "").trim()
      const enable = String(m[2] || "") === "开启"
      return await handleNoticeToggle(ctx, name, enable)
    },
  )

  // 戳一戳开关（主人）
  bot.registerCommand(
    ["^(|#)开启戳一戳$", { example: ["#开启戳一戳"], desc: "开启戳一戳回复（chuo 插件）" }],
    async ctx => {
      if (!ctx.isMaster) return await ctx.reply("仅主人可用")
      setChuoEnabled(true)
      return await ctx.reply("戳一戳已开启")
    },
  )
  bot.registerCommand(
    ["^(|#)关闭戳一戳$", { example: ["#关闭戳一戳"], desc: "关闭戳一戳回复（chuo 插件）" }],
    async ctx => {
      if (!ctx.isMaster) return await ctx.reply("仅主人可用")
      setChuoEnabled(false)
      return await ctx.reply("戳一戳已关闭")
    },
  )

  // ===================== 通知推送（事件型） =====================
  // 群消息（群单独）
  bot.registerCommand(["", "message.group.*", 100], async ctx => {
    try {
      const groupId = toInt(ctx.group_id)
      if (!groupId) return false

      const gcfg = getGroupNoticeConfig(groupId)
      if (!gcfg.group_message) return false

      const senderName = ctx?.sender?.card || ctx?.sender?.nickname || ""
      const groupName = ctx?.group_name ? String(ctx.group_name) : ""
      const key = `group_message:${groupId}:${ctx.message_id ?? ctx.seq ?? ctx.message_seq ?? ctx.time ?? ""}`
      const payload = await createMessageAwareNotice(ctx, {
        title: "[荨鹿通知][群消息]",
        groupId,
        groupName,
        users: [{ label: "用户", userId: ctx.user_id, preferredName: senderName }],
        message: ctx.message,
        time: ctx.time,
        forwardTitle: "[荨鹿通知][群消息详情]",
      })
      await sendToMasters(ctx, payload, { dedupeKey: key })
    } catch (err) {
      console.warn("[group] group message notify failed:", err?.message || err)
    }
    return false
  })

  // 私聊消息（好友/临时）
  bot.registerCommand(["", "message.private.*", 100], async ctx => {
    try {
      const sid = toInt(ctx.self_id)
      if (!sid) return false

      // 群临时消息（群单独）
      if (isTempMessage(ctx)) {
        const groupId = getTempGroupId(ctx)
        if (!groupId) return false
        const gcfg = getGroupNoticeConfig(groupId)
        if (!gcfg.group_temp_message) return false

        const senderName = ctx?.sender?.card || ctx?.sender?.nickname || ""
        const key = `group_temp_message:${groupId}:${ctx.message_id ?? ctx.seq ?? ctx.message_seq ?? ctx.time ?? ""}`
        const payload = await createMessageAwareNotice(ctx, {
          title: "[荨鹿通知][群临时消息]",
          groupId,
          users: [{ label: "用户", userId: ctx.user_id, preferredName: senderName }],
          message: ctx.message,
          time: ctx.time,
          forwardTitle: "[荨鹿通知][群临时消息详情]",
        })
        await sendToMasters(ctx, payload, { dedupeKey: key })
        return false
      }

      // 好友消息（Bot 单独）
      const bcfg = getBotNoticeConfig(sid)
      if (!bcfg.friend_message) return false

      const senderName = ctx?.sender?.card || ctx?.sender?.nickname || ""
      const key = `friend_message:${sid}:${ctx.user_id ?? ""}:${ctx.message_id ?? ctx.seq ?? ctx.message_seq ?? ctx.time ?? ""}`
      const payload = await createMessageAwareNotice(ctx, {
        title: "[荨鹿通知][好友消息]",
        users: [{ label: "用户", userId: ctx.user_id, preferredName: senderName }],
        message: ctx.message,
        time: ctx.time,
        forwardTitle: "[荨鹿通知][好友消息详情]",
      })
      await sendToMasters(ctx, payload, { dedupeKey: key })
    } catch (err) {
      console.warn("[group] private message notify failed:", err?.message || err)
    }
    return false
  })

  // 群撤回（群单独）
  bot.registerCommand(["", "notice.group.recall", 100], async ctx => {
    try {
      const groupId = toInt(ctx.group_id)
      if (!groupId) return false

      const gcfg = getGroupNoticeConfig(groupId)
      if (!gcfg.group_recall) return false

      const groupName = ctx?.group_name ? String(ctx.group_name) : ""
      const operatorId = ctx.operator_id ?? ctx?.operatorId ?? ""
      const senderId = ctx.user_id ?? ctx.sender_id ?? ""
      const msgId = ctx.message_id ?? ""
      const seq = ctx.message_seq ?? ctx.seq ?? ""
      const recalled = await getRecalledMessageSafe(ctx)

      const key = `group_recall:${groupId}:${msgId || seq || ctx.time || ""}`
      const payload = await createMessageAwareNotice(ctx, {
        title: "[荨鹿通知][群撤回]",
        groupId,
        groupName,
        users: [
          {
            label: "发送者",
            userId: senderId,
            preferredName: recalled?.sender?.card || recalled?.sender?.nickname || "",
          },
          operatorId ? { label: "操作者", userId: operatorId } : null,
        ].filter(Boolean),
        lines: [
          msgId ? `message_id：${msgId}` : "",
          seq ? `message_seq：${seq}` : "",
          ctx.display_suffix ? `提示：${ctx.display_suffix}` : "",
        ],
        message: recalled,
        time: recalled?.time ?? ctx.time,
        missingLine: "内容：未找到已撤回原消息",
        forwardTitle: "[荨鹿通知][群撤回消息]",
      })
      await sendToMasters(ctx, payload, { dedupeKey: key })
    } catch (err) {
      console.warn("[group] group recall notify failed:", err?.message || err)
    }
    return false
  })

  // 好友撤回（Bot 单独）
  bot.registerCommand(["", "notice.private.recall", 100], async ctx => {
    try {
      const proto = String(ctx?.protocol || "").toLowerCase()
      if (proto === "milky" && String(ctx?.message_scene || "") !== "friend") return false

      const sid = toInt(ctx.self_id)
      if (!sid) return false
      const bcfg = getBotNoticeConfig(sid)
      if (!bcfg.friend_recall) return false

      const operatorId = ctx.operator_id ?? ctx?.operatorId ?? ""
      const senderId = ctx.user_id ?? ctx.sender_id ?? ""
      const msgId = ctx.message_id ?? ""
      const seq = ctx.message_seq ?? ctx.seq ?? ""
      const recalled = await getRecalledMessageSafe(ctx)

      const key = `friend_recall:${sid}:${senderId}:${msgId || seq || ctx.time || ""}`
      const payload = await createMessageAwareNotice(ctx, {
        title: "[荨鹿通知][好友撤回]",
        users: [
          {
            label: "用户",
            userId: senderId,
            preferredName: recalled?.sender?.card || recalled?.sender?.nickname || "",
          },
          operatorId ? { label: "操作者", userId: operatorId } : null,
        ].filter(Boolean),
        lines: [
          msgId ? `message_id：${msgId}` : "",
          seq ? `message_seq：${seq}` : "",
          ctx.display_suffix ? `提示：${ctx.display_suffix}` : "",
        ],
        message: recalled,
        time: recalled?.time ?? ctx.time,
        missingLine: "内容：未找到已撤回原消息",
        forwardTitle: "[荨鹿通知][好友撤回消息]",
      })
      await sendToMasters(ctx, payload, { dedupeKey: key })
    } catch (err) {
      console.warn("[group] friend recall notify failed:", err?.message || err)
    }
    return false
  })

  // 好友申请（Bot 单独）
  bot.registerCommand(["", "request.private.friend", 100], async ctx => {
    try {
      const sid = toInt(ctx.self_id)
      if (!sid) return false
      const bcfg = getBotNoticeConfig(sid)
      if (!bcfg.friend_request) return false

      const userId = ctx.user_id ?? ctx.initiator_id ?? ctx.initiatorId ?? ""
      const comment = ctx.comment ?? ""
      const via = ctx.via ?? ""
      const flag = ctx.flag ?? ctx.notification_seq ?? ""
      const key = `friend_request:${sid}:${userId}:${flag || ctx.time || ""}`
      const payload = await createSummaryNotice(ctx, {
        title: "[荨鹿通知][好友申请]",
        users: [{ label: "用户", userId }],
        lines: [
          flag ? `flag：${flag}` : "",
          via ? `来源：${via}` : "",
          comment ? `附言：${clampText(comment, 120)}` : "",
        ],
      })
      await sendToMasters(ctx, payload, { dedupeKey: key })
    } catch (err) {
      console.warn("[group] friend request notify failed:", err?.message || err)
    }
    return false
  })

  // 加群申请（群单独）
  bot.registerCommand(["", "request.group.add", 100], async ctx => {
    try {
      const groupId = toInt(ctx.group_id)
      if (!groupId) return false
      const gcfg = getGroupNoticeConfig(groupId)
      if (!gcfg.group_join_request) return false

      const userId = ctx.user_id ?? ctx.initiator_id ?? ""
      const comment = ctx.comment ?? ""
      const flag = ctx.flag ?? ctx.notification_seq ?? ""
      const key = `group_join_request:${groupId}:${userId}:${flag || ctx.time || ""}`
      const payload = await createSummaryNotice(ctx, {
        title: "[荨鹿通知][加群申请]",
        groupId,
        users: [{ label: "用户", userId }],
        lines: [flag ? `flag：${flag}` : "", comment ? `附言：${clampText(comment, 120)}` : ""],
      })
      await sendToMasters(ctx, payload, { dedupeKey: key })
    } catch (err) {
      console.warn("[group] group join request notify failed:", err?.message || err)
    }
    return false
  })

  // request.group.invite：milky=邀请入群审核（群单独）；onebot=bot 被邀请入群（Bot 单独）
  bot.registerCommand(["", "request.group.invite", 100], async ctx => {
    try {
      const proto = String(ctx?.protocol || "").toLowerCase()

      if (proto === "milky") {
        const groupId = toInt(ctx.group_id)
        if (!groupId) return false
        const gcfg = getGroupNoticeConfig(groupId)
        if (!gcfg.group_join_request) return false

        const inviter = ctx.initiator_id ?? ""
        const target = ctx.target_user_id ?? ""
        const flag = ctx.flag ?? ctx.notification_seq ?? ""
        const key = `group_invited_join_request:${groupId}:${inviter}:${target}:${flag || ctx.time || ""}`
        const payload = await createSummaryNotice(ctx, {
          title: "[荨鹿通知][加群申请-邀请入群审核]",
          groupId,
          users: [
            target ? { label: "被邀请者", userId: target } : null,
            inviter ? { label: "邀请者", userId: inviter } : null,
          ].filter(Boolean),
          lines: [flag ? `flag：${flag}` : ""],
        })
        await sendToMasters(ctx, payload, { dedupeKey: key })
        return false
      }

      const sid = toInt(ctx.self_id)
      if (!sid) return false
      const bcfg = getBotNoticeConfig(sid)
      if (!bcfg.group_invite) return false

      const groupId = toInt(ctx.group_id)
      const inviter = ctx.user_id ?? ""
      const flag = ctx.flag ?? ""
      const key = `group_invite:${sid}:${groupId || ""}:${inviter}:${flag || ctx.time || ""}`
      const payload = await createSummaryNotice(ctx, {
        title: "[荨鹿通知][群邀请]",
        groupId,
        users: [inviter ? { label: "邀请者", userId: inviter } : null].filter(Boolean),
        lines: [flag ? `flag：${flag}` : ""],
      })
      await sendToMasters(ctx, payload, { dedupeKey: key })
    } catch (err) {
      console.warn("[group] group invite notify failed:", err?.message || err)
    }
    return false
  })

  // milky: bot 被邀请入群事件
  bot.registerCommand(["", "notice.group.invited", 100], async ctx => {
    try {
      const sid = toInt(ctx.self_id)
      if (!sid) return false
      const bcfg = getBotNoticeConfig(sid)
      if (!bcfg.group_invite) return false

      const groupId = toInt(ctx.group_id)
      const inviter = ctx.initiator_id ?? ""
      const seq = ctx.invitation_seq ?? ""
      const key = `group_invite:${sid}:${groupId || ""}:${inviter}:${seq || ctx.time || ""}`
      const payload = await createSummaryNotice(ctx, {
        title: "[荨鹿通知][群邀请]",
        groupId,
        users: [inviter ? { label: "邀请者", userId: inviter } : null].filter(Boolean),
        lines: [seq ? `invitation_seq：${seq}` : ""],
      })
      await sendToMasters(ctx, payload, { dedupeKey: key })
    } catch (err) {
      console.warn("[group] milky group invited notify failed:", err?.message || err)
    }
    return false
  })

  // 群成员变动（群单独） + 群聊列表变动（仅 bot 自己进/退群）
  bot.registerCommand(["", "notice.group.increase", 100], async ctx => {
    try {
      const groupId = toInt(ctx.group_id)
      if (!groupId) return false

      const gcfg = getGroupNoticeConfig(groupId)
      const uid = toInt(ctx.user_id)
      const sid = toInt(ctx.self_id)

      if (uid && sid && uid === sid) {
        if (!gcfg.group_list_change) return false
        const key = `group_list_change:join:${sid}:${groupId}:${ctx.time || ""}`
        const payload = await createSummaryNotice(ctx, {
          title: "[荨鹿通知][群聊列表变动]",
          groupId,
          users: [{ label: "Bot", userId: sid, preferredName: "Bot" }],
          lines: [`Bot 已加入群：${groupId}`],
        })
        await sendToMasters(ctx, payload, { dedupeKey: key })
        return false
      }

      if (!gcfg.group_member_change) return false

      const operator = ctx.operator_id ?? ""
      const invitor = ctx.invitor_id ?? ""
      const key = `group_member_increase:${groupId}:${uid || ""}:${ctx.time || ""}`
      const payload = await createSummaryNotice(ctx, {
        title: "[荨鹿通知][群成员增加]",
        groupId,
        users: [
          uid ? { label: "用户", userId: uid } : null,
          operator ? { label: "管理员", userId: operator } : null,
          invitor ? { label: "邀请者", userId: invitor } : null,
        ].filter(Boolean),
      })
      await sendToMasters(ctx, payload, { dedupeKey: key })
    } catch (err) {
      console.warn("[group] group increase notify failed:", err?.message || err)
    }
    return false
  })

  bot.registerCommand(["", "notice.group.decrease", 100], async ctx => {
    try {
      const groupId = toInt(ctx.group_id)
      if (!groupId) return false

      const gcfg = getGroupNoticeConfig(groupId)
      const uid = toInt(ctx.user_id)
      const sid = toInt(ctx.self_id)

      if (uid && sid && uid === sid) {
        if (!gcfg.group_list_change) return false
        const key = `group_list_change:leave:${sid}:${groupId}:${ctx.time || ""}`
        const payload = await createSummaryNotice(ctx, {
          title: "[荨鹿通知][群聊列表变动]",
          groupId,
          users: [{ label: "Bot", userId: sid, preferredName: "Bot" }],
          lines: [`Bot 已退出/被移出群：${groupId}`],
        })
        await sendToMasters(ctx, payload, { dedupeKey: key })
        return false
      }

      if (!gcfg.group_member_change) return false

      const operator = ctx.operator_id ?? ""
      const key = `group_member_decrease:${groupId}:${uid || ""}:${ctx.time || ""}`
      const payload = await createSummaryNotice(ctx, {
        title: "[荨鹿通知][群成员减少]",
        groupId,
        users: [
          uid ? { label: "用户", userId: uid } : null,
          operator ? { label: "操作者", userId: operator } : null,
        ].filter(Boolean),
      })
      await sendToMasters(ctx, payload, { dedupeKey: key })
    } catch (err) {
      console.warn("[group] group decrease notify failed:", err?.message || err)
    }
    return false
  })

  // 群管理变动（群单独）
  bot.registerCommand(["", "notice.group.admin", 100], async ctx => {
    try {
      const groupId = toInt(ctx.group_id)
      if (!groupId) return false
      const gcfg = getGroupNoticeConfig(groupId)
      if (!gcfg.group_admin_change) return false

      const uid = ctx.user_id ?? ""
      const operator = ctx.operator_id ?? ""
      const isSet = ctx.is_set
      const key = `group_admin_change:${groupId}:${uid}:${ctx.time || ""}`
      const payload = await createSummaryNotice(ctx, {
        title: "[荨鹿通知][群管理变动]",
        groupId,
        users: [
          uid ? { label: "用户", userId: uid } : null,
          operator ? { label: "操作者", userId: operator } : null,
        ].filter(Boolean),
        lines: [isSet === true ? "变更：设置为管理员" : isSet === false ? "变更：取消管理员" : ""],
      })
      await sendToMasters(ctx, payload, { dedupeKey: key })
    } catch (err) {
      console.warn("[group] group admin notify failed:", err?.message || err)
    }
    return false
  })

  // Bot 被禁言（群单独）
  bot.registerCommand(["", "notice.group.ban", 100], async ctx => {
    try {
      const groupId = toInt(ctx.group_id)
      if (!groupId) return false

      const uid = toInt(ctx.user_id)
      const sid = toInt(ctx.self_id)
      if (!uid || !sid || uid !== sid) return false

      const gcfg = getGroupNoticeConfig(groupId)
      if (!gcfg.bot_muted) return false

      const operator = ctx.operator_id ?? ""
      const dur = ctx.duration ?? ""
      const key = `bot_muted:${groupId}:${sid}:${ctx.time || ""}`
      const payload = await createSummaryNotice(ctx, {
        title: "[荨鹿通知][Bot 被禁言]",
        groupId,
        users: [
          { label: "Bot", userId: sid, preferredName: "Bot" },
          operator ? { label: "操作者", userId: operator } : null,
        ].filter(Boolean),
        lines: [dur !== "" ? `时长：${dur} 秒` : ""],
      })
      await sendToMasters(ctx, payload, { dedupeKey: key })
    } catch (err) {
      console.warn("[group] bot muted notify failed:", err?.message || err)
    }
    return false
  })

  bot.registerCommand(["", "notice.group.allban", 100], async ctx => {
    try {
      const groupId = toInt(ctx.group_id)
      if (!groupId) return false

      const gcfg = getGroupNoticeConfig(groupId)
      if (!gcfg.bot_muted) return false

      const operator = ctx.operator_id ?? ""
      const enable = ctx.enable ?? ctx.is_mute
      const key = `group_allban:${groupId}:${String(enable)}:${ctx.time || ""}`
      const payload = await createSummaryNotice(ctx, {
        title: "[荨鹿通知][群全员禁言]",
        groupId,
        users: [operator ? { label: "操作者", userId: operator } : null].filter(Boolean),
        lines: [enable !== undefined ? `状态：${enable ? "开启" : "关闭"}` : ""],
      })
      await sendToMasters(ctx, payload, { dedupeKey: key })
    } catch (err) {
      console.warn("[group] allban notify failed:", err?.message || err)
    }
    return false
  })

  // ===================== 基础助手（主人） =====================
  bot.registerCommand(
    [
      "^(|#)发好友\\s+([1-9]\\d{3,12})\\s+(.+)$",
      { example: ["#发好友 10001 你好"], desc: "向指定好友发送消息（主人）" },
    ],
    async ctx => {
      if (!ctx.isMaster) return await ctx.reply("仅主人可用")
      const m = String(ctx.msg || "").match(/^(?:#)?发好友\s+([1-9]\d{3,12})\s+([\s\S]+)$/)
      if (!m) return false
      const user_id = toInt(m[1])
      const msg = String(m[2] || "").trim()
      if (!user_id || !msg) return await ctx.reply("用法：#发好友 QQ号 消息")
      if (typeof ctx.sendMessage === "function") await ctx.sendMessage(String(user_id), msg)
      else if (typeof ctx.pickUser === "function") await ctx.pickUser(user_id).sendMsg(msg)
      else throw new Error("send API not available")
      return await ctx.reply(`已发送：${user_id}`)
    },
  )

  bot.registerCommand(
    [
      "^(|#)发群聊\\s+(\\d+)\\s+(.+)$",
      { example: ["#发群聊 123 你好"], desc: "向指定群聊发送消息（主人）" },
    ],
    async ctx => {
      if (!ctx.isMaster) return await ctx.reply("仅主人可用")
      const m = String(ctx.msg || "").match(/^(?:#)?发群聊\s+(\d+)\s+([\s\S]+)$/)
      if (!m) return false
      const group_id = toInt(m[1])
      const msg = String(m[2] || "").trim()
      if (!group_id || !msg) return await ctx.reply("用法：#发群聊 群号 消息")
      await ctx.sendMessage({ group_id }, msg)
      return await ctx.reply(`已发送：${group_id}`)
    },
  )

  bot.registerCommand(
    [
      "^(|#)发群列表\\s+([0-9,，]+)\\s+(.+)$",
      { example: ["#发群列表 1,2,3 你好"], desc: "向多个群发送消息（主人）" },
    ],
    async ctx => {
      if (!ctx.isMaster) return await ctx.reply("仅主人可用")
      const m = String(ctx.msg || "").match(/^(?:#)?发群列表\s+([0-9,，]+)\s+([\s\S]+)$/)
      if (!m) return false
      const listRaw = String(m[1] || "").replace(/，/g, ",")
      const msg = String(m[2] || "").trim()
      const ids = listRaw
        .split(",")
        .map(s => toInt(s))
        .filter(Boolean)
      const uniq = Array.from(new Set(ids))
      if (!uniq.length || !msg) return await ctx.reply("用法：#发群列表 1,2,3 消息")

      const results = []
      for (const group_id of uniq) {
        try {
          await ctx.sendMessage({ group_id }, msg)
          results.push({ group_id, ok: true })
        } catch (err) {
          results.push({ group_id, ok: false, error: err?.message || String(err) })
        }
      }

      const okCount = results.filter(r => r.ok).length
      const fail = results.find(r => !r.ok)
      const failText = fail ? `，失败：${fail.group_id}（${fail.error || "未知错误"}）` : ""
      return await ctx.reply(`群发完成：成功 ${okCount}/${results.length}${failText}`)
    },
  )

  bot.registerCommand(
    ["^(|#)获取好友列表$", { example: ["#获取好友列表"], desc: "获取好友列表（主人）" }],
    async ctx => {
      if (!ctx.isMaster) return await ctx.reply("仅主人可用")
      const res = await ctx.getFriendList()
      const list = res instanceof Map ? Array.from(res.values()) : Array.isArray(res) ? res : []
      const shown = list.slice(0, 20)
      const lines = ["好友列表："]
      for (const f of shown) {
        const uid = f?.user_id ?? f?.id ?? ""
        const nick = f?.nickname ?? f?.remark ?? ""
        lines.push(`- ${nick || uid}(${uid})`)
      }
      if (list.length > shown.length) lines.push(`- ...(共 ${list.length} 个，已省略)`)
      return await ctx.reply(lines.join("\n").trim())
    },
  )

  bot.registerCommand(
    ["^(|#)获取群列表$", { example: ["#获取群列表"], desc: "获取群列表（主人）" }],
    async ctx => {
      if (!ctx.isMaster) return await ctx.reply("仅主人可用")
      const res = await ctx.getGroupList()
      const list = res instanceof Map ? Array.from(res.values()) : Array.isArray(res) ? res : []
      const shown = list.slice(0, 20)
      const lines = ["群列表："]
      for (const g of shown) {
        const gid = g?.group_id ?? g?.id ?? ""
        const name = g?.group_name ?? g?.name ?? ""
        lines.push(`- ${name || gid}(${gid})`)
      }
      if (list.length > shown.length) lines.push(`- ...(共 ${list.length} 个，已省略)`)
      return await ctx.reply(lines.join("\n").trim())
    },
  )

  bot.registerCommand(
    ["^(|#)退群\\s+(\\d+)$", { example: ["#退群 123"], desc: "让 Bot 退出群聊（主人）" }],
    async ctx => {
      if (!ctx.isMaster) return await ctx.reply("仅主人可用")
      const m = String(ctx.msg || "").match(/^(?:#)?退群\s+(\d+)$/)
      if (!m) return false
      const group_id = toInt(m[1])
      if (!group_id) return await ctx.reply("用法：#退群 群号")
      await ctx.quitGroup({ group_id })
      return await ctx.reply(`已尝试退群：${group_id}`)
    },
  )

  bot.registerCommand(
    ["^(|#)撤回$", { example: ["#撤回"], desc: "撤回 Bot 发送的消息（需回复那条消息，主人）" }],
    async ctx => {
      if (!ctx.isMaster) return await ctx.reply("仅主人可用")
      const replied = await ctx.getReplyMessage?.()
      if (!replied) return await ctx.reply("请先回复要撤回的消息")

      const senderId = toInt(replied.user_id ?? replied.sender_id ?? replied?.sender?.user_id)
      const selfId = toInt(ctx.self_id)
      if (!selfId || !senderId || senderId !== selfId) {
        return await ctx.reply("只能撤回 bot 自己发的消息（请回复 bot 发出的那条）")
      }

      const isGroup = Boolean(ctx.group_id ?? replied.group_id ?? replied.peer_id)
      const peer_id = isGroup
        ? toInt(ctx.group_id ?? replied.group_id ?? replied.peer_id)
        : toInt(ctx.user_id ?? replied.user_id ?? replied.peer_id)

      const message_id = replied.message_id ?? replied.messageId ?? replied?.data?.message_id
      const message_seq = replied.message_seq ?? replied.seq ?? replied?.data?.message_seq

      await ctx.recallMessage({
        peer_id,
        message_id,
        message_seq,
        isGroup,
      })

      return await ctx.reply("已尝试撤回")
    },
  )

  bot.registerCommand(
    [
      "^(|#)设置日志等级\\s+(trace|debug|info|warn|fatal|mark|error|off)$",
      { example: ["#设置日志等级 debug"], desc: "设置 xunlu-core 日志等级（主人，重启生效）" },
    ],
    async ctx => {
      if (!ctx.isMaster) return await ctx.reply("仅主人可用")
      const m = String(ctx.msg || "").match(
        /设置日志等级\s+(trace|debug|info|warn|fatal|mark|error|off)/i,
      )
      const level = String(m?.[1] || "").toLowerCase()
      if (!level) return false
      cfg.setConfigValue("bot", "log_level", level)
      return await ctx.reply(`日志等级已设置为：${level}（重启生效）`)
    },
  )

  bot.registerCommand(
    [
      "^(|#)(查看头像|看头像)\\s+([1-9]\\d{3,12})$",
      { example: ["#查看头像 10001"], desc: "查看 QQ 头像（主人）" },
    ],
    async ctx => {
      if (!ctx.isMaster) return await ctx.reply("仅主人可用")
      const m = String(ctx.msg || "").match(/(查看头像|看头像)\s+([1-9]\d{3,12})/)
      const uid = toInt(m?.[2])
      if (!uid) return false
      const url = `https://q1.qlogo.cn/g?b=qq&nk=${uid}&s=100`
      return await ctx.reply({ type: "image", data: { url } })
    },
  )

  bot.registerCommand(
    [
      "^(|#)(查看群头像|看群头像)\\s+(\\d+)$",
      { example: ["#查看群头像 123"], desc: "查看群头像（主人）" },
    ],
    async ctx => {
      if (!ctx.isMaster) return await ctx.reply("仅主人可用")
      const m = String(ctx.msg || "").match(/(查看群头像|看群头像)\s+(\d+)/)
      const gid = toInt(m?.[2])
      if (!gid) return false
      const url = `https://p.qlogo.cn/gh/${gid}/${gid}/100`
      return await ctx.reply({ type: "image", data: { url } })
    },
  )

  // ===================== 群管（管理员/主人） =====================
  bot.registerCommand(
    ["^(|#)禁言\\s+.*$", { example: ["#禁言 @用户 60秒"], desc: "禁言群成员（管理员/主人）" }],
    async ctx => {
      if (!ctx.group_id) return await ctx.reply("请在群内使用")
      if (!(await checkUserAdminOrMaster(ctx))) return await ctx.reply("需要管理员权限")
      if (!(await checkBotAdmin(ctx))) return await ctx.reply("Bot 需要管理员权限")

      const raw = String(ctx.msg || "")
        .replace(/^(#)?禁言/, "")
        .trim()
      const parts = raw.split(/\s+/).filter(Boolean)
      const target = toInt(ctx.at) ?? toInt(parts[0])
      const durText = ctx.at ? parts[0] || "" : parts[1] || ""
      const duration = parseDurationSeconds(durText)

      if (!target) return await ctx.reply("用法：#禁言 @用户 60秒")
      if (duration <= 0) return await ctx.reply("用法：#禁言 @用户 60秒（支持 秒/分/小时/天）")

      await ctx.setGroupMemberMute({ group_id: ctx.group_id, user_id: target, duration })
      return await ctx.reply(`已禁言：${target}（${duration} 秒）`)
    },
  )

  bot.registerCommand(
    ["^(|#)解禁\\s+.*$", { example: ["#解禁 @用户"], desc: "解除禁言（管理员/主人）" }],
    async ctx => {
      if (!ctx.group_id) return await ctx.reply("请在群内使用")
      if (!(await checkUserAdminOrMaster(ctx))) return await ctx.reply("需要管理员权限")
      if (!(await checkBotAdmin(ctx))) return await ctx.reply("Bot 需要管理员权限")

      const raw = String(ctx.msg || "")
        .replace(/^(#)?解禁/, "")
        .trim()
      const parts = raw.split(/\s+/).filter(Boolean)
      const target = toInt(ctx.at) ?? toInt(parts[0])
      if (!target) return await ctx.reply("用法：#解禁 @用户")

      await ctx.setGroupMemberMute({ group_id: ctx.group_id, user_id: target, duration: 0 })
      return await ctx.reply(`已解禁：${target}`)
    },
  )

  bot.registerCommand(
    ["^(|#)全体禁言$", { example: ["#全体禁言"], desc: "全体禁言（管理员/主人）" }],
    async ctx => {
      if (!ctx.group_id) return await ctx.reply("请在群内使用")
      if (!(await checkUserAdminOrMaster(ctx))) return await ctx.reply("需要管理员权限")
      if (!(await checkBotAdmin(ctx))) return await ctx.reply("Bot 需要管理员权限")
      await ctx.setGroupWholeMute({ group_id: ctx.group_id, enable: true })
      return await ctx.reply("已尝试开启全体禁言")
    },
  )

  bot.registerCommand(
    ["^(|#)全体解禁$", { example: ["#全体解禁"], desc: "解除全体禁言（管理员/主人）" }],
    async ctx => {
      if (!ctx.group_id) return await ctx.reply("请在群内使用")
      if (!(await checkUserAdminOrMaster(ctx))) return await ctx.reply("需要管理员权限")
      if (!(await checkBotAdmin(ctx))) return await ctx.reply("Bot 需要管理员权限")
      await ctx.setGroupWholeMute({ group_id: ctx.group_id, enable: false })
      return await ctx.reply("已尝试解除全体禁言")
    },
  )

  bot.registerCommand(
    ["^(|#)踢黑\\s+.*$", { example: ["#踢黑 @用户"], desc: "踢出并拉黑（管理员/主人）" }],
    async ctx => {
      if (!ctx.group_id) return await ctx.reply("请在群内使用")
      if (!(await checkUserAdminOrMaster(ctx))) return await ctx.reply("需要管理员权限")
      if (!(await checkBotAdmin(ctx))) return await ctx.reply("Bot 需要管理员权限")

      const raw = String(ctx.msg || "")
        .replace(/^(#)?踢黑/, "")
        .trim()
      const parts = raw.split(/\s+/).filter(Boolean)
      const target = toInt(ctx.at) ?? toInt(parts[0])
      if (!target) return await ctx.reply("用法：#踢黑 @用户")

      await ctx.kickGroupMember({
        group_id: ctx.group_id,
        user_id: target,
        reject_add_request: true,
      })
      return await ctx.reply(`已尝试踢黑：${target}`)
    },
  )

  bot.registerCommand(
    ["^(|#)踢\\s+.*$", { example: ["#踢 @用户"], desc: "踢出群成员（管理员/主人）" }],
    async ctx => {
      if (!ctx.group_id) return await ctx.reply("请在群内使用")
      if (!(await checkUserAdminOrMaster(ctx))) return await ctx.reply("需要管理员权限")
      if (!(await checkBotAdmin(ctx))) return await ctx.reply("Bot 需要管理员权限")

      const raw = String(ctx.msg || "")
        .replace(/^(#)?踢/, "")
        .trim()
      const parts = raw.split(/\s+/).filter(Boolean)
      const target = toInt(ctx.at) ?? toInt(parts[0])
      if (!target) return await ctx.reply("用法：#踢 @用户")

      await ctx.kickGroupMember({
        group_id: ctx.group_id,
        user_id: target,
        reject_add_request: false,
      })
      return await ctx.reply(`已尝试踢出：${target}`)
    },
  )

  bot.registerCommand(
    [
      "^(|#)设置管理\\s+.*$",
      { example: ["#设置管理 @用户"], desc: "设置群管理员（主人，Bot需群主）" },
    ],
    async ctx => {
      if (!ctx.isMaster) return await ctx.reply("仅主人可用")
      if (!ctx.group_id) return await ctx.reply("请在群内使用")
      if (!(await checkBotOwner(ctx))) return await ctx.reply("Bot 需要是群主才能设置管理")

      const raw = String(ctx.msg || "")
        .replace(/^(#)?设置管理/, "")
        .trim()
      const parts = raw.split(/\s+/).filter(Boolean)
      const target = toInt(ctx.at) ?? toInt(parts[0])
      if (!target) return await ctx.reply("用法：#设置管理 @用户")

      await ctx.setGroupMemberAdmin({ group_id: ctx.group_id, user_id: target, enable: true })
      return await ctx.reply(`已尝试设置管理：${target}`)
    },
  )

  bot.registerCommand(
    [
      "^(|#)取消管理\\s+.*$",
      { example: ["#取消管理 @用户"], desc: "取消群管理员（主人，Bot需群主）" },
    ],
    async ctx => {
      if (!ctx.isMaster) return await ctx.reply("仅主人可用")
      if (!ctx.group_id) return await ctx.reply("请在群内使用")
      if (!(await checkBotOwner(ctx))) return await ctx.reply("Bot 需要是群主才能取消管理")

      const raw = String(ctx.msg || "")
        .replace(/^(#)?取消管理/, "")
        .trim()
      const parts = raw.split(/\s+/).filter(Boolean)
      const target = toInt(ctx.at) ?? toInt(parts[0])
      if (!target) return await ctx.reply("用法：#取消管理 @用户")

      await ctx.setGroupMemberAdmin({ group_id: ctx.group_id, user_id: target, enable: false })
      return await ctx.reply(`已尝试取消管理：${target}`)
    },
  )

  bot.registerCommand(
    [
      "^(|#)修改头衔\\s+.*$",
      { example: ["#修改头衔 @用户 头衔"], desc: "修改群头衔（主人，Bot需群主）" },
    ],
    async ctx => {
      //if (!ctx.isMaster) return await ctx.reply("仅主人可用")
      if (!ctx.group_id) return await ctx.reply("请在群内使用")
      if (!(await checkBotOwner(ctx))) return await ctx.reply("Bot 需要是群主才能修改头衔")

      const raw = String(ctx.msg || "")
        .replace(/^(#)?修改头衔/, "")
        .trim()
      const parts = raw.split(/\s+/).filter(Boolean)
      let user_id = ctx.user_id
      let special_title = raw
      if (!ctx.isMaster && ctx.at) {
        if (ctx.at !== user_id) return await ctx.reply("非主人只能修改自己的头衔！")
      } else if (ctx.isMaster && ctx.at) {
        user_id = toInt(ctx.at) ?? toInt(parts[0])
        special_title = String(ctx.at ? raw : parts.slice(1).join(" ") || "").trim()

        if (!special_title) return await ctx.reply("用法：#修改头衔 @用户 头衔")
      }

      await ctx.setGroupMemberSpecialTitle({
        group_id: ctx.group_id,
        user_id,
        special_title,
      })
      return await ctx.reply(`已尝试修改头衔：${user_id}`)
    },
  )

  bot.registerCommand(
    ["^(|#)获取禁言列表$", { example: ["#获取禁言列表"], desc: "查看当前禁言成员（管理员/主人）" }],
    async ctx => {
      if (!ctx.group_id) return await ctx.reply("请在群内使用")
      if (!(await checkUserAdminOrMaster(ctx))) return await ctx.reply("需要管理员权限")

      const groupId = toInt(ctx.group_id)
      const nowSec = Math.floor(Date.now() / 1000)
      const res = await ctx.getGroupMemberList(groupId)
      const list = res instanceof Map ? Array.from(res.values()) : []

      const muted = []
      for (const m of list) {
        const end =
          toInt(m?.shut_up_end_time) ?? toInt(m?.shut_up_timestamp) ?? toInt(m?.shutup_time) ?? 0
        if (!end || end <= nowSec) continue
        muted.push({
          user_id: m?.user_id,
          nickname: m?.card || m?.nickname || "",
          end,
        })
      }

      if (!muted.length) return await ctx.reply("本群暂无禁言成员")

      muted.sort((a, b) => a.end - b.end)
      const shown = muted.slice(0, 20)
      const lines = ["禁言列表："]
      for (const m of shown) {
        const left = Math.max(0, m.end - nowSec)
        lines.push(`- ${m.nickname || m.user_id}(${m.user_id}) 剩余 ${left} 秒`)
      }
      if (muted.length > shown.length) lines.push(`- ...(共 ${muted.length} 个，已省略)`)
      return await ctx.reply(lines.join("\n").trim())
    },
  )

  bot.registerCommand(["", "request.group.add"], async ctx => {
    console.log("触发群申请可", ctx)

    const user_id = ctx.user_id
    let userInfo = await ctx.getUserInfo({ user_id })
    let passID = randomWithDigits(10)
    groupPass[passID] = {
      flag: ctx.flag,
      type: "join_request",
      group_id: ctx.group_id,
    }
    ctx.reply([
      {
        type: "text",
        data: {
          text: `这个吊毛要进来了\n${userInfo.nickname}（${user_id}）\n临时通行证ID:${passID}`,
        },
      },
      {
        type: "image",
        data: {
          uri: `https://q1.qlogo.cn/g?b=qq&nk=${user_id}}&s=100`,
        },
      },
      {
        type: "text",
        data: {
          text: ctx.comment,
        },
      },
    ])
  })
  bot.registerCommand(["(开门|关门)"], async ctx => {
    const replied = await ctx.getReplyMessage?.()
    if (!replied) return ctx.reply("未获取到申请信息")

    const text = (replied.message || [])
      .filter(seg => seg?.type === "text")
      .map(seg => seg?.data?.content || "")
      .join("")

    if (!text.includes("临时通行证ID")) return ctx.reply("未获取到申请信息")

    const passID = text.split("ID:")[1]?.trim()
    if (!passID || !groupPass[passID]) return ctx.reply("未获取到申请信息")

    if (ctx.msg == "开门") {
      await ctx.acceptGroupRequest(groupPass[passID])
      return ctx.reply("已开门！")
    }

    await ctx.rejectGroupRequest(groupPass[passID])
    return ctx.reply("已经把这个家伙拒之门外了！")
  })
  bot.registerCommand(["", "notice.group.increase"], async ctx => {
    let userInfo = await ctx.getUserInfo({ user_id: ctx.user_id })
    void bot
      .callFnc("tts-plugin-1", {
        ...ctx,
        msg: `可莉说欢迎${userInfo.nickname || "不知名的家伙"}入群,要好好和大家相处哦！`,
      })
      .catch(err => console.warn("[group] callFnc tts failed:", err?.message || err))
  })
  bot.registerCommand(["", "notice.group.decrease"], async ctx => {
    console.log("减员的ctx", ctx)
    let userInfo = await ctx.getUserInfo({ user_id: ctx.user_id })
    ctx.reply(`把${userInfo.nickname || "不知名的家伙"}丢出群了！`)
  })
  bot.registerCommand(["保存群员信息"], async ctx => {
    const member_list = await ctx.getGroupMemberList(ctx.group_id)
    console.log(member_list)
    let msglist = []
    for (let [key, value] of member_list) {
      msglist.push([
        segment.image(`https://q1.qlogo.cn/g?b=qq&nk=${value.user_id}}&s=100`),
        `昵称：${value.nickname}\n群名片：${value.card}\nQQ号：${value.user_id}\n等级：${value.level}\n加入时间:${moment(value.join_time * 1000).format("YYYY-MM-DD HH:mm:ss")}`,
      ])
    }
    let file = filemage.writeFileJsonData(`data/${ctx.group_id}.json`, msglist)

    await ctx.reply(segment.file(filemage.RootPath + `data/${ctx.group_id}.json`))
    return await ctx.reply(await ctx.makeGroupForwardMsg(ctx, msglist))
  })

  bot.registerCommand(["^今日发言记录$"], async ctx => {
    const targetUserId = ctx.at || ctx.user_id
    console.log(ctx)

    const rkeySuffix = String((await getSceneRkey("group"))?.value || "").trim()
    console.log("rkeysuffix:", rkeySuffix)

    let msgChat = await Bot.getGroupChatHistory(ctx.group_id)
    let msgList = msgChat
      .filter(item => item.user_id == targetUserId)
      .map(item => ({
        content: toForwardSafeSegments(item.message, { rkeySuffix }),
        time: item.time,
      }))
    console.log(msgList)
    if (msgList.length == 0) return ctx.reply(`今天${ctx.at ? "他" : "你"}还没有发言记录喽！`)

    await ctx.reply(await ctx.makeGroupForwardMsgByUser(targetUserId, msgList, "今日发言记录"))
  })

  bot.registerCommand(["^今日表情包$"], async ctx => {
    const targetUserId = ctx.at || ctx.user_id
    let msgChat = await Bot.getGroupChatHistory(ctx.group_id)
    const rkey = String((await getSceneRkey("group"))?.value || "").trim()
    const dealQQImgUrl = url => {
      if (!url) return ""
      return applyRkeyToUrl(url, rkey)
    }
    let msgList = msgChat
      .filter(item => item.user_id == targetUserId)
      .filter(item =>
        item.message.find(
          m => (m.type == "image" && m?.data?.summary != "[图片]") || m?.summary == "[图片]",
        ),
      )
      .map(item => ({
        content: item.message.map(m => ({
          ...m,
          file: dealQQImgUrl(m?.file || m?.data?.uri || m?.data?.temp_url),
        })),
        time: item.time,
      }))

    console.log(msgList)
    if (msgList.length == 0) return ctx.reply(`今天还没有人发过表情包哦！`)

    await ctx.reply(await ctx.makeGroupForwardMsgByUser(targetUserId, msgList, "今日发言记录"))
  })

  // bot.callFnc("test", { group_id: 434343, user_id: 232332 });
}

export function onBotEvent(event) {
  console.log("[example-plugin] received bot event:", event)
}
