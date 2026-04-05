// 补充原代码缺失的导入
import fs from "fs"
import path from "path"
import {
  UniversalMessage,
  UniversalMessageSegment,
  isUniversalSegmentType,
} from "./message/universal-message.js"

const msg = new UniversalMessage()

function shouldInlineLocalFile(segmentType, fieldName) {
  if (fieldName !== "file") return true
  return segmentType !== "video"
}

/**
 * 核心：保留原base64转换逻辑，适配通用消息段的字段规范
 * @param {string} type 原消息类型（如at/image/record）
 * @param {Object} data 原消息数据
 * @returns {Object} 处理后的原始数据（供通用消息段使用）
 */
function toSegment(type, data) {
  // 深拷贝避免修改原数据
  const processedData = { ...data }

  const shouldPreserveAsPath = value => {
    if (typeof value !== "string") return false
    return (
      /^[a-zA-Z]:[\\/]/.test(value) ||
      value.startsWith("\\\\") ||
      value.startsWith("/") ||
      value.startsWith("./") ||
      value.startsWith("../") ||
      value.startsWith("file://")
    )
  }

  // 保留原base64转换逻辑（核心不变）
  for (const i in processedData) {
    switch (typeof processedData[i]) {
      case "string": {
        if (i === "file" && !processedData.path && shouldPreserveAsPath(processedData[i])) {
          processedData.path = processedData[i]
        }
        // 处理file字段或file://开头的路径，转base64
        const filePath = processedData[i].replace(/^file:\/\//, "")
        if (
          (i === "file" || processedData[i].match(/^file:\/\//)) &&
          fs.existsSync(filePath)
        ) {
          // 自动补全文件名（原逻辑保留）
          if (i === "file" && !processedData.name) {
            processedData.name = path.basename(filePath)
          }
          if (!shouldInlineLocalFile(type, i)) {
            processedData.path = filePath
            break
          }
          // 读取文件并转base64（格式：base64://xxx）
          processedData[i] = `base64://${fs.readFileSync(filePath).toString("base64")}`
        }
        break
      }
      case "object":
        // Buffer类型转base64（原逻辑保留）
        if (Buffer.isBuffer(processedData[i])) {
          processedData[i] = `base64://${processedData[i].toString("base64")}`
        }
        break
    }
  }

  // 适配通用消息段的字段映射（原type → 通用type，原data → 通用data）
  return { type, data: processedData }
}

function unsupportedLegacySegment(methodName, type) {
  throw new Error(
    `[segment.${methodName}] ${type} is not supported by xunlu unified message format; use ctx.reply()/botApi.sendMessage() with supported segment types or protocol-specific APIs`,
  )
}

function createUniversalSegment(type, data, methodName = type) {
  const { data: processedData } = toSegment(type, data)
  if (!isUniversalSegmentType(type)) {
    unsupportedLegacySegment(methodName, type)
  }
  return new UniversalMessageSegment(type, processedData)
}

/**
 * 改造核心：将原segment类替换为基于通用消息段的实现
 * 保留原方法名、参数，仅底层调用UniversalMessageSegment
 */
const segment = new (class Segment {
  /**
   * 自定义类型（兼容原逻辑，自动适配通用消息段）
   * @param {string} type 消息类型
   * @param {Object} data 消息数据
   * @returns {UniversalMessageSegment} 通用消息段实例
   */
  custom(type, data) {
    return createUniversalSegment(type, data, "custom")
  }

  /**
   * 图片消息段（保留原参数：file, name）
   * @returns {UniversalMessageSegment}
   */
  image(file, name) {
    const { data } = toSegment("image", { file, name })
    // 原逻辑：无name则删除
    if (!data.name) delete data.name
    return UniversalMessageSegment.image({
      file: data.file,
      ...(data.path ? { path: data.path } : {}),
      ...(data.name ? { name: data.name } : {}),
    })
  }

  /**
   * @某人（保留原参数：qq, name）
   * @returns {UniversalMessageSegment}
   */
  at(qq, name) {
    const { data } = toSegment("at", { qq, name })
    // 原at(qq) → 通用mention(target)
    return UniversalMessageSegment.mention(data.qq, data.name)
  }

  /**
   * 语音消息段（保留原参数：file, name）
   * @returns {UniversalMessageSegment}
   */
  record(file, name) {
    const { data } = toSegment("record", { file, name })
    return UniversalMessageSegment.record({
      file: data.file,
      ...(data.path ? { path: data.path } : {}),
      ...(data.name ? { name: data.name } : {}),
    })
  }

  /**
   * 视频消息段（保留原参数：file）
   * @returns {UniversalMessageSegment}
   */
  video(file) {
    const { data } = toSegment("video", { file })
    return UniversalMessageSegment.video({
      file: data.file,
      ...(data.path ? { path: data.path } : {}),
    })
  }

  /**
   * 文件消息段（保留原参数：file, name）
   * @returns {UniversalMessageSegment}
   */
  file(file, name) {
    const { data } = toSegment("file", { file, name })
    return UniversalMessageSegment.file({
      file: data.file,
      ...(data.path ? { path: data.path } : {}),
      ...(data.name ? { name: data.name } : {}),
    })
  }

  /**
   * 回复消息段（保留原参数：id, text, qq, time, seq）
   * @returns {UniversalMessageSegment}
   */
  reply(id, text, qq, time, seq) {
    const { data } = toSegment("reply", { id, text, qq, time, seq })
    return UniversalMessageSegment.reply({
      ...(data.id !== undefined ? { id: data.id } : {}),
      ...(data.seq !== undefined ? { seq: data.seq } : {}),
      ...(data.text !== undefined ? { text: data.text } : {}),
    })
  }

  /**
   * 表情消息段（保留原参数：id）
   * @returns {UniversalMessageSegment}
   */
  face(id) {
    const { data } = toSegment("face", { id })
    // 原face(id) → 通用EMOJI（face）类型
    return UniversalMessageSegment.face(data.id)
  }

  /**
   * 分享消息段（新增通用类型适配，原参数不变）
   * @returns {UniversalMessageSegment}
   */
  share(url, title, content, image) {
    unsupportedLegacySegment("share", "share")
  }

  /**
   * 音乐消息段（新增通用类型适配，原参数不变）
   * @returns {UniversalMessageSegment}
   */
  music(type, id, url, audio, title) {
    unsupportedLegacySegment("music", "music")
  }

  /**
   * 戳一戳消息段（新增通用类型适配，原参数不变）
   * @returns {UniversalMessageSegment}
   */
  poke(qq) {
    unsupportedLegacySegment("poke", "poke")
  }

  /**
   * 礼物消息段（新增通用类型适配，原参数不变）
   * @returns {UniversalMessageSegment}
   */
  gift(qq, id) {
    unsupportedLegacySegment("gift", "gift")
  }

  /**
   * 卡片图片消息段（新增通用类型适配，原参数不变）
   * @returns {UniversalMessageSegment}
   */
  cardimage(file, name, minwidth, minheight, maxwidth, maxheight, source, icon) {
    const { data } = toSegment("cardimage", {
      file,
      name,
      minwidth,
      minheight,
      maxwidth,
      maxheight,
      source,
      icon,
    })
    return UniversalMessageSegment.image({
      file: data.file,
      ...(data.path ? { path: data.path } : {}),
      ...(data.name ? { name: data.name } : {}),
      ...(data.maxwidth || data.minwidth
        ? { width: Number(data.maxwidth || data.minwidth) }
        : {}),
      ...(data.maxheight || data.minheight
        ? { height: Number(data.maxheight || data.minheight) }
        : {}),
    })
  }

  /**
   * 语音合成消息段（新增通用类型适配，原参数不变）
   * @returns {UniversalMessageSegment}
   */
  tts(text) {
    unsupportedLegacySegment("tts", "tts")
  }
})()

// 保留原msg实例导出（可选，根据你的使用场景）
export { msg, segment }
