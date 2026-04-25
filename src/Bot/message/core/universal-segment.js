import {
  UNIVERSAL_TYPE_ALIASES,
  UniversalSegmentType,
  isUniversalSegmentType,
  normalizeUniversalSegmentType,
} from "./segment-types.js"
import { pickPrimaryMediaReference, resolveMediaReferenceFields } from "./media-reference.js"

function toOptionalString(value, { trim = true } = {}) {
  if (value === undefined || value === null) return undefined
  const text = trim ? String(value).trim() : String(value)
  return text || undefined
}

function toOptionalNumber(value) {
  if (value === undefined || value === null || value === "") return undefined
  const num = Number(value)
  return Number.isFinite(num) ? num : undefined
}

function pickFirstValue(values, mapper = value => value) {
  for (const value of values) {
    const mapped = mapper(value)
    if (mapped !== undefined) return mapped
  }
  return undefined
}

function clonePreview(preview) {
  if (Array.isArray(preview)) {
    return preview
      .map(item => toOptionalString(item, { trim: false }))
      .filter(item => item !== undefined)
  }
  const single = toOptionalString(preview, { trim: false })
  return single ? [single] : undefined
}

function applyCompatAliases(type, data, raw = {}) {
  switch (type) {
    case UniversalSegmentType.TEXT:
      data.content = data.text
      break
    case UniversalSegmentType.MENTION:
      data.target = data.qq
      if (raw.user_id !== undefined || raw.target !== undefined) {
        const userId = pickFirstValue(
          [raw.user_id, raw.target, data.qq],
          value => toOptionalString(value, { trim: true }),
        )
        if (userId !== undefined) data.user_id = userId
      }
      break
    case UniversalSegmentType.REPLY:
      if (data.id !== undefined) {
        data.msgId = data.id
        data.message_id = data.id
      }
      if (data.seq !== undefined) {
        data.message_seq = data.seq
      }
      break
    case UniversalSegmentType.IMAGE:
    case UniversalSegmentType.VOICE:
    case UniversalSegmentType.VIDEO:
    case UniversalSegmentType.FILE:
      if (data.id !== undefined) data.fileId = data.id
      if (data.url === undefined || data.path === undefined || data.fileId === undefined) {
        const refs = resolveMediaReferenceFields([
          { value: data.file, preferred: "auto" },
          { value: data.id, preferred: "fileId" },
        ])
        if (data.url === undefined && refs.url) data.url = refs.url
        if (data.path === undefined && refs.path) data.path = refs.path
        if (data.fileId === undefined && refs.fileId) data.fileId = refs.fileId
      }
      if (data.uri === undefined && data.file !== undefined) data.uri = data.file
      if (data.temp_url === undefined && data.url !== undefined) data.temp_url = data.url
      break
    case UniversalSegmentType.FORWARD:
      if (data.id !== undefined) data.forward_id = data.id
      if (data.resid === undefined) {
        const resid = toOptionalString(raw.resid, { trim: true })
        if (resid !== undefined) data.resid = resid
      }
      break
    default:
      break
  }
  return data
}

function normalizeTextData(raw = {}) {
  return applyCompatAliases(UniversalSegmentType.TEXT, {
    text: String(raw.text ?? raw.content ?? raw.value ?? ""),
  })
}

function normalizeMentionData(raw = {}) {
  const qq = pickFirstValue(
    [raw.qq, raw.target, raw.user_id, raw.uid, raw.id],
    value => toOptionalString(value, { trim: true }),
  )
  if (!qq) throw new Error("mention segment requires qq/target/user_id")

  const data = { qq }
  const name = pickFirstValue(
    [raw.name, raw.display, raw.nickname, raw.card],
    value => toOptionalString(value, { trim: false }),
  )
  if (name !== undefined) data.name = name
  return applyCompatAliases(UniversalSegmentType.MENTION, data, raw)
}

function normalizeReplyData(raw = {}) {
  const id = pickFirstValue(
    [raw.id, raw.msgId, raw.message_id, raw.messageId],
    value => toOptionalString(value, { trim: true }),
  )
  const seq = pickFirstValue([raw.seq, raw.message_seq, raw.messageSeq], value =>
    toOptionalNumber(value),
  )
  if (id === undefined && seq === undefined) {
    throw new Error("reply segment requires id/msgId/message_id or seq/message_seq")
  }

  const data = {}
  if (id !== undefined) data.id = id
  if (seq !== undefined) data.seq = seq

  const text = pickFirstValue([raw.text, raw.content], value =>
    toOptionalString(value, { trim: false }),
  )
  if (text !== undefined) data.text = text

  return applyCompatAliases(UniversalSegmentType.REPLY, data, raw)
}

function normalizeFaceData(raw = {}) {
  const id = pickFirstValue([raw.id, raw.face_id], value => toOptionalNumber(value))
  if (id === undefined) throw new Error("face segment requires id")
  return { id }
}

function normalizeMediaData(type, raw = {}) {
  const refs = resolveMediaReferenceFields([
    { value: raw.file, preferred: "auto" },
    { value: raw.url, preferred: "url" },
    { value: raw.uri, preferred: "url" },
    { value: raw.temp_url, preferred: "url" },
    { value: raw.path, preferred: "path" },
    { value: raw.fileId, preferred: "fileId" },
    { value: raw.resource_id, preferred: "fileId" },
    { value: raw.file_id, preferred: "fileId" },
    { value: raw.fid, preferred: "fileId" },
    { value: raw.id, preferred: "fileId" },
  ])

  const id = pickFirstValue(
    [raw.id, raw.fileId, raw.resource_id, raw.file_id, raw.fid, refs.fileId],
    value => toOptionalString(value, { trim: true }),
  )

  const file =
    pickPrimaryMediaReference(
      raw.file,
      raw.url,
      raw.uri,
      raw.temp_url,
      raw.path,
      raw.fileId,
      raw.resource_id,
      raw.file_id,
      raw.fid,
      raw.id,
      refs.url,
      refs.path,
      refs.fileId,
    ) || id

  if (!file) {
    throw new Error(`${type} segment requires file/url/path/fileId/resource_id`)
  }

  const data = { file }
  if (id !== undefined) data.id = id
  if (refs.url !== undefined) data.url = refs.url
  if (refs.path !== undefined) data.path = refs.path
  if (refs.fileId !== undefined) data.fileId = refs.fileId

  const name = pickFirstValue([raw.name, raw.file_name], value =>
    toOptionalString(value, { trim: false }),
  )
  if (name !== undefined) data.name = name

  const size = pickFirstValue([raw.size, raw.file_size], value => toOptionalNumber(value))
  if (size !== undefined) data.size = size

  const summary = pickFirstValue([raw.summary], value => toOptionalString(value, { trim: false }))
  if (summary !== undefined) data.summary = summary

  const duration = pickFirstValue([raw.duration, raw.seconds], value => toOptionalNumber(value))
  if (duration !== undefined) data.duration = duration

  const width = pickFirstValue([raw.width], value => toOptionalNumber(value))
  if (width !== undefined) data.width = width

  const height = pickFirstValue([raw.height], value => toOptionalNumber(value))
  if (height !== undefined) data.height = height

  return applyCompatAliases(type, data, raw)
}

function normalizeForwardData(raw = {}) {
  const data = {}

  const id = pickFirstValue(
    [raw.id, raw.forward_id, raw.resid],
    value => toOptionalString(value, { trim: true }),
  )
  if (id !== undefined) {
    data.id = id
    data.forward_id = id
  }

  const resid = pickFirstValue([raw.resid], value => toOptionalString(value, { trim: true }))
  if (resid !== undefined) data.resid = resid

  const title = pickFirstValue([raw.title], value => toOptionalString(value, { trim: false }))
  if (title !== undefined) data.title = title

  const summary = pickFirstValue([raw.summary], value => toOptionalString(value, { trim: false }))
  if (summary !== undefined) data.summary = summary

  const prompt = pickFirstValue([raw.prompt], value => toOptionalString(value, { trim: false }))
  if (prompt !== undefined) data.prompt = prompt

  const preview = clonePreview(raw.preview)
  if (preview !== undefined) data.preview = preview

  if (Array.isArray(raw.messages)) data.messages = raw.messages

  return data
}

function normalizeSegmentData(type, raw = {}) {
  switch (type) {
    case UniversalSegmentType.TEXT:
      return normalizeTextData(raw)
    case UniversalSegmentType.MENTION:
      return normalizeMentionData(raw)
    case UniversalSegmentType.MENTION_ALL:
      return {}
    case UniversalSegmentType.EMOJI:
      return normalizeFaceData(raw)
    case UniversalSegmentType.REPLY:
      return normalizeReplyData(raw)
    case UniversalSegmentType.IMAGE:
    case UniversalSegmentType.VOICE:
    case UniversalSegmentType.VIDEO:
    case UniversalSegmentType.FILE:
      return normalizeMediaData(type, raw)
    case UniversalSegmentType.FORWARD:
      return normalizeForwardData(raw)
    default:
      throw new Error(`unsupported universal segment type: ${type}`)
  }
}

class UniversalMessageSegment {
  constructor(type, data = {}) {
    const normalizedType = normalizeUniversalSegmentType(type)
    this.type = normalizedType
    this.data = normalizeSegmentData(normalizedType, data)
  }

  static text(text) {
    return new UniversalMessageSegment(UniversalSegmentType.TEXT, { text })
  }

  static mention(target, name) {
    return new UniversalMessageSegment(UniversalSegmentType.MENTION, { qq: target, name })
  }

  static mentionAll() {
    return new UniversalMessageSegment(UniversalSegmentType.MENTION_ALL, {})
  }

  static face(id) {
    return new UniversalMessageSegment(UniversalSegmentType.EMOJI, { id })
  }

  static reply(options) {
    if (options && typeof options !== "object") {
      return new UniversalMessageSegment(UniversalSegmentType.REPLY, { id: options })
    }
    return new UniversalMessageSegment(UniversalSegmentType.REPLY, options || {})
  }

  static image(options) {
    return new UniversalMessageSegment(UniversalSegmentType.IMAGE, options || {})
  }

  static record(options) {
    return new UniversalMessageSegment(UniversalSegmentType.VOICE, options || {})
  }

  static video(options) {
    return new UniversalMessageSegment(UniversalSegmentType.VIDEO, options || {})
  }

  static file(options) {
    return new UniversalMessageSegment(UniversalSegmentType.FILE, options || {})
  }

  static forward(options) {
    return new UniversalMessageSegment(UniversalSegmentType.FORWARD, options || {})
  }
}

function getSegmentText(segment) {
  if (!segment || segment.type !== UniversalSegmentType.TEXT) return ""
  return String(segment?.data?.text ?? segment?.data?.content ?? "")
}

function getSegmentMentionTarget(segment) {
  if (!segment) return ""

  const rawType = String(segment?.type || "").trim()
  const normalizedType = UNIVERSAL_TYPE_ALIASES[rawType] || rawType
  if (normalizedType !== UniversalSegmentType.MENTION) return ""

  return String(
    pickFirstValue(
      [
        segment?.data?.qq,
        segment?.data?.target,
        segment?.data?.user_id,
        segment?.data?.uid,
        segment?.data?.id,
        segment?.qq,
        segment?.target,
        segment?.user_id,
        segment?.uid,
        segment?.id,
      ],
      value => toOptionalString(value, { trim: true }),
    ) || "",
  )
}

function getSegmentReplyRef(segment) {
  if (!segment || segment.type !== UniversalSegmentType.REPLY) return null
  const id = pickFirstValue(
    [segment?.data?.id, segment?.data?.msgId, segment?.data?.message_id],
    value => toOptionalString(value, { trim: true }),
  )
  const seq = pickFirstValue(
    [segment?.data?.seq, segment?.data?.message_seq],
    value => toOptionalNumber(value),
  )
  if (id === undefined && seq === undefined) return null
  return { id, seq }
}

function getSegmentMediaFile(segment) {
  const data = segment?.data
  if (!data || typeof data !== "object") return ""
  return (
    pickPrimaryMediaReference(
      data.file,
      data.url,
      data.uri,
      data.temp_url,
      data.path,
      data.id,
      data.fileId,
    ) || ""
  )
}

function getSegmentMediaId(segment) {
  const data = segment?.data
  if (!data || typeof data !== "object") return undefined
  return pickFirstValue(
    [data.id, data.fileId, data.resource_id, data.file_id, data.fid],
    value => toOptionalString(value, { trim: true }),
  )
}

function isUniversalSegment(segment) {
  return Boolean(
    segment &&
      typeof segment === "object" &&
      isUniversalSegmentType(segment.type) &&
      segment.data &&
      typeof segment.data === "object",
  )
}

function isUniversalSegmentArray(segments) {
  return Array.isArray(segments) && segments.every(segment => isUniversalSegment(segment))
}

class UniversalMessage {
  constructor(segments = []) {
    this.segments = []
    this.addSegments(segments)
  }

  addSegment(segment) {
    if (segment instanceof UniversalMessageSegment) {
      this.segments.push(segment)
      return
    }

    if (isUniversalSegment(segment)) {
      this.segments.push(new UniversalMessageSegment(segment.type, segment.data))
      return
    }

    throw new Error("segment must be a UniversalMessageSegment or a universal segment object")
  }

  addSegments(segments) {
    for (const segment of Array.isArray(segments) ? segments : []) {
      this.addSegment(segment)
    }
  }

  addText(text) {
    this.addSegment(UniversalMessageSegment.text(text))
  }

  addFile(options) {
    this.addSegment(UniversalMessageSegment.file(options))
  }

  addMention(target, name) {
    this.addSegment(UniversalMessageSegment.mention(target, name))
  }

  addMentionAll() {
    this.addSegment(UniversalMessageSegment.mentionAll())
  }
}

export {
  UniversalMessage,
  UniversalMessageSegment,
  UniversalSegmentType,
  getSegmentMediaFile,
  getSegmentMediaId,
  getSegmentMentionTarget,
  getSegmentReplyRef,
  getSegmentText,
  isUniversalSegment,
  isUniversalSegmentArray,
  isUniversalSegmentType,
  normalizeUniversalSegmentType,
}
