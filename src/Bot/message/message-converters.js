import { UniversalSegmentType } from "./universal-message.js"

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
    return (segments || []).map(seg => this.convertSegment(seg))
  }

  convertSegment(segment) {
    const { type, data = {} } = segment || {}
    switch (type) {
      case UniversalSegmentType.TEXT:
        return { type: "text", data: { text: data.content } }
      case UniversalSegmentType.MENTION:
        return { type: "at", data: { qq: data.target } }
      case UniversalSegmentType.MENTION_ALL:
        return { type: "at", data: { qq: "all" } }
      case UniversalSegmentType.EMOJI:
        return { type: "face", data: { id: data.id } }
      case UniversalSegmentType.REPLY:
        return { type: "reply", data: { id: data.msgId ?? data.seq } }
      case UniversalSegmentType.IMAGE:
        return {
          type: "image",
          data: {
            file: data.url || data.fileId || data.path,
          },
        }
      case UniversalSegmentType.VOICE:
        return { type: "record", data: { file: data.url || data.fileId || data.path } }
      case UniversalSegmentType.VIDEO:
        return { type: "video", data: { file: data.url || data.fileId || data.path } }
      case UniversalSegmentType.FILE:
        return {
          type: "file",
          data: {
            file: data.url || data.fileId || data.path,
            name: data.name,
            size: data.size,
          },
        }
      case UniversalSegmentType.FORWARD:
        return {
          type: "text",
          data: { text: `[forward:${data.id || data.forward_id || ""}]` },
        }
      default:
        return { type: "text", data: { text: JSON.stringify(segment) } }
    }
  }
}

class MilkyConverter extends BaseConverter {
  convert(segments) {
    return (segments || []).map(seg => this.convertSegment(seg))
  }

  convertSegment(segment) {
    const { type, data = {} } = segment || {}
    switch (type) {
      case UniversalSegmentType.TEXT:
        return { type: "text", data: { text: data.content } }
      case UniversalSegmentType.MENTION:
        {
          const uid = Number(data.target)
          if (!Number.isFinite(uid) || uid <= 0) {
            return { type: "text", data: { text: data.target ? `@${data.target}` : "" } }
          }
          return { type: "mention", data: { user_id: uid } }
        }
      case UniversalSegmentType.MENTION_ALL:
        return { type: "mention_all", data: {} }
      case UniversalSegmentType.EMOJI:
        return { type: "face", data: { face_id: `${data.id}`, is_large: false } }
      case UniversalSegmentType.REPLY:
        {
          const seq = Number(data.seq ?? data.msgId)
          return Number.isFinite(seq) && seq > 0
            ? { type: "reply", data: { message_seq: seq } }
            : { type: "text", data: { text: "" } }
        }
      case UniversalSegmentType.IMAGE:
        return {
          type: "image",
          data: {
            uri: data.url || data.fileId || data.path,
            sub_type: "normal",
            summary: data.summary,
            width: data.width || 0,
            height: data.height || 0,
          },
        }
      case UniversalSegmentType.VOICE:
        return { type: "record", data: { uri: data.url || data.fileId || data.path } }
      case UniversalSegmentType.VIDEO:
        return { type: "video", data: { uri: data.url || data.fileId || data.path } }
      case UniversalSegmentType.FILE:
        return {
          type: "file",
          data: {
            uri: data.url || data.fileId || data.path,
            name: data.name,
            size: data.size,
          },
        }
      case UniversalSegmentType.FORWARD:
        return { type: "text", data: { text: `[forward:${data.id || data.forward_id || ""}]` } }
      default:
        return { type: "text", data: { text: JSON.stringify(segment) } }
    }
  }
}

class ICQQConverter extends BaseConverter {
  convert(segments) {
    return (segments || []).map(seg => this.convertSegment(seg))
  }

  convertSegment(segment) {
    const { type, data = {} } = segment || {}
    switch (type) {
      case UniversalSegmentType.TEXT:
        return { type: "text", text: data.content }
      case UniversalSegmentType.MENTION:
        return { type: "at", qq: data.target }
      case UniversalSegmentType.MENTION_ALL:
        return { type: "at", qq: "all" }
      case UniversalSegmentType.EMOJI:
        return { type: "face", id: data.id }
      case UniversalSegmentType.REPLY:
        return { type: "reply", id: data.msgId ?? data.seq }
      case UniversalSegmentType.IMAGE:
        return {
          type: "image",
          file: data.fileId || data.url || data.path,
          summary: data.summary,
        }
      case UniversalSegmentType.VOICE:
        return { type: "record", file: data.fileId || data.url || data.path }
      case UniversalSegmentType.VIDEO:
        return { type: "video", file: data.fileId || data.url || data.path }
      case UniversalSegmentType.FILE:
        return { type: "file", file: data.fileId || data.url || data.path, name: data.name }
      case UniversalSegmentType.FORWARD:
        return { type: "text", text: `[forward:${data.id || data.forward_id || ""}]` }
      default:
        return { type: "text", text: JSON.stringify(segment) }
    }
  }
}

export { BaseConverter, OnebotV11Converter, MilkyConverter, ICQQConverter }
