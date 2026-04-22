import { UniversalMessageSegment } from "../core/universal-segment.js"

function fromOnebotV11Segment(segment) {
  if (segment === undefined || segment === null) return UniversalMessageSegment.text("")
  if (typeof segment === "string" || typeof segment === "number") {
    return UniversalMessageSegment.text(String(segment))
  }

  const type = String(segment?.type || "").trim()
  const data = segment?.data && typeof segment.data === "object" ? segment.data : {}

  switch (type) {
    case "text":
      return UniversalMessageSegment.text(data.text ?? segment.text ?? "")
    case "at":
      return data.qq === "all"
        ? UniversalMessageSegment.mentionAll()
        : UniversalMessageSegment.mention(data.qq ?? segment.qq)
    case "face":
    case "mface":
      return UniversalMessageSegment.face(data.id ?? data.face_id ?? segment.id)
    case "reply":
      return UniversalMessageSegment.reply({
        id: data.id ?? segment.id,
        seq: data.message_seq ?? segment.message_seq ?? segment.seq,
      })
    case "image":
      return UniversalMessageSegment.image({
        file: data.file ?? data.url ?? segment.file ?? segment.url,
        id: data.file ?? data.file_id,
        width: data.width,
        height: data.height,
        summary: data.summary,
      })
    case "record":
      return UniversalMessageSegment.record({
        file: data.file ?? data.url ?? segment.file ?? segment.url,
        id: data.file ?? data.file_id,
        duration: data.duration,
      })
    case "video":
      return UniversalMessageSegment.video({
        file: data.file ?? data.url ?? segment.file ?? segment.url,
        id: data.file ?? data.file_id,
        duration: data.duration,
        width: data.width,
        height: data.height,
      })
    case "file":
      return UniversalMessageSegment.file({
        file: data.file ?? data.url ?? segment.file ?? segment.url,
        id: data.file ?? data.file_id,
        name: data.name,
        size: data.size,
      })
    case "forward":
      return UniversalMessageSegment.forward({
        id: data.id ?? data.forward_id ?? segment.id ?? segment.forward_id,
        title: data.title,
        preview: data.preview,
        summary: data.summary ?? "forward",
        messages: data.messages ?? segment.messages,
      })
    default:
      return UniversalMessageSegment.text(JSON.stringify(segment))
  }
}

function fromMilkySegment(segment) {
  if (segment === undefined || segment === null) return UniversalMessageSegment.text("")
  if (typeof segment === "string" || typeof segment === "number") {
    return UniversalMessageSegment.text(String(segment))
  }

  const type = String(segment?.type || "").trim()
  const data = segment?.data && typeof segment.data === "object" ? segment.data : {}

  switch (type) {
    case "text":
      return UniversalMessageSegment.text(data.text ?? segment.text ?? "")
    case "mention":
      return UniversalMessageSegment.mention(data.user_id ?? segment.user_id)
    case "mention_all":
    case "mentionAll":
      return UniversalMessageSegment.mentionAll()
    case "face":
      return UniversalMessageSegment.face(data.face_id ?? data.id)
    case "reply":
      return UniversalMessageSegment.reply({
        seq: data.message_seq ?? segment.message_seq,
        id: data.message_id ?? segment.message_id,
      })
    case "image":
      return UniversalMessageSegment.image({
        file: data.uri ?? data.temp_url ?? data.resource_url ?? data.resource_id,
        id: data.resource_id,
        width: data.width,
        height: data.height,
        summary: data.summary,
      })
    case "record":
      return UniversalMessageSegment.record({
        file: data.uri ?? data.temp_url ?? data.resource_id,
        id: data.resource_id,
        duration: data.duration,
      })
    case "video":
      return UniversalMessageSegment.video({
        file: data.uri ?? data.temp_url ?? data.resource_id,
        id: data.resource_id,
        duration: data.duration,
        width: data.width,
        height: data.height,
      })
    case "file":
      return UniversalMessageSegment.file({
        file: data.uri ?? data.file_hash ?? data.file_id,
        id: data.file_id,
        name: data.file_name ?? data.name,
        size: data.file_size ?? data.size,
      })
    case "forward":
      return UniversalMessageSegment.forward({
        id: data.forward_id ?? data.id ?? segment.forward_id ?? segment.id,
        title: data.title,
        preview: data.preview,
        summary: data.summary,
        messages: data.messages ?? segment.messages,
      })
    default:
      return UniversalMessageSegment.text(JSON.stringify(segment))
  }
}

function fromICQQSegment(segment) {
  if (segment === undefined || segment === null) return UniversalMessageSegment.text("")
  if (typeof segment === "string" || typeof segment === "number") {
    return UniversalMessageSegment.text(String(segment))
  }

  const type = String(segment?.type || "").trim()
  const data = segment?.data && typeof segment.data === "object" ? segment.data : {}

  switch (type) {
    case "text":
      return UniversalMessageSegment.text(segment.text ?? data.text ?? data.content ?? "")
    case "at": {
      const qq = segment.qq ?? data.qq
      return qq === "all" || qq === 0 || String(qq) === "0"
        ? UniversalMessageSegment.mentionAll()
        : UniversalMessageSegment.mention(qq)
    }
    case "face":
    case "sface":
    case "bface":
      return UniversalMessageSegment.face(segment.id ?? data.id)
    case "reply":
    case "quote":
    case "source":
      return UniversalMessageSegment.reply({
        id: segment.id ?? data.id ?? segment.message_id ?? data.message_id,
        seq:
          segment.seq ??
          segment.message_seq ??
          data.seq ??
          data.message_seq ??
          data.messageSeq,
      })
    case "image":
    case "flash":
      return UniversalMessageSegment.image({
        file: segment.file ?? segment.url ?? data.file ?? data.url,
        id: segment.fid ?? data.fid ?? segment.file_id ?? data.file_id,
        width: segment.width ?? data.width,
        height: segment.height ?? data.height,
        summary: segment.summary ?? data.summary,
      })
    case "record":
      return UniversalMessageSegment.record({
        file: segment.file ?? segment.url ?? data.file ?? data.url,
        id: segment.fid ?? data.fid,
        duration: segment.seconds ?? data.seconds ?? data.duration,
      })
    case "video":
    case "bubble":
      return UniversalMessageSegment.video({
        file: segment.file ?? segment.url ?? data.file ?? data.url,
        id: segment.fid ?? data.fid,
        duration: segment.seconds ?? data.seconds ?? data.duration,
        width: segment.width ?? data.width,
        height: segment.height ?? data.height,
      })
    case "file":
      return UniversalMessageSegment.file({
        file: segment.file ?? segment.url ?? data.file ?? data.url,
        id: segment.fid ?? data.fid ?? segment.file_id ?? data.file_id,
        name: segment.name ?? data.name,
        size: segment.size ?? data.size,
      })
    case "multimsg":
    case "node":
    case "long_msg":
      return UniversalMessageSegment.forward({
        id: segment.resid ?? data.resid ?? segment.id ?? data.id,
        title: segment.title ?? data.title,
        preview: segment.preview ?? data.preview,
        summary: segment.summary ?? data.summary ?? "[chat history]",
        messages: segment.messages ?? data.messages,
      })
    default:
      return UniversalMessageSegment.text(JSON.stringify(segment))
  }
}

function normalizeProtocol(protocol) {
  const value = String(protocol || "").trim().toLowerCase()
  if (value === "onebot" || value === "onebot11") return "onebotv11"
  return value
}

function getProtocolParser(protocol) {
  switch (normalizeProtocol(protocol)) {
    case "onebotv11":
      return fromOnebotV11Segment
    case "milky":
      return fromMilkySegment
    case "icqq":
      return fromICQQSegment
    default:
      throw new Error(`unsupported protocol: ${protocol}`)
  }
}

export {
  fromICQQSegment,
  fromMilkySegment,
  fromOnebotV11Segment,
  getProtocolParser,
  normalizeProtocol,
}
