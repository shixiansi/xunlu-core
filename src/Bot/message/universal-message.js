import { OnebotV11Converter, MilkyConverter, ICQQConverter } from "./message-converters.js"

const UniversalSegmentType = {
  MENTION: "at", // 提及（@某人）
  MENTION_ALL: "atAll", // 提及全体
  EMOJI: "face", // 表情
  REPLY: "reply", // 回复
  IMAGE: "image", // 图片
  VOICE: "record", // 语音
  VIDEO: "video", // 视频
  FORWARD: "forward", // 合并转发
  TEXT: "text", // 文本
  FILE: "file", // 文件
}

/**
 * 通用消息段类 - 修复@类型兼容 + 统一工具方法
 */
class UniversalMessageSegment {
  constructor(type, data = {}) {
    if (!Object.values(UniversalSegmentType).includes(type)) {
      throw new Error(
        `无效的消息段类型: ${type}，仅支持 ${Object.values(UniversalSegmentType).join(", ")}`,
      )
    }
    this.type = type
    this.data = this._validateData(type, data)
  }

  /**
   * 校验数据（保持原有逻辑，仅补充注释）
   */
  _validateData(type, data) {
    const validated = { ...data }
    switch (type) {
      case UniversalSegmentType.MENTION:
        if (!validated.target) throw new Error("mention类型必须指定target（用户ID）")
        validated.target = String(validated.target)
        break
      case UniversalSegmentType.REPLY:
        if (!validated.msgId && !validated.seq)
          throw new Error("reply类型必须指定msgId（消息ID）或者seq（消息序号）")
        if (validated.msgId) validated.msgId = String(validated.msgId)
        if (validated.seq) validated.seq = Number(validated.seq)
        break
      case UniversalSegmentType.FORWARD:
        break
      case UniversalSegmentType.TEXT:
        if (validated.content === undefined || validated.content === null) {
          throw new Error("text类型必须指定content（文本内容）")
        }
        validated.content = String(validated.content)
        break
      case UniversalSegmentType.FILE:
        if (!validated.url && !validated.fileId && !validated.path) {
          throw new Error("file类型必须指定url/fileId/path中的至少一个")
        }
        ;["url", "fileId", "path", "name"].forEach(key => {
          if (validated[key]) validated[key] = String(validated[key])
        })
        if (validated.size) validated.size = Number(validated.size)
        break
      case UniversalSegmentType.EMOJI:
        if (validated.id) validated.id = Number(validated.id)
        break
      case UniversalSegmentType.IMAGE:
        if (!validated.url && !validated.fileId && !validated.path) {
          throw new Error("image类型必须指定url/fileId/path中的至少一个")
        }
        ;["url", "fileId", "path", "name"].forEach(key => {
          if (validated[key]) validated[key] = String(validated[key])
        })
        if (validated.size) validated.size = Number(validated.size)
        break
      case UniversalSegmentType.VOICE:
      case UniversalSegmentType.VIDEO:
        ;["url", "fileId", "path"].forEach(key => {
          if (validated[key]) validated[key] = String(validated[key])
        })
        ;["duration", "width", "height"].forEach(key => {
          if (validated[key]) validated[key] = Number(validated[key])
        })
        break
      default:
        break
    }
    return validated
  }

  // ========== 便捷创建方法（统一@类型参数） ==========
  static text(content) {
    return new UniversalMessageSegment(UniversalSegmentType.TEXT, { content })
  }
  static file(options) {
    return new UniversalMessageSegment(UniversalSegmentType.FILE, options)
  }
  // 统一@某人的创建方法（仅需传target，兼容所有协议）
  static mention(target) {
    return new UniversalMessageSegment(UniversalSegmentType.MENTION, { target })
  }
  static mentionAll() {
    return new UniversalMessageSegment(UniversalSegmentType.MENTION_ALL, {})
  }
  static face(id) {
    return new UniversalMessageSegment(UniversalSegmentType.EMOJI, { id })
  }
  static reply(options) {
    // 优化：支持对象参数，兼容msgId/seq
    return new UniversalMessageSegment(UniversalSegmentType.REPLY, options)
  }
  static image(options) {
    return new UniversalMessageSegment(UniversalSegmentType.IMAGE, options)
  }
  static record(options) {
    return new UniversalMessageSegment(UniversalSegmentType.VOICE, options)
  }
  static video(options) {
    return new UniversalMessageSegment(UniversalSegmentType.VIDEO, options)
  }
  static forward(options) {
    // 修正拼写错误 forwoerd → forward
    return new UniversalMessageSegment(UniversalSegmentType.FORWARD, options)
  }

  // ========== 新增：统一识别@类型的工具方法（核心兼容） ==========
  /**
   * 统一解析不同协议的@类型消息段
   * @param {Object} segment 原生消息段
   * @param {string} protocol 协议类型（onebotv11/milky/icqq）
   * @returns {UniversalMessageSegment}
   */
  static parseMentionSegment(segment, protocol) {
    const { type, data = {} } = segment
    // 根据协议识别@类型
    switch (protocol.toLowerCase()) {
      case "milky":
        // Milky: mention → @某人, mentionAll → @全体
        if (type === "mention") return UniversalMessageSegment.mention(data.user_id)
        if (type === "mention_all" || type === "mentionAll") return UniversalMessageSegment.mentionAll()
        break
      case "onebotv11":
        // OnebotV11: at → @某人/全体（qq=all）
        if (type === "at") {
          return data.qq === "all"
            ? UniversalMessageSegment.mentionAll()
            : UniversalMessageSegment.mention(data.qq)
        }
        break
      case "icqq":
        // ICQQ: at → @某人/全体（type=all）
        if (type === "at") {
          const qq = segment.qq ?? data.qq
          return qq === "all" || qq === 0 || String(qq) === "0"
            ? UniversalMessageSegment.mentionAll()
            : UniversalMessageSegment.mention(qq)
        }
        break
    }
    return null // 不是@类型，返回null
  }

  // ========== 协议→通用 转换方法（修复@兼容 + 修正错误） ==========
  static fromOnebotV11(segment) {
    const { type, data = {} } = segment
    // 优先解析@类型（核心兼容）
    const mentionSeg = this.parseMentionSegment(segment, "onebotv11")
    if (mentionSeg) return mentionSeg

    switch (type) {
      case "text":
        return UniversalMessageSegment.text(data.text ?? segment.text ?? "")
      case "face":
        return UniversalMessageSegment.face(data.id)
      case "reply":
        return UniversalMessageSegment.reply({ msgId: data.id })
      case "image":
        return UniversalMessageSegment.image({
          url: data.url || data.file,
          fileId: data.file,
          width: data.width,
          height: data.height,
          summary: data.summary,
        })
      case "record":
        return UniversalMessageSegment.record({
          url: data.url,
          fileId: data.file,
          duration: data.duration || 0,
        })
      case "video":
        return UniversalMessageSegment.video({
          url: data.url,
          fileId: data.file,
          duration: data.duration || 0,
          width: data.width || 0,
          height: data.height || 0,
        })
      case "file":
        return UniversalMessageSegment.file({
          url: data.url,
          fileId: data.file,
          name: data.name,
          size: data.size || 0,
        })
      case "forward":
        return UniversalMessageSegment.forward({
          id: data.id,
          title: data.title || "",
          preview: "",
          summary: "转发消息",
        })
      default:
        console.warn(`不支持的OnebotV11类型: ${type}，降级为文本`)
        return UniversalMessageSegment.text(JSON.stringify(segment))
    }
  }

  static fromMilky(segment) {
    const { type, data = {} } = segment
    // 优先解析@类型（核心兼容）
    const mentionSeg = this.parseMentionSegment(segment, "milky")
    if (mentionSeg) return mentionSeg

    switch (type) {
      case "text":
        return UniversalMessageSegment.text(data.text || "")
      case "face":
        return UniversalMessageSegment.face(data.face_id)
      case "reply":
        return UniversalMessageSegment.reply({ seq: data.message_seq }) // 优化：传对象参数
      case "image":
        return UniversalMessageSegment.image({
          url: data.temp_url,
          fileId: data.resource_id,
          width: data.width,
          height: data.height,
          summary: data.summary,
        })
      case "record":
        return UniversalMessageSegment.record({
          url: data.temp_url,
          fileId: data.resource_id,
          duration: data.duration || 0,
        })
      case "video":
        return UniversalMessageSegment.video({
          url: data.temp_url,
          fileId: data.resource_id,
          duration: data.duration || 0,
          width: data.width || 0,
          height: data.height || 0,
        })
      case "file":
        return UniversalMessageSegment.file({
          url: "",
          fileId: data.file_id,
          path: data.file_hash,
          name: data.file_name,
          size: data.file_size || 0,
        })
      case "forward":
        return UniversalMessageSegment.forward({
          id: data.id,
          title: data.title || "",
          preview: data.preview,
          summary: data.summary,
        })
      default:
        console.warn(`不支持的Milky类型: ${type}，降级为文本`)
        return UniversalMessageSegment.text(JSON.stringify(segment))
    }
  }

  static fromICQQ(segment) {
    const { type } = segment
    // 优先解析@类型（核心兼容）
    const mentionSeg = this.parseMentionSegment(segment, "icqq")
    if (mentionSeg) return mentionSeg

    switch (type) {
      case "text":
        return UniversalMessageSegment.text(segment.text || "")
      case "face":
        return UniversalMessageSegment.face(segment.id)
      case "reply":
        return UniversalMessageSegment.reply({
          msgId: segment.id ?? segment?.data?.id,
          seq: segment.seq ?? segment.message_seq ?? segment?.data?.message_seq,
        })
      case "image":
        return UniversalMessageSegment.image({
          url: segment.url || segment.file,
          fileId: segment.file,
          width: segment.width || 0,
          height: segment.height || 0,
          summary: segment.summary,
        })
      case "record":
        return UniversalMessageSegment.record({
          url: segment.file || segment.url,
          fileId: segment.file,
          duration: segment.seconds || 0,
        })
      case "video":
        return UniversalMessageSegment.video({
          url: segment.file || segment.url,
          fileId: segment.fid,
          duration: segment.seconds || 0,
          width: segment.width || 0,
          height: segment.height || 0,
        })
      case "file":
        return UniversalMessageSegment.file({
          url: segment.file,
          fileId: segment.fid,
          name: segment.name,
          size: segment.size || 0,
        })
      case "multimsg":
        return UniversalMessageSegment.forward({
          id: segment.resid,
          title: segment.title || "",
          preview: segment.preview,
          summary: "[聊天记录]",
        })

      default:
        console.warn(`不支持的ICQQ类型: ${type}，降级为文本`)
        return UniversalMessageSegment.text(JSON.stringify(segment))
    }
  }
}

/**
 * 通用消息类（保持原有逻辑，仅修正注释）
 */
class UniversalMessage {
  constructor() {
    this.segments = []
  }

  addSegment(segment) {
    if (!(segment instanceof UniversalMessageSegment)) {
      throw new Error("添加的消息段必须是UniversalMessageSegment实例")
    }
    this.segments.push(segment)
  }

  addSegments(segments) {
    segments.forEach(seg => this.addSegment(seg))
  }

  addText(content) {
    this.addSegment(UniversalMessageSegment.text(content))
  }

  addFile(options) {
    this.addSegment(UniversalMessageSegment.file(options))
  }

  addMention(target) {
    // 统一参数：仅需target
    this.addSegment(UniversalMessageSegment.mention(target))
  }

  addMentionAll() {
    this.addSegment(UniversalMessageSegment.mentionAll())
  }

  convertTo(protocol) {
    const converter = this._getConverter(protocol)
    return converter.convert(this.segments)
  }

  _getConverter(protocol) {
    switch (protocol.toLowerCase()) {
      case "onebotv11":
        return new OnebotV11Converter()
      case "milky":
        return new MilkyConverter()
      case "icqq":
        return new ICQQConverter()
      default:
        throw new Error(`不支持的协议类型: ${protocol}，仅支持 onebotv11/milky/icqq`)
    }
  }

  static fromOnebotV11(onebotSegments) {
    const msg = new UniversalMessage()
    if (!Array.isArray(onebotSegments)) return msg
    onebotSegments.forEach(seg => {
      msg.addSegment(UniversalMessageSegment.fromOnebotV11(seg))
    })
    return msg
  }

  static fromMilky(milkySegments) {
    const msg = new UniversalMessage()
    if (!Array.isArray(milkySegments)) return msg
    milkySegments.forEach(seg => {
      msg.addSegment(UniversalMessageSegment.fromMilky(seg))
    })
    return msg
  }

  static fromICQQ(icqqSegments) {
    const msg = new UniversalMessage()
    if (!Array.isArray(icqqSegments)) return msg
    icqqSegments.forEach(seg => {
      msg.addSegment(UniversalMessageSegment.fromICQQ(seg))
    })
    return msg
  }

  static from(protocol, segments) {
    switch (protocol.toLowerCase()) {
      case "onebotv11":
        return UniversalMessage.fromOnebotV11(segments)
      case "milky":
        return UniversalMessage.fromMilky(segments)
      case "icqq":
        return UniversalMessage.fromICQQ(segments)
      default:
        throw new Error(`不支持的协议类型: ${protocol}`)
    }
  }
}

export { UniversalSegmentType, UniversalMessageSegment, UniversalMessage }
