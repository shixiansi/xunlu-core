// 补充原代码缺失的导入
import fs from "fs"
import path from "path"
import {
  UniversalMessage,
  UniversalMessageSegment,
  UniversalSegmentType,
} from "./message/universal-message.js"

const msg = new UniversalMessage()

/**
 * 核心：保留原base64转换逻辑，适配通用消息段的字段规范
 * @param {string} type 原消息类型（如at/image/record）
 * @param {Object} data 原消息数据
 * @returns {Object} 处理后的原始数据（供通用消息段使用）
 */
function toSegment(type, data) {
  // 深拷贝避免修改原数据
  const processedData = { ...data }

  // 保留原base64转换逻辑（核心不变）
  for (const i in processedData) {
    switch (typeof processedData[i]) {
      case "string":
        // 处理file字段或file://开头的路径，转base64
        if (
          (i === "file" || processedData[i].match(/^file:\/\//)) &&
          fs.existsSync(processedData[i].replace(/^file:\/\//, ""))
        ) {
          // 自动补全文件名（原逻辑保留）
          if (i === "file" && !processedData.name) {
            processedData.name = path.basename(processedData[i])
          }
          // 读取文件并转base64（格式：base64://xxx）
          const filePath = processedData[i].replace(/^file:\/\//, "")
          processedData[i] = `base64://${fs.readFileSync(filePath).toString("base64")}`
        }
        break
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
    const { data: processedData } = toSegment(type, data)
    // 映射原类型到通用类型（核心兼容）
    const universalType = this._mapToUniversalType(type)
    return new UniversalMessageSegment(universalType, processedData)
  }

  /**
   * 图片消息段（保留原参数：file, name）
   * @returns {UniversalMessageSegment}
   */
  image(file, name) {
    const { data } = toSegment("image", { file, name })
    // 原逻辑：无name则删除
    if (!data.name) delete data.name
    // 适配通用消息段的字段（file → fileId/url）
    return UniversalMessageSegment.image({
      fileId: data.file,
      url: data.file, // base64内容同时赋值给url/fileId，兼容不同协议
      name: data.name,
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
    // 原record → 通用VOICE（record）类型
    return UniversalMessageSegment.record({
      fileId: data.file,
      url: data.file,
      name: data.name,
    })
  }

  /**
   * 视频消息段（保留原参数：file）
   * @returns {UniversalMessageSegment}
   */
  video(file) {
    const { data } = toSegment("video", { file })
    // 适配通用消息段
    return UniversalMessageSegment.video({
      fileId: data.file,
      url: data.file,
    })
  }

  /**
   * 文件消息段（保留原参数：file, name）
   * @returns {UniversalMessageSegment}
   */
  file(file, name) {
    const { data } = toSegment("file", { file, name })
    // 适配通用文件消息段的字段
    return UniversalMessageSegment.file({
      fileId: data.file,
      url: data.file,
      path: data.file, // 兼容本地路径
      name: data.name,
    })
  }

  /**
   * 回复消息段（保留原参数：id, text, qq, time, seq）
   * @returns {UniversalMessageSegment}
   */
  reply(id, text, qq, time, seq) {
    const { data } = toSegment("reply", { id, text, qq, time, seq })
    // 原id → 通用msgId，原seq → 通用seq
    return UniversalMessageSegment.reply({
      msgId: data.id,
      seq: data.seq,
      text: data.text, // 保留回复附带的文本
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
    const { data } = toSegment("share", { url, title, content, image })
    // 分享类型暂作为自定义类型（通用体系未定义，可扩展）
    return this.custom("share", data)
  }

  /**
   * 音乐消息段（新增通用类型适配，原参数不变）
   * @returns {UniversalMessageSegment}
   */
  music(type, id, url, audio, title) {
    const { data } = toSegment("music", { type, id, url, audio, title })
    // 音乐类型暂作为自定义类型
    return this.custom("music", data)
  }

  /**
   * 戳一戳消息段（新增通用类型适配，原参数不变）
   * @returns {UniversalMessageSegment}
   */
  poke(qq) {
    const { data } = toSegment("poke", { qq })
    // 戳一戳暂作为自定义类型
    return this.custom("poke", data)
  }

  /**
   * 礼物消息段（新增通用类型适配，原参数不变）
   * @returns {UniversalMessageSegment}
   */
  gift(qq, id) {
    const { data } = toSegment("gift", { qq, id })
    // 礼物暂作为自定义类型
    return this.custom("gift", data)
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
    // 卡片图片适配为通用image类型，补充尺寸字段
    return UniversalMessageSegment.image({
      fileId: data.file,
      url: data.file,
      name: data.name,
      width: data.maxwidth || data.minwidth,
      height: data.maxheight || data.minheight,
    })
  }

  /**
   * 语音合成消息段（新增通用类型适配，原参数不变）
   * @returns {UniversalMessageSegment}
   */
  tts(text) {
    const { data } = toSegment("tts", { text })
    // TTS暂作为自定义类型（可扩展为通用TEXT类型）
    return this.custom("tts", data)
  }

  /**
   * 私有方法：原类型 → 通用类型映射（核心兼容）
   * @param {string} originalType 原类型（如at/record/face）
   * @returns {string} 通用类型
   */
  _mapToUniversalType(originalType) {
    const typeMap = {
      at: UniversalSegmentType.MENTION,
      face: UniversalSegmentType.EMOJI,
      image: UniversalSegmentType.IMAGE,
      record: UniversalSegmentType.VOICE,
      video: UniversalSegmentType.VIDEO,
      file: UniversalSegmentType.FILE,
      reply: UniversalSegmentType.REPLY,
      text: UniversalSegmentType.TEXT,
      forward: UniversalSegmentType.FORWARD,
    }
    // 未映射的类型返回原类型（自定义类型）
    return typeMap[originalType] || originalType
  }
})()

// 保留原msg实例导出（可选，根据你的使用场景）
export { msg, segment }
