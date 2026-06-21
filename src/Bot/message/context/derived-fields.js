import {
  UniversalSegmentType,
  getSegmentMediaFile,
  getSegmentMentionTarget,
  getSegmentReplyRef,
  getSegmentText,
  normalizeUniversalSegmentType,
} from "../universal-message.js"
import { classifyMediaReference } from "../core/media-reference.js"

const URL_REGEXP =
  /(https?|http|ftp|file):\/\/[-A-Za-z0-9+&@#/%?=~_|!:,.;]+[-A-Za-z0-9+&@#/%=~_|]/g

function toSafeNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : undefined
}

function normalizeDerivedSegmentType(type) {
  const rawType = String(type || "").trim()
  if (!rawType) return rawType

  try {
    return normalizeUniversalSegmentType(rawType)
  } catch {
    return rawType
  }
}

function getReplyRefFromSegments(segments) {
  if (!Array.isArray(segments)) return null
  const replySeg = segments.find(seg => seg?.type === UniversalSegmentType.REPLY)
  if (!replySeg) return null

  const ref = getSegmentReplyRef(replySeg)
  const msgId = ref?.id
  const seq = ref?.seq
  if (!msgId && seq === undefined) return null
  return { msgId, seq }
}

function getMessageRefFromCtx(ctx) {
  if (!ctx || typeof ctx !== "object") return { msgId: undefined, seq: undefined }

  const msgId =
    ctx.message_id !== undefined && ctx.message_id !== null ? String(ctx.message_id) : undefined

  const seq =
    toSafeNumber(ctx.seq) ??
    toSafeNumber(ctx.message_seq) ??
    (msgId !== undefined ? toSafeNumber(msgId) : undefined)

  return { msgId, seq }
}

function applyDerivedFieldsFromUniversalSegments(ctx) {
  if (!ctx || typeof ctx !== "object") return ctx
  const segments = ctx.universalSegments ?? ctx.message
  if (!Array.isArray(segments)) return ctx

  const text = segments
    .filter(seg => normalizeDerivedSegmentType(seg?.type) === UniversalSegmentType.TEXT)
    .map(seg => getSegmentText(seg))
    .join("")

  const hasExistingMsg =
    ctx.msg !== undefined &&
    ctx.msg !== null &&
    String(ctx.msg).trim() !== ""

  if (!hasExistingMsg) {
    ctx.msg = String(text).replace(/＃/g, "#").trim()
  }

  const msgText = String(hasExistingMsg ? ctx.msg : text).replace(/＃/g, "#").trim()
  if (!hasExistingMsg) ctx.msg = msgText
  ctx.url = msgText.match(URL_REGEXP)?.[0] || ""

  ctx.img = segments
    .filter(seg => normalizeDerivedSegmentType(seg?.type) === UniversalSegmentType.IMAGE)
    .map(seg => {
      if (seg?.data?.url) return seg.data.url
      const file = getSegmentMediaFile(seg)
      return classifyMediaReference(file).kind === "url" ? file : undefined
    })
    .filter(Boolean)

  const selfId = ctx.self_id !== undefined && ctx.self_id !== null ? String(ctx.self_id) : ""

  ctx.atBot = false
  ctx.at = ""
  ctx.atAll = false

  for (const seg of segments) {
    const type = normalizeDerivedSegmentType(seg?.type)
    if (type === UniversalSegmentType.MENTION_ALL) {
      ctx.atAll = true
      continue
    }
    if (type !== UniversalSegmentType.MENTION) continue
    const target = getSegmentMentionTarget(seg)
    if (!target) continue
    if (selfId && target === selfId) ctx.atBot = true
    else ctx.at = target
  }

  return ctx
}

export { applyDerivedFieldsFromUniversalSegments, getMessageRefFromCtx, getReplyRefFromSegments }
