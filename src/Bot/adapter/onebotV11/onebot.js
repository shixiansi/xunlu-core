import { WebSocketServer, WebSocket } from "ws"
import fs from "node:fs"
import { fileURLToPath } from "url"
import { dirname, resolve as resolvePath } from "path"
import EventEmitter from "events"
import { classifyMediaReference, coerceToUniversalMessage } from "../../message/context.js"

// 解决 ES6 模块中 __dirname 缺失问题
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = resolvePath(__dirname, "..", "..", "..")

function normalizeOnebotAction(action) {
  if (action === undefined || action === null) return ""
  let out = String(action).trim()
  while (out.startsWith("/")) out = out.slice(1)
  return out
}

function dedupeStringList(list) {
  const out = []
  const seen = new Set()
  for (const item of Array.isArray(list) ? list : []) {
    const text = String(item || "").trim()
    if (!text || seen.has(text)) continue
    seen.add(text)
    out.push(text)
  }
  return out
}

function resolveOnebotMediaTarget(
  value,
  { cwd = process.cwd(), projectRoot = PROJECT_ROOT, exists = fs.existsSync } = {},
) {
  const ref = classifyMediaReference(value)
  if (!ref.value) {
    return {
      ok: false,
      kind: ref.kind,
      value: "",
      reason: "empty",
      message: "[OneBotV11Adapter] empty media reference",
    }
  }

  if (["url", "fileUri", "base64", "dataUri", "opaqueId"].includes(ref.kind)) {
    return { ok: true, kind: ref.kind, value: ref.value }
  }

  if (ref.kind === "absolutePath") {
    if (exists(ref.value)) return { ok: true, kind: ref.kind, value: ref.value }
    return {
      ok: false,
      kind: ref.kind,
      value: ref.value,
      reason: "missing_absolute_path",
      message: `[OneBotV11Adapter] local media path not found: ${ref.value}`,
      tried: [ref.value],
    }
  }

  if (ref.kind === "relativePath" || ref.kind === "basename") {
    const tried = dedupeStringList([resolvePath(cwd, ref.value), resolvePath(projectRoot, ref.value)])
    const hit = tried.find(item => exists(item))
    if (hit) return { ok: true, kind: ref.kind, value: hit, tried }
    return {
      ok: false,
      kind: ref.kind,
      value: ref.value,
      reason: "missing_local_path",
      message: `[OneBotV11Adapter] unresolved local media reference: ${ref.value}; tried: ${tried.join(", ")}`,
      tried,
    }
  }

  return { ok: true, kind: ref.kind, value: ref.value }
}

/**
 * OneBot V11 反向WS适配器（Milky标准风格）
 * 完整实现OneBot V11 API，兼容Milky适配器调用风格
 */
class OneBotV11Adapter {
  constructor(config = {}) {
    // 合并配置项（默认值 + 用户配置）
    this.config = {
      wsPort: 2955, // 反向WS监听端口
      wsPath: "/OneBotV11", // 连接路径
      timeout: 60000, // API超时时间
      reconnectInterval: 5000, // 服务端重启间隔
      botNickname: "OneBotV11-ES6", // 机器人昵称
      ...config,
    }

    // 核心状态管理
    this.wss = null // WS服务端实例
    this.client = null // 连接的llonebot客户端
    this.isConnected = false // 连接状态
    this.requests = new Map() // 待响应的API请求
    this.eventEmitter = new EventEmitter() // 事件发射器（适配Milky事件风格）

    // 标识适配器类型
    this.adapterType = "onebot-v11"
  }

  #fixCorruptedJpegHeader(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 12) return buf

    const looksLikeJfif =
      buf[0] === 0xfd &&
      buf[1] === 0xfd &&
      buf[2] === 0xfd &&
      buf[3] === 0xfd &&
      buf[4] === 0x00 &&
      buf[5] === 0x10 &&
      buf[6] === 0x4a &&
      buf[7] === 0x46 &&
      buf[8] === 0x49 &&
      buf[9] === 0x46 &&
      buf[10] === 0x00

    if (!looksLikeJfif) return buf

    const fixed = Buffer.from(buf)
    fixed[0] = 0xff
    fixed[1] = 0xd8
    fixed[2] = 0xff
    fixed[3] = 0xe0
    return fixed
  }

  #fixCorruptedJpegBase64(base64) {
    if (typeof base64 !== "string") return base64
    const b64 = base64.trim()
    if (!b64) return b64

    // Fast-path: known corrupted prefix (FD FD FD FD 00 10 ...)
    if (b64.startsWith("/f39/QAQ")) {
      return `/9j/4AAQ${b64.slice(8)}`
    }

    // Light check: decode a small prefix to detect the corruption pattern
    try {
      const head = b64.slice(0, 24) // multiple of 4, enough for 18 bytes
      const buf = Buffer.from(head, "base64")
      const looksLikeJfif =
        buf[0] === 0xfd &&
        buf[1] === 0xfd &&
        buf[2] === 0xfd &&
        buf[3] === 0xfd &&
        buf[4] === 0x00 &&
        buf[5] === 0x10 &&
        buf[6] === 0x4a &&
        buf[7] === 0x46 &&
        buf[8] === 0x49 &&
        buf[9] === 0x46

      if (looksLikeJfif && b64.length >= 8) {
        return `/9j/4AAQ${b64.slice(8)}`
      }
    } catch {}

    return b64
  }

  #extractMessageId(resp) {
    if (resp === null || resp === undefined) return undefined

    if (typeof resp === "number") {
      // Some implementations use signed 32-bit ints; message_id can be negative.
      return Number.isFinite(resp) && resp !== 0 ? resp : undefined
    }

    if (typeof resp === "string") {
      const n = Number(resp)
      return Number.isFinite(n) && n !== 0 ? n : undefined
    }

    if (typeof resp !== "object") return undefined

    const direct = resp.message_id ?? resp.messageId ?? resp.msg_id ?? resp.msgId ?? resp.id
    if (direct !== undefined && direct !== null) {
      const n = Number(direct)
      return Number.isFinite(n) && n !== 0 ? n : undefined
    }

    const nested = resp.data && typeof resp.data === "object" ? resp.data : null
    if (nested) {
      const mid =
        nested.message_id ?? nested.messageId ?? nested.msg_id ?? nested.msgId ?? nested.id
      if (mid !== undefined && mid !== null) {
        const n = Number(mid)
        return Number.isFinite(n) && n !== 0 ? n : undefined
      }
    }

    return undefined
  }

  #shouldFallbackForMissingMessageId(resp) {
    if (resp === null || resp === undefined) return true
    if (typeof resp !== "object") return true
    if (Array.isArray(resp)) return resp.length === 0
    return Object.keys(resp).length === 0
  }

  #normalizeOnebotFile(file) {
    if (!file) return ""

    // Buffer -> base64://
    if (Buffer.isBuffer(file)) {
      const fixed = this.#fixCorruptedJpegHeader(file)
      return `base64://${fixed.toString("base64")}`
    }

    const resolved = resolveOnebotMediaTarget(file)
    if (!resolved.ok) throw new Error(resolved.message)

    const f = String(resolved.value || "").trim()
    if (!f) return ""

    // Already supported forms
    if (f.startsWith("base64://")) {
      const b64 = f.slice("base64://".length)
      return `base64://${this.#fixCorruptedJpegBase64(b64)}`
    }
    if (f.startsWith("http://") || f.startsWith("https://") || f.startsWith("file://")) return f

    // data URI -> base64://...
    if (f.startsWith("data:image/")) {
      const idx = f.indexOf(",")
      if (idx > -1 && idx < f.length - 1) {
        return `base64://${f.slice(idx + 1)}`
      }
      return ""
    }

    // Looks like raw binary string (common when Buffer was coerced to string)
    const head = f.slice(0, 64)
    const hasControlBytes = /[\x00-\x08\x0E-\x1F]/.test(head) || head.includes("\u0000")
    const hasJfif = head.includes("JFIF") || head.includes("Exif")
    const looksBinary = hasControlBytes || hasJfif

    if (looksBinary) {
      const buf = this.#fixCorruptedJpegHeader(Buffer.from(f, "latin1"))
      return `base64://${buf.toString("base64")}`
    }

    // Looks like pure base64 (missing prefix) -> add prefix
    if (
      f.length > 128 &&
      (f.startsWith("/9j/") || f.startsWith("iVBORw0KGgo") || f.startsWith("R0lGOD")) // jpg/png/gif
    ) {
      return `base64://${f}`
    }
    return f
  }

  #pickOutgoingMediaValue(item) {
    return (
      item?.data?.file ??
      item?.data?.url ??
      item?.data?.uri ??
      item?.data?.path ??
      item?.data?.fileId ??
      item?.file ??
      item?.url ??
      item?.uri ??
      item?.path ??
      item?.fileId ??
      ""
    )
  }

  #normalizeOutgoingMediaSegment(item, type) {
    const file = this.#normalizeOnebotFile(this.#pickOutgoingMediaValue(item))
    if (!file) throw new Error(`[OneBotV11Adapter] ${type} segment missing file/url/path/fileId`)
    const nextData = item?.data && typeof item.data === "object" ? { ...item.data, file } : { file }
    return { ...item, type, data: nextData }
  }

  #summarizeForLog(value) {
    const summarizeString = str => {
      const s = String(str)
      if (s.startsWith("base64://")) return `base64://<len=${s.length}>`
      if (s.length > 160) return `${s.slice(0, 160)}...<len=${s.length}>`
      return s
    }

    if (value === null || value === undefined) return value
    if (typeof value === "string" || typeof value === "number") return summarizeString(value)

    if (Array.isArray(value)) {
      return value.map(v => this.#summarizeForLog(v))
    }

    if (typeof value === "object") {
      const out = {}
      for (const [k, v] of Object.entries(value)) {
        if (k === "file" && typeof v === "string") out[k] = summarizeString(v)
        else if (k === "message" || k === "params") out[k] = this.#summarizeForLog(v)
        else if (k === "data") out[k] = this.#summarizeForLog(v)
        else out[k] = v
      }
      return out
    }

    return value
  }

  #canEncodeAsCq(message) {
    const supportedTypes = new Set(["text", "face", "at", "image", "record", "video", "reply"])
    const list = Array.isArray(message) ? message : [message]
    return list.every(seg => {
      if (seg === null || seg === undefined) return true
      if (typeof seg === "string" || typeof seg === "number") return true
      if (typeof seg !== "object") return false
      return supportedTypes.has(seg.type)
    })
  }

  #onebotSegmentsToCqCode(message) {
    const list = Array.isArray(message) ? message : message ? [message] : []
    const escape = v =>
      String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/,/g, "&#44;")
        .replace(/\[/g, "&#91;")
        .replace(/\]/g, "&#93;")

    let out = ""
    for (const seg of list) {
      if (seg === null || seg === undefined) continue
      if (typeof seg === "string" || typeof seg === "number") {
        out += String(seg)
        continue
      }
      if (typeof seg !== "object") {
        out += String(seg)
        continue
      }

      const type = seg.type
      const data = seg.data || {}

      if (type === "text") {
        out += String(data.text ?? seg.text ?? "")
        continue
      }

      if (type === "face") {
        const id = data.id ?? data.face_id ?? seg.id ?? seg.face_id ?? ""
        out += `[CQ:face,id=${escape(id)}]`
        continue
      }

      if (type === "at") {
        const qq = data.qq ?? seg.qq
        out += `[CQ:at,qq=${escape(qq)}]`
        continue
      }

      if (type === "image") {
        const file = data.file ?? seg.file ?? ""
        out += `[CQ:image,file=${escape(file)}]`
        continue
      }

      if (type === "record") {
        const file = data.file ?? seg.file ?? ""
        out += `[CQ:record,file=${escape(file)}]`
        continue
      }

      if (type === "video") {
        const file = data.file ?? seg.file ?? ""
        out += `[CQ:video,file=${escape(file)}]`
        continue
      }

      if (type === "reply") {
        const id = data.id ?? seg.id ?? ""
        out += `[CQ:reply,id=${escape(id)}]`
        continue
      }

      // fallback
      out += escape(JSON.stringify(seg))
    }

    return out
  }

  /**
   * 启动反向WS服务端（适配 ws@8.18.1）
   */
  startServer() {
    // 关闭已有服务
    if (this.wss) {
      this.wss.close(err => err && console.error("❌ 关闭OneBot服务失败：", err))
      this.wss = null
    }

    try {
      // 创建WS服务端（ws@8.18.1 正确写法）
      this.wss = new WebSocketServer({
        port: this.config.wsPort,
        // 验证连接路径
        verifyClient: (info, callback) => {
          const isValid = info.req.url === this.config.wsPath
          if (!isValid) console.warn(`❌ 拒绝无效路径连接：${info.req.url}`)
          callback(isValid)
        },
      })

      console.log(
        `🔌 OneBot V11反向WS服务端启动：端口${this.config.wsPort}，路径${this.config.wsPath}`,
      )

      // 监听新连接
      this.wss.on("connection", (ws, req) => {
        this.client = ws
        this.isConnected = true
        console.log(`✅ llonebot客户端已连接 (IP: ${req.socket.remoteAddress})`)
        this.eventEmitter.emit("connect", { ip: req.socket.remoteAddress })

        // 监听客户端消息
        ws.on("message", data => this.handleMessage(data))

        // 监听客户端断开
        ws.on("close", (code, reason) => {
          this.isConnected = false
          this.client = null
          const reasonStr = reason.toString("utf8") || "无"
          console.log(`❌ llonebot客户端断开：状态码${code}，原因${reasonStr}`)
          this.eventEmitter.emit("disconnect", { code, reason: reasonStr })
        })

        // 监听客户端错误
        ws.on("error", err => {
          this.isConnected = false
          this.client = null
          console.error("❌ 客户端连接错误：", err)
          this.eventEmitter.emit("error", err)
        })
      })

      // 监听服务端错误
      this.wss.on("error", err => {
        console.error("❌ OneBot V11服务端错误：", err)
        this.eventEmitter.emit("server_error", err)
        // 自动重启
        setTimeout(() => {
          console.log("🔄 尝试重启OneBot V11服务端...")
          this.startServer()
        }, this.config.reconnectInterval)
      })
    } catch (err) {
      console.error("❌ 启动OneBot V11服务端失败：", err)
      this.eventEmitter.emit("server_error", err)
      setTimeout(() => this.startServer(), this.config.reconnectInterval)
    }
  }

  /**
   * 处理收到的消息/响应（转发为事件）
   * @param {Buffer|String} data 原始数据
   */
  handleMessage(data) {
    try {
      const dataStr = typeof data === "string" ? data : data.toString("utf8")
      const payload = JSON.parse(dataStr)

      // 1. 处理API响应（带echo）
      if (payload.echo) {
        const callback = this.requests.get(payload.echo)
        if (callback) {
          callback(null, payload)
          this.requests.delete(payload.echo)
        }
        return
      }

      // 2. 处理事件推送（转发到事件发射器）
      this.handleEvent(payload)
    } catch (err) {
      console.error("❌ 解析OneBot消息失败：", err, "原始数据：", data)
      this.eventEmitter.emit("parse_error", { err, rawData: data })
    }
  }

  /**
   * 处理OneBot事件（转发为Milky风格的事件）
   * @param {Object} payload 事件数据
   */
  handleEvent(payload) {
    const { post_type } = payload
    // 消息事件
    if (post_type === "message") {
      this.eventEmitter.emit("message", payload) // 兼容Milky的message_receive
    }
    // 请求事件
    else if (post_type === "request") {
      this.eventEmitter.emit("request", payload)
    }
    // 通知事件
    else if (post_type === "notice") {
      console.log("Received notice event:", payload)

      this.eventEmitter.emit("notice", payload)
    }
    // 元事件
    else if (post_type === "meta_event") {
      this.eventEmitter.emit(`meta_${payload.meta_event_type}`, payload)
      this.eventEmitter.emit("meta_event", payload)
    }
    // 通用事件转发
    this.eventEmitter.emit("all_event", payload)
  }

  /**
   * 通用API调用方法（底层核心，适配Milky风格）
   * @param {String} action OneBot V11 API动作名
   * @param {Object} params API参数
   * @returns {Promise<Object>} API响应结果
   */
  async callApi(action, params = {}) {
    const normalizedAction = normalizeOnebotAction(action)
    if (!normalizedAction) throw new Error("[OneBotV11Adapter] callApi requires action")
    action = normalizedAction

    return new Promise((resolve, reject) => {
      // 检查连接状态
      if (!this.isConnected || !this.client) {
        reject(new Error("llonebot客户端未连接"))
        return
      }

      // 生成唯一echo标识
      const echo = Date.now() + "_" + Math.random().toString(36).substr(2, 9)
      const payload = { action, params, echo }

      // 存储回调
      this.requests.set(echo, (err, data) => {
        if (err) {
          reject(err)
          return
        }

        const status = data?.status
        const retcode = data?.retcode

        // 仅对明确的失败做 reject，避免“无声失败”
        if ((status && status !== "ok") || (retcode !== undefined && Number(retcode) !== 0)) {
          const msg = data?.msg ?? data?.wording ?? data?.message ?? ""
          console.error(
            `❌ OneBot API响应失败：${action} retcode=${retcode} status=${status} msg=${msg}`,
            this.#summarizeForLog(data),
          )
          reject(
            new Error(
              `[OneBotV11Adapter] ${action} failed: retcode=${retcode} status=${status} msg=${msg}`,
            ),
          )
          return
        }

        if (action === "send_msg" || action === "send_group_msg" || action === "send_private_msg") {
          console.log(`📥 OneBot API响应：${action}`, this.#summarizeForLog(data))
        }

        resolve(data?.data || data) // 兼容OneBot响应格式（取data字段）
      })

      // 发送请求（ws@8.18.1 兼容）
      this.client.send(JSON.stringify(payload), err => {
        if (err) {
          console.error(`❌ 发送OneBot API请求失败：${action}`, err)
          this.requests.delete(echo)
          reject(err)
        } else {
          console.log(`📤 发送OneBot API请求：${action}，参数：`, this.#summarizeForLog(params))
        }
      })

      // 超时处理
      setTimeout(() => {
        if (this.requests.has(echo)) {
          this.requests.delete(echo)
          reject(new Error(`OneBot API ${action} 调用超时`))
        }
      }, this.config.timeout)
    })
  }

  /**
   * 兼容：sendApi(action, params)（与文档路径写法一致）
   * - 支持 "/send_like" / "send_like"
   */
  async sendApi(action, params = {}) {
    return await this.callApi(action, params)
  }

  // ==================== 系统API（Milky风格） ====================
  /**
   * 获取登录信息
   * @returns {Promise<Object>}
   */
  async getLoginInfo() {
    return await this.callApi("get_login_info")
  }

  /**
   * 获取版本信息
   * @returns {Promise<Object>}
   */
  async getVersionInfo() {
    return await this.callApi("get_version_info")
  }

  /**
   * 获取运行状态
   * @returns {Promise<Object>}
   */
  async getStatus() {
    return await this.callApi("get_status")
  }

  // ==================== 好友API（Milky风格） ====================
  /**
   * 获取好友列表
   * @param {Object} params 参数
   * @returns {Promise<Object>}
   */
  async getFriendList(params = {}) {
    return await this.callApi("get_friend_list", params)
  }

  /**
   * 获取陌生人/好友信息
   * @param {Object} params { user_id, no_cache }
   * @returns {Promise<Object>}
   */
  async getFriendInfo(params) {
    return await this.callApi("get_stranger_info", params)
  }

  /**
   * 处理好友添加请求
   * @param {Object} params { flag, approve, remark }
   * @returns {Promise<Object>}
   */
  async acceptFriendRequest(params) {
    return await this.callApi("set_friend_add_request", {
      ...params,
      approve: true,
    })
  }

  /**
   * 拒绝好友添加请求
   * @param {Object} params { flag, reason }
   * @returns {Promise<Object>}
   */
  async rejectFriendRequest(params) {
    return await this.callApi("set_friend_add_request", {
      ...params,
      approve: false,
    })
  }

  // ==================== 群聊API（Milky风格） ====================
  /**
   * 获取群列表
   * @param {Object} params 参数
   * @returns {Promise<Object>}
   */
  async getGroupList(params = {}) {
    return await this.callApi("get_group_list", params)
  }

  /**
   * 获取群信息
   * @param {Object} params { group_id, no_cache }
   * @returns {Promise<Object>}
   */
  async getGroupInfo(params) {
    return await this.callApi("get_group_info", params)
  }

  /**
   * 获取群成员列表
   * @param {Object} params { group_id, no_cache }
   * @returns {Promise<Object>}
   */
  async getGroupMemberList(params) {
    return await this.callApi("get_group_member_list", params)
  }

  /**
   * 获取群成员信息
   * @param {Object} params { group_id, user_id, no_cache }
   * @returns {Promise<Object>}
   */
  async getGroupMemberInfo(params) {
    return await this.callApi("get_group_member_info", params)
  }

  /**
   * 设置群名称
   * @param {Object} params { group_id, group_name }
   * @returns {Promise<Object>}
   */
  async setGroupName(params) {
    return await this.callApi("set_group_name", params)
  }

  async sendGroupMessageReaction(params) {
    return await this.callApi("set_msg_emoji_like", params)
  }

  /**
   * 设置群成员名片
   * @param {Object} params { group_id, user_id, card }
   * @returns {Promise<Object>}
   */
  async setGroupMemberCard(params) {
    return await this.callApi("set_group_card", params)
  }

  /**
   * 设置群成员专属头衔
   * @param {Object} params { group_id, user_id, special_title, duration }
   * @returns {Promise<Object>}
   */
  async setGroupMemberSpecialTitle(params) {
    return await this.callApi("set_group_special_title", params)
  }

  /**
   * 设置群管理员
   * @param {Object} params { group_id, user_id, enable }
   * @returns {Promise<Object>}
   */
  async setGroupMemberAdmin(params) {
    return await this.callApi("set_group_admin", params)
  }

  /**
   * 设置群成员禁言
   * @param {Object} params { group_id, user_id, duration }
   * @returns {Promise<Object>}
   */
  async setGroupMemberMute(params) {
    return await this.callApi("set_group_ban", params)
  }

  /**
   * 设置群全员禁言
   * @param {Object} params { group_id, enable }
   * @returns {Promise<Object>}
   */
  async setGroupWholeMute(params) {
    return await this.callApi("set_group_whole_ban", {
      group_id: params.group_id,
      enable: params.enable,
    })
  }

  /**
   * 踢出群成员
   * @param {Object} params { group_id, user_id, reject_add_request }
   * @returns {Promise<Object>}
   */
  async kickGroupMember(params) {
    return await this.callApi("set_group_kick", params)
  }

  /**
   * 退出群聊
   * @param {Object} params { group_id, is_dismiss }
   * @returns {Promise<Object>}
   */
  async quitGroup(params) {
    return await this.callApi("set_group_leave", params)
  }

  /**
   * 处理群加入请求
   * @param {Object} params { flag, sub_type, approve, reason }
   * @returns {Promise<Object>}
   */
  async acceptGroupRequest(params) {
    return await this.callApi("set_group_add_request", {
      ...params,
      approve: true,
    })
  }

  /**
   * 拒绝群加入请求
   * @param {Object} params { flag, sub_type, approve, reason }
   * @returns {Promise<Object>}
   */
  async rejectGroupRequest(params) {
    return await this.callApi("set_group_add_request", {
      ...params,
      approve: false,
    })
  }

  // ==================== 消息API（Milky风格 + 兼容） ====================
  /**
   * 发送私聊消息（Milky风格）
   * @param {Object} params { user_id, message }
   * @returns {Promise<Object>}
   */
  async sendPrivateMessage(params) {
    const user_id = Number(params.user_id)
    const message = this.dealOneBotMsg(params.message)

    const cq = this.#onebotSegmentsToCqCode(message)
    const preferCq = this.#canEncodeAsCq(message) && typeof cq === "string" && cq.trim().length > 0

    let lastErr = null
    let lastRes = null

    const tryOnce = async (action, paramsObj, label) => {
      try {
        const res = await this.callApi(action, paramsObj)
        lastRes = res

        const mid = this.#extractMessageId(res)
        if (mid !== undefined) return { ok: true, res }

        if (this.#shouldFallbackForMissingMessageId(res)) {
          console.warn(
            `[OneBotV11Adapter] ${label} returned without message_id, fallback to next method:`,
            this.#summarizeForLog(res),
          )
          return { ok: false, res }
        }

        // Some implementations don't return message_id; treat as success to avoid duplicated sends.
        console.warn(
          `[OneBotV11Adapter] ${label} returned without message_id, treat as success:`,
          this.#summarizeForLog(res),
        )
        return { ok: true, res }
      } catch (err) {
        lastErr = err
        console.warn(`[OneBotV11Adapter] ${label} failed:`, err?.message || err)
        return { ok: false, err }
      }
    }

    // 优先：CQ字符串（兼容性更好）
    if (preferCq) {
      const r1 = await tryOnce("send_private_msg", { user_id, message: cq }, "send_private_msg(CQ)")
      if (r1.ok) return r1.res
    }

    // 回退：segments数组
    {
      const r2 = await tryOnce(
        "send_private_msg",
        { user_id, message },
        "send_private_msg(segments)",
      )
      if (r2.ok) return r2.res
    }

    // 再回退：send_msg（同样优先 CQ）
    if (preferCq) {
      const r3 = await tryOnce(
        "send_msg",
        { message_type: "private", user_id, message: cq },
        "send_msg(private,CQ)",
      )
      if (r3.ok) return r3.res
    }

    {
      const r4 = await tryOnce(
        "send_msg",
        { message_type: "private", user_id, message },
        "send_msg(private,segments)",
      )
      if (r4.ok) return r4.res
    }

    if (lastErr) throw lastErr
    return lastRes
  }

  /**
   * 发送群聊消息（Milky风格）
   * @param {Object} params { group_id, message }
   * @returns {Promise<Object>}
   */
  async sendGroupMessage(params) {
    const group_id = Number(params.group_id)
    const message = this.dealOneBotMsg(params.message)

    const cq = this.#onebotSegmentsToCqCode(message)
    const preferCq = this.#canEncodeAsCq(message) && typeof cq === "string" && cq.trim().length > 0

    let lastErr = null
    let lastRes = null

    const tryOnce = async (action, paramsObj, label) => {
      try {
        const res = await this.callApi(action, paramsObj)
        lastRes = res

        const mid = this.#extractMessageId(res)
        if (mid !== undefined) return { ok: true, res }

        if (this.#shouldFallbackForMissingMessageId(res)) {
          console.warn(
            `[OneBotV11Adapter] ${label} returned without message_id, fallback to next method:`,
            this.#summarizeForLog(res),
          )
          return { ok: false, res }
        }

        console.warn(
          `[OneBotV11Adapter] ${label} returned without message_id, treat as success:`,
          this.#summarizeForLog(res),
        )
        return { ok: true, res }
      } catch (err) {
        lastErr = err
        console.warn(`[OneBotV11Adapter] ${label} failed:`, err?.message || err)
        return { ok: false, err }
      }
    }

    // 优先：CQ字符串（兼容性更好）
    if (preferCq) {
      const r1 = await tryOnce("send_group_msg", { group_id, message: cq }, "send_group_msg(CQ)")
      if (r1.ok) return r1.res
    }

    // 回退：segments数组
    {
      const r2 = await tryOnce("send_group_msg", { group_id, message }, "send_group_msg(segments)")
      if (r2.ok) return r2.res
    }

    // 再回退：send_msg（同样优先 CQ）
    if (preferCq) {
      const r3 = await tryOnce(
        "send_msg",
        { message_type: "group", group_id, message: cq },
        "send_msg(group,CQ)",
      )
      if (r3.ok) return r3.res
    }

    {
      const r4 = await tryOnce(
        "send_msg",
        { message_type: "group", group_id, message },
        "send_msg(group,segments)",
      )
      if (r4.ok) return r4.res
    }

    if (lastErr) throw lastErr
    return lastRes
  }

  /**
   * 删除消息
   * @param {Object} params { message_id }
   * @returns {Promise<Object>}
   */
  async deleteMessage(params) {
    return await this.callApi("delete_msg", { message_id: params.message_id })
  }

  /**
   * 获取消息
   * @param {Object} params { message_id }
   * @returns {Promise<Object>}
   */
  async getMessage(params) {
    return await this.callApi("get_msg", { message_id: params })
  }

  /**
   * 获取历史消息
   * @param {Object} params { message_type, user_id/group_id, seq, count }
   * @returns {Promise<Object>}
   */
  async getHistoryMessages(params) {
    return await this.callApi("get_msg_history", params)
  }

  /**
   * 标记消息为已读
   * @param {Object} params { message_id }
   * @returns {Promise<Object>}
   */
  async markMessageAsRead(params) {
    return await this.callApi("mark_msg_as_read", { message_id: params.message_id })
  }

  /**
   * 发送合并转发消息
   * @param {Object} params { group_id, messages }
   * @returns {Promise<Object>}
   */
  async sendGroupForwardMsg(params) {
    return await this.callApi("send_group_forward_msg", params)
  }

  /**
   * 发送合并私聊转发消息
   * @param {Object} params { user_id, messages }
   * @returns {Promise<Object>}
   */
  async sendPrivateForwardMsg(params) {
    return await this.callApi("send_private_forward_msg", params)
  }

  // ==================== 文件API（Milky风格） ====================
  /**
   * 获取群文件系统信息
   * @param {Object} params { group_id }
   * @returns {Promise<Object>}
   */
  async getGroupFileSystemInfo(params) {
    return await this.callApi("get_group_file_system_info", { group_id: params.group_id })
  }

  /**
   * 获取群根目录文件列表
   * @param {Object} params { group_id }
   * @returns {Promise<Object>}
   */
  async getGroupRootFiles(params) {
    return await this.callApi("get_group_root_files", { group_id: params.group_id })
  }

  /**
   * 获取群文件下载链接
   * @param {Object} params { group_id, file_id, busid }
   * @returns {Promise<Object>}
   */
  async getGroupFileDownloadUrl(params) {
    return await this.callApi("get_group_file_url", params)
  }

  // ==================== 事件监听（Milky风格） ====================
  /**
   * 监听事件
   * @param {String} eventType 事件类型
   * @param {Function} listener 事件处理器
   */
  on(eventType, listener) {
    this.eventEmitter.on(eventType, listener)
  }

  /**
   * 一次性监听事件
   * @param {String} eventType 事件类型
   * @param {Function} listener 事件处理器
   */
  once(eventType, listener) {
    this.eventEmitter.once(eventType, listener)
  }

  /**
   * 移除事件监听器
   * @param {String} eventType 事件类型
   * @param {Function} listener 事件处理器
   */
  off(eventType, listener) {
    this.eventEmitter.off(eventType, listener)
  }

  /**
   * 等待客户端连接（用于替代固定延迟 setTimeout）
   * @param {Object} options
   * @param {number} options.timeoutMs
   */
  async waitUntilConnected({ timeoutMs = 60000 } = {}) {
    if (this.isConnected) return true

    return await new Promise((resolve, reject) => {
      const onConnect = () => {
        cleanup()
        resolve(true)
      }

      const timer = setTimeout(() => {
        cleanup()
        reject(new Error(`[OneBotV11Adapter] waitUntilConnected timeout after ${timeoutMs}ms`))
      }, timeoutMs)

      const cleanup = () => {
        clearTimeout(timer)
        this.eventEmitter.off("connect", onConnect)
      }

      this.eventEmitter.once("connect", onConnect)
    })
  }

  // ==================== 兼容性方法（适配Milky风格） ====================
  /**
   * 通用发送消息（兼容Milky的sendMsg）
   * @param {String|Object} target 目标（用户ID/群对象）
   * @param {String|Array} message 消息内容
   * @returns {Promise<Object>}
   */
  async sendMsg(target, message) {
    if (message?.message) message = message.message
    if (typeof target === "string" || typeof target === "number") {
      // 私聊消息
      if (Array.isArray(message) && message.find(i => i.type == "node")) {
        delete message[0].uin
        delete message[0].name
        return await this.sendPrivateForwardMsg({
          user_id: Number(target),
          messages: message,
        })
      }
      return await this.sendPrivateMessage({
        user_id: Number(target),
        message: message,
      })
    } else if (target.group_id) {
      //

      if (Array.isArray(message) && message.find(i => i.type == "node")) {
        return await this.sendGroupForwardMsg({
          group_id: Number(target.group_id),
          messages: message,
        })
      }
      return await this.sendGroupMessage({
        group_id: Number(target.group_id),
        message: message,
      })
    }
    throw new Error("无效的消息目标格式")
  }

  /**
   * 消息格式转换（适配OneBot V11）
   * @param {String|Array} msg 原始消息
   * @returns {String|Array} 转换后的消息
   */
  dealOneBotMsg(msg) {
    if (typeof msg === "string") {
      return msg
    }
    if (!Array.isArray(msg)) msg = [msg]
    if (Array.isArray(msg)) {
      return msg.map(item => {
        if (typeof item === "string") {
          return { type: "text", data: { text: item } }
        }
        switch (item.type) {
          case "image":
            return this.#normalizeOutgoingMediaSegment(item, "image")
          case "record":
            return this.#normalizeOutgoingMediaSegment(item, "record")
          case "video":
            return this.#normalizeOutgoingMediaSegment(item, "video")
          case "file":
            return this.#normalizeOutgoingMediaSegment(item, "file")
          default:
            return item
        }
      })
    }
    return msg
  }

  /**
   * 兼容pickUser方法
   * @param {Number|String} userId 用户ID
   * @returns {Object} 包含sendMsg的对象
   */
  pickUser(userId) {
    return {
      sendMsg: async message => {
        return await this.sendPrivateMessage({
          user_id: Number(userId),
          message: message,
        })
      },
    }
  }

  /**
   * 兼容pickGroup方法
   * @param {Number|String} groupId 群ID
   * @returns {Object} 包含sendMsg的对象
   */
  pickGroup(groupId) {
    return {
      sendMsg: async message => {
        return await this.sendGroupMessage({
          group_id: Number(groupId),
          message: message,
        })
      },
    }
  }

  /**
   * 构造OneBot V11 转发消息格式（修正只处理第一条的逻辑）
   * @param {Array} msg 原始消息列表
   * @returns {Array} 标准化转发消息格式
   */
  makeForwardMsg(msg) {
    if (!Array.isArray(msg) || msg.length === 0) {
      console.warn("[OneBotV11Adapter] 构造转发消息失败：消息列表为空")
      return []
    }

    // 遍历所有消息并统一转换为 OneBotV11 节点（兼容 UniversalMessage/通用段/原生段）
    // 旧实现把所有段压进一个 node，容易超长/超时；这里按“每条消息一个 node”生成。
    const nodes = []
    for (const item of msg) {
      if (!item) continue

      const uinRaw = item.user_id ?? item.uin ?? item.qq ?? msg[0]?.user_id
      const nameRaw = item.nickname ?? item.name ?? item.sender_name ?? msg[0]?.nickname ?? "用户"
      const uin = Number(uinRaw)
      const nodeUin = Number.isFinite(uin) ? uin : String(uinRaw || "")
      const nodeName = String(nameRaw || "")

      const content = item.message ?? item.content ?? item
      const universal = coerceToUniversalMessage(content)
      const segments = this.dealOneBotMsg(universal.convertTo("onebotv11"))

      nodes.push({
        type: "node",
        data: {
          uin: nodeUin,
          name: nodeName,
          content: segments,
        },
      })
    }

    return nodes
  }

  // ==================== 资源清理（Milky风格） ====================
  /**
   * 释放资源
   */
  dispose() {
    // 关闭WS服务端
    if (this.wss) {
      this.wss.close()
      this.wss = null
    }
    // 清理客户端连接
    if (this.client) {
      this.client.close()
      this.client = null
    }
    // 清理事件监听器
    this.eventEmitter.removeAllListeners()
    // 清理待处理请求
    this.requests.clear()
    this.isConnected = false
    console.log("✅ OneBot V11适配器资源已释放")
  }

  /**
   * 符号化清理（兼容ES6 Disposable）
   */
  [Symbol.dispose]() {
    this.dispose()
  }
}

// 导出适配器类（可按需初始化）
export { resolveOnebotMediaTarget }
export default OneBotV11Adapter
