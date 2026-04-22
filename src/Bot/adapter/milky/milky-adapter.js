import { MilkyClient } from "@saltify/milky-node-sdk"
// 导入通用消息类型（用于兼容判断）
import { UniversalMessage, UniversalSegmentType } from "../../message/universal-message.js"

function normalizeMilkyApiName(name) {
  if (name === undefined || name === null) return ""
  let out = String(name).trim()
  while (out.startsWith("/")) out = out.slice(1)
  if (out.startsWith("api/")) out = out.slice("api/".length)
  return out
}

/**
 * Milky标准的QQ机器人适配器
 * 适配通用消息转换体系，完整实现milky标准API，兼容ICQQ插件
 */
class MilkyAdapter {
  constructor(config = {}) {
    this.config = {
      authority: config.authority || "localhost:8080",
      basePath: config.basePath || "/",
      accessToken: config.accessToken,
      useTLS: config.useTLS || false,
      useSSE: config.useSSE || false,
      ...config,
    }

    this.client = new MilkyClient(
      this.config.authority,
      this.config.basePath,
      this.config.accessToken,
      this.config.useTLS,
      this.config.useSSE,
    )

    console.log("[MilkyAdapter] 客户端初始化完成:", this.client)

    // 维护事件监听器列表（修复on/off/once方法）
    this.eventListeners = new Map()
    // 标识适配器类型
    this.adapterType = "milky"
  }

  /**
   * 设置事件处理器（可选，保持原有逻辑）
   */
  setupEventHandlers() {
    const eventTypeMap = {
      message_receive: "消息接收事件",
      message_recall: "消息撤回事件",
      friend_request: "好友请求事件",
      group_join_request: "加群请求事件",
      group_invited_join_request: "邀请入群请求事件",
      group_invitation: "他人邀请自身入群事件",
      friend_nudge: "好友戳一戳事件",
      friend_file_upload: "好友文件上传事件",
      group_admin_change: "群管理员变更事件",
      group_essence_message_change: "群精华消息变更事件",
      group_member_increase: "群成员增加事件",
      group_member_decrease: "群成员减少事件",
      group_name_change: "群名称变更事件",
      group_message_reaction: "群消息表情回应事件",
      group_mute: "群禁言事件",
      group_whole_mute: "群全员禁言事件",
      group_nudge: "群戳一戳事件",
      group_file_upload: "群文件上传事件",
    }

    Object.keys(eventTypeMap).forEach(eventType => {
      this.on(eventType, data => {
        const eventName = eventTypeMap[eventType] || eventType
        console.log(`[MilkyAdapter] 接收到事件: ${eventName}`, data)
      })
    })
  }

  /**
   * 系统API（保持原有逻辑，补充错误处理）
   */
  async callApi(apiName, input = {}) {
    const normalizedName = normalizeMilkyApiName(apiName)
    if (!normalizedName) throw new Error("[MilkyAdapter] callApi requires apiName")

    try {
      const result = await this.client.callApi(normalizedName, input)
      logger.debug(`[MilkyAdapter] 调用API ${normalizedName} 成功:`, result)
      return result
    } catch (error) {
      console.error(`[MilkyAdapter] 调用API ${normalizedName} 失败:`, error)
      throw error // 抛出错误，让上层处理
    }
  }

  /**
   * 兼容：sendApi(action, params)（与文档路径写法一致）
   * - 支持 "/api/get_login_info" / "api/get_login_info" / "get_login_info"
   */
  async sendApi(action, input = {}) {
    return await this.callApi(action, input)
  }

  // ========== 系统/好友/群聊API（保持原有逻辑，仅补充错误处理） ==========
  async getLoginInfo() {
    return await this.callApi("get_login_info")
  }
  async getImplInfo() {
    return await this.callApi("get_impl_info")
  }
  async getUserProfile(input) {
    return await this.callApi("get_user_profile", input)
  }
  async getFriendList(input) {
    return await this.callApi("get_friend_list", input)
  }
  async getFriendInfo(input) {
    return await this.callApi("get_friend_info", input)
  }
  async sendFriendNudge(input) {
    return await this.callApi("send_friend_nudge", input)
  }
  async sendProfileLike(input) {
    return await this.callApi("send_profile_like", input)
  }
  async getFriendRequests(input) {
    return await this.callApi("get_friend_requests", input)
  }
  async acceptFriendRequest(input) {
    return await this.callApi("accept_friend_request", input)
  }
  async rejectFriendRequest(input) {
    return await this.callApi("reject_friend_request", input)
  }
  async getGroupList(input) {
    return await this.callApi("get_group_list", input)
  }
  async getGroupInfo(input) {
    return await this.callApi("get_group_info", input)
  }
  async getGroupMemberList(input) {
    return await this.callApi("get_group_member_list", input)
  }
  async getGroupMemberInfo(input) {
    return await this.callApi("get_group_member_info", input)
  }
  async setGroupName(input) {
    return await this.callApi("set_group_name", input)
  }
  async setGroupAvatar(input) {
    return await this.callApi("set_group_avatar", input)
  }
  async setGroupMemberCard(input) {
    return await this.callApi("set_group_member_card", input)
  }
  async setGroupMemberSpecialTitle(input) {
    return await this.callApi("set_group_member_special_title", input)
  }
  async setGroupMemberAdmin(input) {
    return await this.callApi("set_group_member_admin", input)
  }
  async setGroupMemberMute(input) {
    return await this.callApi("set_group_member_mute", input)
  }
  async setGroupWholeMute(input) {
    return await this.callApi("set_group_whole_mute", input)
  }
  async kickGroupMember(input) {
    return await this.callApi("kick_group_member", input)
  }
  async sendGroupNudge(input) {
    return await this.callApi("send_group_nudge", input)
  }
  async quitGroup(input) {
    return await this.callApi("quit_group", input)
  }
  async getGroupAnnouncements(input) {
    return await this.callApi("get_group_announcements", input)
  }
  async sendGroupAnnouncement(input) {
    return await this.callApi("send_group_announcement", input)
  }
  async deleteGroupAnnouncement(input) {
    return await this.callApi("delete_group_announcement", input)
  }
  async getGroupEssenceMessages(input) {
    return await this.callApi("get_group_essence_messages", input)
  }
  async setGroupEssenceMessage(input) {
    return await this.callApi("set_group_essence_message", input)
  }
  async sendGroupMessageReaction(input) {
    const payload = { ...(input || {}) }

    // milky-types: reaction 为 string，兼容外部传 emoji_id
    const reactionRaw = payload.reaction ?? payload.emoji_id ?? payload.emojiId
    if (reactionRaw !== undefined && reactionRaw !== null && reactionRaw !== "") {
      payload.reaction = String(reactionRaw)
    }

    // 默认添加表情
    if (payload.is_add === undefined && payload.isAdd === undefined) {
      payload.is_add = true
    } else if (payload.is_add === undefined && payload.isAdd !== undefined) {
      payload.is_add = Boolean(payload.isAdd)
    }

    delete payload.emoji_id
    delete payload.emojiId
    delete payload.isAdd

    try {
      const result = await this.client.callApi("send_group_message_reaction", payload)
      console.debug(`[MilkyAdapter] 调用API send_group_message_reaction 成功:`, result)
      return result
    } catch (err) {
      const msg = err?.message || String(err)

      // idempotent behavior: treat "already set" / "not set" as success
      if (payload.is_add === true && /已经设置过该表情/.test(msg)) return {}
      if (payload.is_add === false && /(未设置过该表情|没有设置过该表情)/.test(msg)) return {}

      console.error(`[MilkyAdapter] 调用API send_group_message_reaction 失败:`, err)
      throw err
    }
  }
  async getGroupNotifications(input) {
    return await this.callApi("get_group_notifications", input)
  }
  async acceptGroupRequest(input) {
    return await this.callApi("accept_group_request", input)
  }
  async rejectGroupRequest(input) {
    return await this.callApi("reject_group_request", input)
  }
  async acceptGroupInvitation(input) {
    return await this.callApi("accept_group_invitation", input)
  }
  async rejectGroupInvitation(input) {
    return await this.callApi("reject_group_invitation", input)
  }
  async sendPrivateMessage(input) {
    return await this.callApi("send_private_message", input)
  }
  async sendGroupMessage(input) {
    return await this.callApi("send_group_message", input)
  }
  async recallPrivateMessage(input) {
    return await this.callApi("recall_private_message", input)
  }
  async recallGroupMessage(input) {
    return await this.callApi("recall_group_message", input)
  }
  async getMessage(input) {
    return await this.callApi("get_message", input)
  }
  async getHistoryMessages(input) {
    return await this.callApi("get_history_messages", input)
  }
  async markMessageAsRead(input) {
    return await this.callApi("mark_message_as_read", input)
  }
  async getResourceTempUrl(input) {
    return await this.callApi("get_resource_temp_url", input)
  }
  async getForwardedMessages(input) {
    return await this.callApi("get_forwarded_messages", input)
  }
  async uploadPrivateFile(input) {
    return await this.callApi("upload_private_file", input)
  }
  async uploadGroupFile(input) {
    return await this.callApi("upload_group_file", input)
  }
  async getPrivateFileDownloadUrl(input) {
    return await this.callApi("get_private_file_download_url", input)
  }
  async getGroupFileDownloadUrl(input) {
    return await this.callApi("get_group_file_download_url", input)
  }
  async getGroupFiles(input) {
    return await this.callApi("get_group_files", input)
  }
  async moveGroupFile(input) {
    return await this.callApi("move_group_file", input)
  }
  async renameGroupFile(input) {
    return await this.callApi("rename_group_file", input)
  }
  async deleteGroupFile(input) {
    return await this.callApi("delete_group_file", input)
  }
  async createGroupFolder(input) {
    return await this.callApi("create_group_folder", input)
  }
  async renameGroupFolder(input) {
    return await this.callApi("rename_group_folder", input)
  }
  async deleteGroupFolder(input) {
    return await this.callApi("delete_group_folder", input)
  }
  async getCookies(input) {
    return await this.callApi("get_cookies", input)
  }
  async getCSRFToken() {
    return await this.callApi("get_csrf_token")
  }

  /**
   * 修复事件监听方法（核心修改）
   */
  on(eventType, listener) {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set())
      // 绑定到Milky客户端
      this.client.onEvent(eventType, data => {
        this.eventListeners.get(eventType).forEach(cb => cb(data))
      })
    }
    this.eventListeners.get(eventType).add(listener)
    console.log(
      `[MilkyAdapter] 绑定事件监听器: ${eventType}, 总数: ${this.eventListeners.get(eventType).size}`,
    )
  }

  once(eventType, listener) {
    const onceListener = data => {
      listener(data)
      this.off(eventType, onceListener) // 执行后移除
    }
    this.on(eventType, onceListener)
  }

  off(eventType, listener) {
    if (this.eventListeners.has(eventType)) {
      this.eventListeners.get(eventType).delete(listener)
      console.log(
        `[MilkyAdapter] 移除事件监听器: ${eventType}, 剩余: ${this.eventListeners.get(eventType).size}`,
      )
    }
  }

  /**
   * 核心适配：处理消息格式转换（兼容通用消息段）
   * @param {Object} msg 原始消息段（通用格式/ICQQ格式/Milky格式）
   * @returns {Object} Milky标准格式消息段
   */
  dealMilkyMsg(msg) {
    console.debug("[MilkyAdapter] 处理消息段:", msg)

    if (msg === undefined || msg === null) {
      return { type: "text", data: { text: "" } }
    }

    if (typeof msg === "number" || typeof msg === "bigint" || typeof msg === "boolean") {
      return { type: "text", data: { text: String(msg) } }
    }

    const toMilkyUri = input => {
      if (input === undefined || input === null) return ""
      const raw = String(input).trim()
      if (!raw) return ""

      // Already supported forms
      if (/^(https?:\/\/|file:\/\/|base64:\/\/)/i.test(raw)) return raw

      // Windows absolute path (C:\ or C:/)
      if (/^[a-zA-Z]:[\\/]/.test(raw)) {
        return `file:///${raw.replace(/\\/g, "/")}`
      }

      // UNC path (\\server\share\...)
      if (raw.startsWith("\\\\")) {
        return `file://${raw.replace(/\\/g, "/")}`
      }

      // POSIX absolute path
      if (raw.startsWith("/")) {
        return `file://${raw}`
      }

      return raw
    }

    const isSupportedMilkyUri = uri => {
      if (!uri) return false
      const s = String(uri).trim().toLowerCase()
      return s.startsWith("http://") || s.startsWith("https://") || s.startsWith("file://") || s.startsWith("base64://")
    }

    // 1. 字符串直接转为文本段
    if (typeof msg === "string") {
      return { type: "text", data: { text: msg } }
    }

    // 1.5 若已经是 milky 段，补齐关键字段类型（避免 user_id/message_seq 为 string 导致 API -400）
    if (msg && typeof msg === "object") {
      if (msg.type === "mention") {
        const raw = msg?.data?.user_id ?? msg?.data?.uin ?? msg?.data?.qq
        const uid = Number(raw)
        if (Number.isFinite(uid) && uid > 0) {
          return { ...msg, data: { ...(msg.data || {}), user_id: uid } }
        }
      }
      if (msg.type === "reply") {
        const raw = msg?.data?.message_seq ?? msg?.data?.seq ?? msg?.data?.id
        const seq = Number(raw)
        if (Number.isFinite(seq) && seq > 0) {
          return { ...msg, data: { ...(msg.data || {}), message_seq: seq } }
        }
      }
    }

    // 2. 通用消息段转换为Milky格式
    if (msg.type && Object.values(UniversalSegmentType).includes(msg.type)) {
      switch (msg.type) {
        case UniversalSegmentType.TEXT:
          return {
            type: "text",
            data: { text: msg?.data?.content ?? msg?.data?.text ?? msg?.text ?? msg?.content ?? "" },
          }

        case UniversalSegmentType.EMOJI: // 通用face类型
          {
            const faceId = msg?.data?.id ?? msg?.id ?? msg?.data?.face_id ?? msg?.data?.faceId ?? undefined
            const faceIdStr = faceId !== undefined && faceId !== null ? String(faceId) : ""
            if (!faceIdStr) return { type: "text", data: { text: "" } }
            return { type: "face", data: { face_id: faceIdStr } }
          }

        case UniversalSegmentType.IMAGE: // 通用图片类型
          {
            // Prefer URL/temp_url first (Milky only supports http(s)/file/base64 schemes for uri).
            // Avoid using resource_id (fileId) as uri, otherwise Milky returns "Unsupported URI scheme".
            const rawInput =
              msg?.data?.url ??
              msg?.url ??
              msg?.data?.uri ??
              msg?.uri ??
              msg?.data?.temp_url ??
              msg?.data?.tempUrl ??
              msg?.temp_url ??
              msg?.tempUrl ??
              msg?.data?.path ??
              msg?.path ??
              msg?.data?.file ??
              msg?.file ??
              msg?.data?.fileId ??
              msg?.fileId ??
              msg?.data?.resource_id ??
              msg?.resource_id ??
              msg?.data?.resourceId ??
              msg?.resourceId ??
              ""

            const uri = toMilkyUri(rawInput)

            if (!uri) {
              const fallback = msg?.data?.summary ?? msg?.summary ?? "[图片]"
              return { type: "text", data: { text: String(fallback || "") } }
            }

            if (!isSupportedMilkyUri(uri)) {
              const fallback = msg?.data?.summary ?? msg?.summary ?? "[图片]"
              return { type: "text", data: { text: String(fallback || "") } }
            }

            const summaryRaw = msg?.data?.summary ?? msg?.summary
            const summary = summaryRaw !== undefined && summaryRaw !== null && String(summaryRaw).trim()
              ? String(summaryRaw)
              : undefined

            let subTypeRaw =
              msg?.data?.sub_type ?? msg?.data?.subType ?? msg?.sub_type ?? msg?.subType ?? undefined

            if (!subTypeRaw && summary) {
              if (summary.includes("动画表情")) subTypeRaw = "sticker"
            }

            const sub_type = subTypeRaw ? String(subTypeRaw).toLowerCase() : undefined
            const normalizedSubType = sub_type === "normal" || sub_type === "sticker" ? sub_type : undefined

            const data = {
              uri,
              ...(normalizedSubType ? { sub_type: normalizedSubType } : {}),
              ...(summary ? { summary } : {}),
            }

            return { type: "image", data }
          }

        case UniversalSegmentType.VOICE: // 通用语音类型（record）
          {
            const rawInput =
              msg?.data?.url ??
              msg?.url ??
              msg?.data?.uri ??
              msg?.uri ??
              msg?.data?.path ??
              msg?.path ??
              msg?.data?.file ??
              msg?.file ??
              msg?.data?.fileId ??
              msg?.fileId ??
              ""
            const uri = toMilkyUri(rawInput)
            if (!uri || !isSupportedMilkyUri(uri)) return { type: "text", data: { text: "[语音]" } }
            return { type: "record", data: { uri } }
          }

        case UniversalSegmentType.VIDEO: // 通用视频类型
          {
            const rawInput =
              msg?.data?.url ??
              msg?.url ??
              msg?.data?.uri ??
              msg?.uri ??
              msg?.data?.path ??
              msg?.path ??
              msg?.data?.file ??
              msg?.file ??
              msg?.data?.fileId ??
              msg?.fileId ??
              ""
            const uri = toMilkyUri(rawInput)
            if (!uri || !isSupportedMilkyUri(uri)) return { type: "text", data: { text: "[视频]" } }
            return { type: "video", data: { uri } }
          }

        case UniversalSegmentType.FILE: // 通用文件类型
          {
            const rawInput =
              msg?.data?.url ??
              msg?.url ??
              msg?.data?.uri ??
              msg?.uri ??
              msg?.data?.path ??
              msg?.path ??
              msg?.data?.file ??
              msg?.file ??
              msg?.data?.fileId ??
              msg?.fileId ??
              ""
            const uri = toMilkyUri(rawInput)
            if (!uri || !isSupportedMilkyUri(uri)) {
              const name = msg?.data?.name ?? msg?.name ?? ""
              return { type: "text", data: { text: name ? `[文件] ${name}` : "[文件]" } }
            }
            const name = msg?.data?.name ?? msg?.name ?? ""
            return { type: "file", data: { uri, ...(name ? { name } : {}) } }
          }

        case UniversalSegmentType.MENTION: // 通用@某人类型
          {
            const raw = msg?.data?.target ?? msg?.qq ?? ""
            const uid = Number(raw)
            if (!Number.isFinite(uid) || uid <= 0) {
              return { type: "text", data: { text: raw ? `@${raw}` : "" } }
            }
            return { type: "mention", data: { user_id: uid } }
          }

        case UniversalSegmentType.MENTION_ALL: // 通用@全体类型
          return { type: "mention_all", data: {} }

        case UniversalSegmentType.REPLY: // 通用回复类型
          {
            const rawSeq = msg?.data?.seq ?? msg?.seq ?? msg?.data?.id ?? msg?.id ?? ""
            const seq = Number(rawSeq)
            return Number.isFinite(seq) && seq > 0
              ? { type: "reply", data: { message_seq: seq } }
              : { type: "text", data: { text: "" } }
          }

        default:
          // 其他通用类型直接透传
          return { type: msg.type, data: { ...msg.data } }
      }
    }

    // 3. 兼容原有ICQQ格式
    switch (msg.type) {
      case "text":
        return { type: "text", data: { text: msg?.data?.text || msg?.text || "" } }

      case "image":
        return {
          type: "image",
          data: {
            uri: msg?.file || msg?.data?.uri || msg?.data?.temp_url || "",
            sub_type: "normal",
            summary: msg.summary,
          },
        }

      case "record":
        return {
          type: "record",
          data: { uri: msg?.file || msg?.data?.uri || "" },
        }

      case "face":
        return {
          type: "face",
          data: { face_id: `${msg?.id || msg?.data?.face_id}` },
        }

      case "video":
        return {
          type: "video",
          data: { uri: msg?.file ? "file://" + msg.file : "" },
        }

      case "file":
        return {
          type: "file",
          data: { uri: msg?.file || "", name: msg?.name || "" },
        }

      default:
        return msg // 未知类型透传
    }
  }

  /**
   * 兼容sendMsg方法（核心修改：支持通用消息）
   * @param {string/Object} target 接收者（用户ID/群对象）
   * @param {string/Array/UniversalMessage} message 消息内容
   * @returns {Promise<Object>} 发送结果
   */
  async sendMsg(target, message) {
    console.log("[MilkyAdapter] 发送消息:", { target, message })

    // 1. 如果是UniversalMessage实例，先转换为Milky格式数组
    if (message instanceof UniversalMessage) {
      message = message.convertTo("milky")
    }

    // 2. 私聊消息（target为字符串/数字）
    if (typeof target === "string" || typeof target === "number") {
      const userId = Number(target)
      if (isNaN(userId)) {
        throw new Error(`[MilkyAdapter] 私聊用户ID格式错误: ${target}`)
      }
      const msgSegments = Array.isArray(message)
        ? message.map(i => this.dealMilkyMsg(i))
        : [this.dealMilkyMsg(message)]

      return await this.sendPrivateMessage({
        user_id: userId,
        message: msgSegments,
      })
    }

    // 3. 群聊消息（target含group_id）
    else if (target?.group_id) {
      const groupId = Number(target.group_id)
      if (isNaN(groupId)) {
        throw new Error(`[MilkyAdapter] 群ID格式错误: ${target.group_id}`)
      }

      // 处理消息段
      const msgSegments = Array.isArray(message)
        ? message.map(i => this.dealMilkyMsg(i))
        : typeof message === "string"
          ? [{ type: "text", data: { text: message } }]
          : [this.dealMilkyMsg(message)]

      // 单独发送文件
      const fileSeg = msgSegments.find(item => item.type === "file")
      if (msgSegments.length === 1 && fileSeg) {
        return await this.uploadGroupFile({
          group_id: groupId,
          file_uri: fileSeg.data.uri,
          file_name: fileSeg.data.name || "未命名文件",
        })
      }

      // 发送群消息
      const result = await this.sendGroupMessage({
        group_id: groupId,
        message: msgSegments,
      })
      return { seq: result.message_seq, time: result.time }
    }

    throw new Error(`[MilkyAdapter] 无效的发送目标: ${JSON.stringify(target)}`)
  }

  /**
   * 兼容pickUser方法（补充错误处理）
   */
  pickUser(userId) {
    const uid = Number(userId)
    if (isNaN(uid)) {
      throw new Error(`[MilkyAdapter] 用户ID格式错误: ${userId}`)
    }
    return {
      sendMsg: async message => {
        const msgSegments = Array.isArray(message)
          ? message.map(i => this.dealMilkyMsg(i))
          : [this.dealMilkyMsg(message)]
        return await this.sendPrivateMessage({ user_id: uid, message: msgSegments })
      },
    }
  }

  /**
   * 兼容pickGroup方法（补充错误处理）
   */
  pickGroup(groupId) {
    const gid = Number(groupId)
    if (isNaN(gid)) {
      throw new Error(`[MilkyAdapter] 群ID格式错误: ${groupId}`)
    }
    return {
      sendMsg: async message => {
        const msgSegments = Array.isArray(message)
          ? message.map(i => this.dealMilkyMsg(i))
          : [this.dealMilkyMsg(message)]
        return await this.sendGroupMessage({ group_id: gid, message: msgSegments })
      },
    }
  }

  /**
   * 适配通用消息的转发消息方法
   * @param {Array} forwardMsg 转发消息列表（兼容通用消息段）
   * @returns {Array} Milky格式转发消息段
   */
  async makeForwardMsg(forwardMsg) {
    console.log("[MilkyAdapter] 构建转发消息:", forwardMsg)

    const list = Array.isArray(forwardMsg) ? forwardMsg : forwardMsg ? [forwardMsg] : []
    const tempUrlCache = new Map()
    const isQqNtMediaUrl = input => {
      if (input === undefined || input === null) return false
      const raw = String(input).trim()
      return /^https:\/\/multimedia\.nt\.qq\.com\.cn\//i.test(raw)
    }
    const isDirectMediaUri = input => {
      if (input === undefined || input === null) return false
      const raw = String(input).trim()
      if (!raw) return false
      return /^(https?:\/\/|file:\/\/|base64:\/\/)/i.test(raw) || /^[a-zA-Z]:[\\/]/.test(raw)
    }

    const toResourceId = seg => {
      if (!seg || typeof seg !== "object") return ""
      const data = seg.data && typeof seg.data === "object" ? seg.data : null
      const raw =
        data?.resource_id ??
        data?.resourceId ??
        seg.resource_id ??
        seg.resourceId ??
        data?.file_id ??
        data?.fileId ??
        seg.file_id ??
        seg.fileId ??
        ""
      return raw !== undefined && raw !== null ? String(raw).trim() : ""
    }

    const toForwardSegment = async input => {
      const seg = input
      if (!seg || typeof seg !== "object") return this.dealMilkyMsg(seg)

      const type = String(seg.type || "").toLowerCase()
      if (type !== "image") return this.dealMilkyMsg(seg)

      const resource_id = toResourceId(seg)

      const data = seg.data && typeof seg.data === "object" ? seg.data : {}
      const directUriRaw =
        data?.url ??
        seg?.url ??
        data?.uri ??
        seg?.uri ??
        data?.temp_url ??
        seg?.temp_url ??
        data?.tempUrl ??
        seg?.tempUrl ??
        data?.path ??
        seg?.path ??
        data?.file ??
        seg?.file ??
        ""
      const preferResourceTempUrl = Boolean(resource_id) && isQqNtMediaUrl(directUriRaw)

      if (isDirectMediaUri(directUriRaw) && !preferResourceTempUrl) {
        return this.dealMilkyMsg({
          ...seg,
          data: {
            ...data,
            url: directUriRaw,
            uri: directUriRaw,
            temp_url: directUriRaw,
            tempUrl: directUriRaw,
          },
        })
      }

      if (!resource_id) return this.dealMilkyMsg(seg)

      let url = tempUrlCache.get(resource_id) || ""
      if (!url) {
        try {
          const res = await this.callApi("get_resource_temp_url", { resource_id })
          const nextUrl = res?.url !== undefined && res?.url !== null ? String(res.url).trim() : ""
          if (nextUrl) {
            url = nextUrl
            tempUrlCache.set(resource_id, url)
          }
        } catch (err) {
          console.warn(
            "[MilkyAdapter] get_resource_temp_url failed, fallback to original temp_url:",
            err?.message || err,
          )
        }
      }

      if (!url && isDirectMediaUri(directUriRaw)) {
        url = directUriRaw
      }
      if (!url) return this.dealMilkyMsg(seg)

      const patched = {
        ...seg,
        data: {
          ...data,
          // unify possible fields so dealMilkyMsg can pick it up safely
          url,
          uri: url,
          temp_url: url,
          tempUrl: url,
        },
      }

      return this.dealMilkyMsg(patched)
    }

    const fallbackUserIdRaw = this.loginInfo?.uin ?? this.loginInfo?.user_id ?? globalThis.Bot?.uin ?? 10001
    const fallbackUserId = Number(fallbackUserIdRaw)
    const safeFallbackUserId = Number.isFinite(fallbackUserId) && fallbackUserId >= 10001 ? fallbackUserId : 10001

    return [
      {
        type: "forward",
        data: {
          messages: await Promise.all(list.map(async item => {
            const uidRaw = item?.user_id ?? item?.uin ?? item?.sender_id ?? item?.id
            const uid = Number(uidRaw)
            const user_id = Number.isFinite(uid) && uid >= 10001 ? uid : safeFallbackUserId

            const sender_name = String(item?.nickname ?? item?.sender_name ?? item?.name ?? "未知发送者")

            const content = item?.message ?? item?.content ?? item?.segments ?? item
            const rawSegs = Array.isArray(content) ? content : [content]
            const filtered = rawSegs.filter(v => v !== undefined && v !== null)

            const segments =
              filtered.length > 0
                ? await Promise.all(
                    filtered.map(async i => {
                      try {
                        return await toForwardSegment(i)
                      } catch (err) {
                        console.warn("[MilkyAdapter] 转发段转换失败，已降级为文本:", err?.message || err)
                        return { type: "text", data: { text: String(i ?? "") } }
                      }
                    }),
                  )
                : [{ type: "text", data: { text: "" } }]

            return { user_id, sender_name, segments }
          })),
        },
      },
    ]
  }

  /**
   * 资源清理（修复eventEmitter未定义问题）
   */
  dispose() {
    try {
      this.client.dispose()
      // 清空事件监听器
      this.eventListeners.clear()
      console.log("[MilkyAdapter] 资源已释放")
    } catch (error) {
      console.error("[MilkyAdapter] 释放资源失败:", error)
    }
  }

  [Symbol.dispose]() {
    this.dispose()
  }
}

export default MilkyAdapter

