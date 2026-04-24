import { UniversalMessage, UniversalMessageSegment, UniversalSegmentType } from "../universal-message.js"
import { resolveMediaReferenceFields } from "../core/media-reference.js"

function isUniversalType(type) {
  return Object.values(UniversalSegmentType).includes(type)
}

function looksLikeUniversalSegment(type, data = {}) {
  if (!data || typeof data !== "object") return false

  switch (type) {
    case UniversalSegmentType.TEXT:
      return data.text !== undefined || data.content !== undefined
    case UniversalSegmentType.MENTION:
      return (
        (data.qq !== undefined && data.qq !== null && String(data.qq) !== "") ||
        (data.target !== undefined && data.target !== null && String(data.target) !== "")
      )
    case UniversalSegmentType.MENTION_ALL:
      return true
    case UniversalSegmentType.REPLY:
      return data.id !== undefined || data.msgId !== undefined || data.seq !== undefined
    case UniversalSegmentType.IMAGE:
    case UniversalSegmentType.VOICE:
    case UniversalSegmentType.VIDEO:
    case UniversalSegmentType.FILE:
      return Boolean(data.file || data.url || data.fileId || data.path)
    case UniversalSegmentType.EMOJI:
      return data.id !== undefined && data.id !== null
    case UniversalSegmentType.FORWARD:
      return true
    default:
      return false
  }
}

function parseTextWithFaces(text) {
  if (text === undefined || text === null) return []
  const str = String(text)
  const facePattern = /\[face:(\d+)\]/g

  const segments = []
  let lastIndex = 0
  let match

  while ((match = facePattern.exec(str)) !== null) {
    const [fullMatch, faceId] = match
    const matchStart = match.index

    if (matchStart > lastIndex) {
      segments.push(UniversalMessageSegment.text(str.slice(lastIndex, matchStart)))
    }

    segments.push(UniversalMessageSegment.face(Number(faceId)))
    lastIndex = matchStart + fullMatch.length
  }

  if (lastIndex < str.length) {
    segments.push(UniversalMessageSegment.text(str.slice(lastIndex)))
  }

  return segments
}

function toUniversalMessage(protocol, rawSegments) {
  return UniversalMessage.from(protocol, rawSegments)
}

function coerceOneInputToUniversalSegments(input) {
  if (input === undefined || input === null) return []
  if (input instanceof UniversalMessage) return input.segments || []
  if (input instanceof UniversalMessageSegment) return [input]

  if (typeof input === "string" || typeof input === "number") {
    return parseTextWithFaces(String(input))
  }

  if (typeof input === "object" && typeof input.type === "string") {
    const { type, data = {} } = input

    if (isUniversalType(type) && looksLikeUniversalSegment(type, data)) {
      return [new UniversalMessageSegment(type, data)]
    }

    switch (type) {
      case "text":
        return [
          UniversalMessageSegment.text(data.content ?? data.text ?? input.text ?? input.content ?? ""),
        ]
      case "face":
        return [UniversalMessageSegment.face(data.id ?? data.face_id ?? input.id)]
      case "at":
        return [
          data.qq === "all"
            ? UniversalMessageSegment.mentionAll()
            : UniversalMessageSegment.mention(
                data.target ?? data.qq ?? data.user_id ?? input.qq ?? input.user_id,
              ),
        ]
      case "atAll":
        return [UniversalMessageSegment.mentionAll()]
      case "mention":
        return [UniversalMessageSegment.mention(data.user_id)]
      case "mentionAll":
        return [UniversalMessageSegment.mentionAll()]
      case "reply": {
        const msgId = data.msgId ?? data.id ?? input.id
        const seq = data.seq ?? data.message_seq ?? input.message_seq ?? input.seq
        if (msgId === undefined && seq === undefined) return []
        return [UniversalMessageSegment.reply({ msgId, seq })]
      }
      case "image": {
        const refs = resolveMediaReferenceFields([
          { value: data.url, preferred: "url" },
          { value: input.url, preferred: "url" },
          { value: data.uri, preferred: "url" },
          { value: input.uri, preferred: "url" },
          { value: data.temp_url, preferred: "url" },
          { value: input.temp_url, preferred: "url" },
          { value: data.path, preferred: "path" },
          { value: input.path, preferred: "path" },
          { value: data.file, preferred: "auto" },
          { value: input.file, preferred: "auto" },
          { value: data.fileId, preferred: "fileId" },
          { value: input.fileId, preferred: "fileId" },
          { value: data.resource_id, preferred: "fileId" },
          { value: input.fid, preferred: "fileId" },
        ])
        const segData = {
          url: refs.url,
          fileId: refs.fileId,
          path: refs.path,
          name: data.name ?? input.name,
          width: data.width,
          height: data.height,
          summary: data.summary ?? input.summary,
        }
        if (!segData.url && !segData.fileId && !segData.path) return []
        return [UniversalMessageSegment.image(segData)]
      }
      case "record": {
        const refs = resolveMediaReferenceFields([
          { value: data.url, preferred: "url" },
          { value: data.uri, preferred: "url" },
          { value: input.uri, preferred: "url" },
          { value: data.path, preferred: "path" },
          { value: input.path, preferred: "path" },
          { value: data.file, preferred: "auto" },
          { value: input.file, preferred: "auto" },
          { value: data.fileId, preferred: "fileId" },
          { value: input.fileId, preferred: "fileId" },
          { value: data.resource_id, preferred: "fileId" },
        ])
        const segData = {
          url: refs.url,
          fileId: refs.fileId,
          path: refs.path,
          duration: data.duration ?? input.seconds ?? 0,
        }
        if (!segData.url && !segData.fileId && !segData.path) return []
        return [UniversalMessageSegment.record(segData)]
      }
      case "video": {
        const refs = resolveMediaReferenceFields([
          { value: data.url, preferred: "url" },
          { value: data.uri, preferred: "url" },
          { value: input.uri, preferred: "url" },
          { value: data.path, preferred: "path" },
          { value: input.path, preferred: "path" },
          { value: data.file, preferred: "auto" },
          { value: input.file, preferred: "auto" },
          { value: data.fileId, preferred: "fileId" },
          { value: input.fileId, preferred: "fileId" },
          { value: data.resource_id, preferred: "fileId" },
          { value: input.fid, preferred: "fileId" },
        ])
        const segData = {
          url: refs.url,
          fileId: refs.fileId,
          path: refs.path,
          duration: data.duration ?? input.seconds ?? 0,
          width: data.width ?? input.width ?? 0,
          height: data.height ?? input.height ?? 0,
        }
        if (!segData.url && !segData.fileId && !segData.path) return []
        return [UniversalMessageSegment.video(segData)]
      }
      case "file": {
        const refs = resolveMediaReferenceFields([
          { value: data.url, preferred: "url" },
          { value: data.uri, preferred: "url" },
          { value: input.uri, preferred: "url" },
          { value: data.path ?? data.file_hash, preferred: "path" },
          { value: input.path, preferred: "path" },
          { value: data.file, preferred: "auto" },
          { value: input.file, preferred: "auto" },
          { value: data.fileId, preferred: "fileId" },
          { value: input.fileId, preferred: "fileId" },
          { value: data.file_id, preferred: "fileId" },
          { value: input.fid, preferred: "fileId" },
        ])
        const segData = {
          url: refs.url,
          fileId: refs.fileId,
          path: refs.path,
          name: data.name ?? data.file_name ?? input.name,
          size: data.size ?? data.file_size ?? input.size,
        }
        if (!segData.url && !segData.fileId && !segData.path) return []
        return [UniversalMessageSegment.file(segData)]
      }
      case "forward":
        return [UniversalMessageSegment.forward(data)]
      case "button":
        return []
      default:
        return [UniversalMessageSegment.text(JSON.stringify(input))]
    }
  }

  return [UniversalMessageSegment.text(JSON.stringify(input))]
}

function coerceToUniversalMessage(input, { suffixText = "" } = {}) {
  const msg = new UniversalMessage()

  const segments = []
  if (Array.isArray(input)) {
    for (const item of input) segments.push(...coerceOneInputToUniversalSegments(item))
  } else {
    segments.push(...coerceOneInputToUniversalSegments(input))
  }

  if (suffixText) {
    segments.push(...parseTextWithFaces(suffixText))
  }

  msg.addSegments(segments)
  return msg
}

export { coerceToUniversalMessage, parseTextWithFaces, toUniversalMessage }
