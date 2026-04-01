import { UniversalSegmentType } from "./universal-message.js"
import { pickPrimaryMediaReference, resolveMediaReferenceFields } from "./media-reference.js"

function pickText(data = {}) {
  return String(data.text ?? data.content ?? "")
}

function pickMentionTarget(data = {}) {
  const value = data.qq ?? data.target ?? data.user_id
  return value === undefined || value === null ? "" : String(value)
}

function pickReplyId(data = {}) {
  const value = data.id ?? data.msgId ?? data.message_id
  return value === undefined || value === null ? undefined : String(value)
}

function pickReplySeq(data = {}) {
  const value = data.seq ?? data.message_seq
  const num = Number(value)
  return Number.isFinite(num) ? num : undefined
}

function pickMediaPayload(data = {}) {
  const refs = resolveMediaReferenceFields([
    { value: data.url, preferred: "url" },
    { value: data.temp_url, preferred: "url" },
    { value: data.uri, preferred: "url" },
    { value: data.path, preferred: "path" },
    { value: data.file, preferred: "auto" },
    { value: data.fileId, preferred: "fileId" },
    { value: data.id, preferred: "fileId" },
  ])

  const id =
    (data.id !== undefined && data.id !== null ? String(data.id).trim() : "") ||
    (data.fileId !== undefined && data.fileId !== null ? String(data.fileId).trim() : "") ||
    refs.fileId ||
    ""

  const file =
    pickPrimaryMediaReference(
      data.url,
      data.temp_url,
      data.uri,
      data.path,
      data.file,
      data.fileId,
      data.id,
      refs.url,
      refs.path,
      refs.fileId,
    ) || id

  return { file, id, refs }
}

class BaseConverter {
  convert(_segments) {
    throw new Error("Subclass must implement convert(segments)")
  }

  convertSegment(_segment) {
    throw new Error("Subclass must implement convertSegment(segment)")
  }
}

class OnebotV11Converter extends BaseConverter {
  convert(segments) {
    return (segments || []).map(segment => this.convertSegment(segment))
  }

  convertSegment(segment) {
    const { type, data = {} } = segment || {}
    const replyId = pickReplyId(data)
    const replySeq = pickReplySeq(data)
    const media = pickMediaPayload(data)

    switch (type) {
      case UniversalSegmentType.TEXT:
        return { type: "text", data: { text: pickText(data) } }
      case UniversalSegmentType.MENTION:
        return { type: "at", data: { qq: pickMentionTarget(data) } }
      case UniversalSegmentType.MENTION_ALL:
        return { type: "at", data: { qq: "all" } }
      case UniversalSegmentType.EMOJI:
        return { type: "face", data: { id: data.id } }
      case UniversalSegmentType.REPLY:
        return { type: "reply", data: { id: replyId ?? replySeq } }
      case UniversalSegmentType.IMAGE:
        return { type: "image", data: { file: media.file } }
      case UniversalSegmentType.VOICE:
        return { type: "record", data: { file: media.file } }
      case UniversalSegmentType.VIDEO:
        return { type: "video", data: { file: media.file } }
      case UniversalSegmentType.FILE:
        return {
          type: "file",
          data: {
            file: media.file,
            name: data.name,
            size: data.size,
          },
        }
      case UniversalSegmentType.FORWARD:
        return {
          type: "text",
          data: { text: `[forward:${data.id || ""}]` },
        }
      default:
        return { type: "text", data: { text: JSON.stringify(segment) } }
    }
  }
}

class MilkyConverter extends BaseConverter {
  convert(segments) {
    return (segments || []).map(segment => this.convertSegment(segment))
  }

  convertSegment(segment) {
    const { type, data = {} } = segment || {}
    const target = pickMentionTarget(data)
    const replySeq = pickReplySeq(data)
    const fallbackReplySeq = Number(pickReplyId(data))
    const seq =
      replySeq !== undefined
        ? replySeq
        : Number.isFinite(fallbackReplySeq)
          ? fallbackReplySeq
          : undefined
    const media = pickMediaPayload(data)

    switch (type) {
      case UniversalSegmentType.TEXT:
        return { type: "text", data: { text: pickText(data) } }
      case UniversalSegmentType.MENTION: {
        const uid = Number(target)
        if (!Number.isFinite(uid) || uid <= 0) {
          return { type: "text", data: { text: target ? `@${target}` : "" } }
        }
        return { type: "mention", data: { user_id: uid } }
      }
      case UniversalSegmentType.MENTION_ALL:
        return { type: "mention_all", data: {} }
      case UniversalSegmentType.EMOJI:
        return { type: "face", data: { face_id: String(data.id), is_large: false } }
      case UniversalSegmentType.REPLY:
        return seq !== undefined
          ? { type: "reply", data: { message_seq: seq } }
          : { type: "text", data: { text: "" } }
      case UniversalSegmentType.IMAGE:
        return {
          type: "image",
          data: {
            uri: media.file,
            sub_type: "normal",
            summary: data.summary,
            width: data.width || 0,
            height: data.height || 0,
          },
        }
      case UniversalSegmentType.VOICE:
        return { type: "record", data: { uri: media.file } }
      case UniversalSegmentType.VIDEO:
        return { type: "video", data: { uri: media.file } }
      case UniversalSegmentType.FILE:
        return {
          type: "file",
          data: {
            uri: media.file,
            name: data.name,
            size: data.size,
          },
        }
      case UniversalSegmentType.FORWARD:
        return {
          type: "text",
          data: { text: `[forward:${data.id || ""}]` },
        }
      default:
        return { type: "text", data: { text: JSON.stringify(segment) } }
    }
  }
}

class ICQQConverter extends BaseConverter {
  convert(segments) {
    return (segments || []).map(segment => this.convertSegment(segment))
  }

  convertSegment(segment) {
    const { type, data = {} } = segment || {}
    const replyId = pickReplyId(data)
    const replySeq = pickReplySeq(data)
    const media = pickMediaPayload(data)

    switch (type) {
      case UniversalSegmentType.TEXT:
        return { type: "text", text: pickText(data) }
      case UniversalSegmentType.MENTION:
        return { type: "at", qq: pickMentionTarget(data) }
      case UniversalSegmentType.MENTION_ALL:
        return { type: "at", qq: "all" }
      case UniversalSegmentType.EMOJI:
        return { type: "face", id: data.id }
      case UniversalSegmentType.REPLY:
        return { type: "reply", id: replyId ?? replySeq }
      case UniversalSegmentType.IMAGE:
        return {
          type: "image",
          file: media.file,
          summary: data.summary,
        }
      case UniversalSegmentType.VOICE:
        return { type: "record", file: media.file }
      case UniversalSegmentType.VIDEO:
        return { type: "video", file: media.file }
      case UniversalSegmentType.FILE:
        return { type: "file", file: media.file, name: data.name }
      case UniversalSegmentType.FORWARD:
        return { type: "text", text: `[forward:${data.id || ""}]` }
      default:
        return { type: "text", text: JSON.stringify(segment) }
    }
  }
}

export { BaseConverter, OnebotV11Converter, MilkyConverter, ICQQConverter }
