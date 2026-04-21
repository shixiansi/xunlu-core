import LLoneBot from "../index.js"
import MilkyAdapter from "../milky-adapter.js"
import config from "../../../lib/config.js"
import MessageDB from "../../../db/MessageDB.js"
import { startControlServer } from "../../../lib/controlServer.js"
import { startWebuiServer } from "../../../lib/webuiServer.js"
import { simulateIncomingMessage } from "../../message/cli-simulator.js"
import { applyUniversalBotApi } from "../../api/universal-bot-api.js"
import {
  UniversalMessage,
} from "../../message/universal-message.js"
import {
  createMilkyBinding,
  preprocessMilkySegments,
  safeConvertMilkyToUniversal,
} from "../../../runtime/drivers/milky-binding.js"

function findForwardMetaInRecord(record, forwardId) {
  const target = String(forwardId || "").trim()
  if (!target) return null

  const visit = (input, visited = new Set()) => {
    if (input === undefined || input === null || typeof input !== "object") return null
    if (visited.has(input)) return null
    visited.add(input)

    if (Array.isArray(input)) {
      for (const item of input) {
        const found = visit(item, visited)
        if (found) return found
      }
      return null
    }

    const type = String(input?.type || "").toLowerCase()
    const data = input?.data && typeof input.data === "object" ? input.data : {}
    const candidate =
      data.forward_id ?? data.id ?? data.resid ?? input.forward_id ?? input.id ?? input.resid ?? ""
    if (["forward", "multimsg", "long_msg"].includes(type) && String(candidate).trim() === target) {
      return {
        forward_id: target,
        title: data.title || input.title || "",
        summary: data.summary || input.summary || "",
        preview: data.preview || input.preview || [],
      }
    }

    for (const next of [input.data, input.message, input.messages, input.content, input.segments, input.universal_message]) {
      const found = visit(next, visited)
      if (found) return found
    }

    return null
  }

  return visit(record)
}

/**
 * LLoneBot事件监听处理类
 * 修复forward消息段：保留元数据+最小化满足校验，支持获取具体转发内容
 */
export default class LLoneBotEventListener {
  static EVENT_TYPE_MAP = {
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

  static SUB_TYPE_MAP = {
    message_recall: "recall",
    friend_request: "friend",
    group_join_request: "add",
    group_invited_join_request: "invite",
    group_invitation: "invited",
    friend_nudge: "poke",
    friend_file_upload: "upload",
    group_admin_change: "admin",
    group_essence_message_change: "update",
    group_member_increase: "increase",
    group_member_decrease: "decrease",
    group_name_change: "rename",
    group_message_reaction: "emoji",
    group_mute: "ban",
    group_whole_mute: "allban",
    group_nudge: "poke",
    group_file_upload: "upload",
  }

  #llbotConfig = config.getConfig("bot") || {}
  #milkyAdapter = new MilkyAdapter({ ...this.#llbotConfig })
  #llbot = new LLoneBot()
  #options = { manageServices: true }
  #binding = createMilkyBinding()

  constructor(options = {}) {
    this.#options = {
      manageServices: options.manageServices !== false,
    }
    if (options.binding) this.#binding = options.binding
  }

  async load() {
    try {
      await this.#initAdapter()
      await this.#initGlobalBot()

      if (this.#options.manageServices) {
        try {
          await startWebuiServer()
        } catch (err) {
          console.warn("[LLoneBotEventListener] webui server start failed:", err)
        }
      }

      this.#bindAllEvents()

      if (this.#options.manageServices) {
        try {
          startControlServer({
            getStatus: () => this.getStatus(),
            reloadPlugins: async () => await this.reloadPlugins({ cacheBust: true }),
            sendMessage: async payload => await this.simulateIncoming(payload),
          })
        } catch (err) {
          console.warn("[LLoneBotEventListener] control server start failed:", err)
        }
      }
      // 挂载获取转发消息的方法到全局Bot
      global.Bot.getForwardMessage = this.getForwardMessage.bind(this)
      console.log("[LLoneBotEventListener] 初始化完成，已支持转发消息ID保留+获取具体内容")
    } catch (error) {
      console.error("[LLoneBotEventListener] 初始化失败：", error)
      throw error
    }
  }

  /**
   * 对 Runtime Kernel 暴露当前协议 Bot 核心。
   */
  getBotCore() {
    return this.#llbot
  }

  getRuntimeBot() {
    return globalThis.Bot || null
  }

  getStatus() {
    return {
      protocol: "milky",
      adapterType: "Milky",
      uin: globalThis.Bot?.uin,
      nickname: globalThis.Bot?.nickname,
      pluginCount: Object.keys(this.#llbot.plugins || {}).length,
      plugins: Object.keys(this.#llbot.plugins || {}),
    }
  }

  async reloadPlugins(options = {}) {
    return await this.#llbot.reloadBotPlugins(options)
  }

  async simulateIncoming(payload) {
    return await simulateIncomingMessage({
      bot: this.#llbot,
      protocol: "milky",
      adapterType: "Milky",
      payload,
      selfId: globalThis.Bot?.uin,
    })
  }

  dispose() {
    try {
      this.#milkyAdapter.dispose?.()
    } catch (err) {
      console.warn("[LLoneBotEventListener] dispose failed:", err?.message || err)
    }
  }

  async #initAdapter() {
    this.loginInfo = await this.#milkyAdapter.getLoginInfo()
    console.log("[MilkyAdapter] 登录信息：", this.loginInfo)

    if (!this.loginInfo) {
      throw new Error("MilkyAdapter登录失败，未获取到登录信息")
    }

    const bindEvent = {
      reply: this.#llbot.reply.bind(this.#llbot),
      sendUniversalMessage: this.#sendUniversalMessage.bind(this),
      // 新增：绑定获取转发消息的方法
      getForwardMessage: this.getForwardMessage.bind(this),
    }
    this.#binding.decorateBindEvent(bindEvent, {
      adapter: this.#milkyAdapter,
      botCore: this.#llbot,
      sendUniversalMessage: this.#sendUniversalMessage.bind(this),
      getForwardMessage: this.getForwardMessage.bind(this),
      loginInfo: this.loginInfo,
    })
    this.#llbot.bindEvent = bindEvent
    await this.#llbot.initBot()
  }

  async #initGlobalBot() {
    global.Bot = this.#binding.decorateRuntimeBot({
      currentBot: globalThis.Bot || null,
      loginInfo: this.loginInfo,
      adapter: this.#milkyAdapter,
      botCore: this.#llbot,
      getForwardMessage: this.getForwardMessage.bind(this),
    })
    await this.#llbot.runMount()
  }

  #bindAllEvents() {
    Object.keys(LLoneBotEventListener.EVENT_TYPE_MAP).forEach(eventType => {
      this.#milkyAdapter.on(eventType, async data => {
        try {
          const eventName = LLoneBotEventListener.EVENT_TYPE_MAP[eventType] || eventType
          const eventData = data.data

          this.#binding.decorateBindEvent(eventData, {
            adapter: this.#milkyAdapter,
            botCore: this.#llbot,
            sendUniversalMessage: this.#sendUniversalMessage.bind(this),
            getForwardMessage: this.getForwardMessage.bind(this),
            loginInfo: this.loginInfo,
          })
          await this.#binding.normalizeInboundEvent(eventData, {
            eventType,
            adapterType: this.#milkyAdapter.adapterType,
            loginInfo: this.loginInfo,
            selfId: data.self_id,
          })

          if (eventType === "message_receive") {
            await this.#saveGroupMessage(eventData)
          }
          await this.#llbot.deal({
            ...eventData,
          })

          console.debug(`[MilkyAdapter] 处理完成事件：${eventName}`)
        } catch (error) {
          console.error(`[MilkyAdapter] 处理事件 ${eventType} 失败：`, error)
        }
      })
    })
  }

  /**
   * 核心修复：预处理Milky消息段（保留forward类型+补充最小化messages）
   * @param {Array} segments Milky原生消息段数组
   * @returns {Array} 修复后的消息段数组
   */
  #preprocessMilkySegments(segments) {
    if (!Array.isArray(segments)) return []

    return segments.map(seg => {
      // 1. 处理forward类型：保留完整元数据，补充最小化非空messages
      if (seg.type === "forward") {
        const forwardMeta = {
          forward_id: seg.data?.forward_id || "",
          title: seg.data?.title || "",
          summary: seg.data?.summary || "",
          preview: seg.data?.preview || [],
          message_seq: seg.data?.message_seq || "", // 关联的消息序号
          peer_id: seg.data?.peer_id || "", // 所属群/好友ID
        }

        const messages = seg.data?.messages || []
        // 若messages为空，构造最小化非空数组（满足校验，同时保留元数据）
        const validMessages =
          messages.length > 0
            ? messages.map(msg => ({
                ...msg,
                segments: Array.isArray(msg.segments) ? msg.segments : [],
              }))
            : [
                // 最小化消息段：仅包含转发元数据的提示文本
                {
                  user_id: this.loginInfo?.uin || "0",
                  sender_name: "系统提示",
                  segments: [
                    {
                      type: "text",
                      data: {
                        text: `[转发消息ID: ${forwardMeta.forward_id}] ${forwardMeta.summary || "点击查看转发内容"}`,
                      },
                    },
                  ],
                },
              ]

        return {
          type: "forward",
          data: {
            ...seg.data,
            ...forwardMeta, // 完整保留元数据
            messages: validMessages, // 非空数组，满足校验
          },
        }
      }

      // 2. 处理light_app类型：保留元数据，转为文本段（不丢失关键信息）
      if (seg.type === "light_app") {
        try {
          const json = JSON.parse(seg.data?.json_payload || "{}")
          const lightAppMeta = {
            app_id: json.app || "",
            title: json.title || "",
            content: json.meta?.detail_1?.text || "",
            url: json.meta?.detail_1?.qqdocurl || "",
          }
          // 文本中保留关键元数据
          const text = `[轻应用${lightAppMeta.app_id}] ${lightAppMeta.title}：${lightAppMeta.content} ${lightAppMeta.url}`
          return {
            type: "text",
            data: {
              text,
              // 隐藏字段：保留完整元数据
              __light_app_meta__: lightAppMeta,
            },
          }
        } catch (e) {
          return {
            type: "text",
            data: {
              text: "[轻应用消息] 无法解析内容",
              __light_app_meta__: { error: e.message },
            },
          }
        }
      }

      // 3. 其他类型透传
      return seg
    })
  }

  /**
   * 提取消息段中的所有转发元数据
   * @param {Array} segments 预处理后的消息段
   * @returns {Array} 转发元数据列表
   */
  #extractForwardMeta(segments) {
    return segments
      .filter(seg => seg.type === "forward")
      .map(seg => ({
        forward_id: seg.data?.forward_id || "",
        title: seg.data?.title || "",
        summary: seg.data?.summary || "",
        preview: seg.data?.preview || [],
        message_seq: seg.data?.message_seq || "",
        peer_id: seg.data?.peer_id || "",
      }))
  }

  /**
   * 安全转换为通用消息格式
   * @param {string} protocol 协议类型（milky）
   * @param {Array} segments 预处理后的消息段
   * @returns {UniversalMessage} 通用消息实例
   */
  #safeConvertToUniversal(protocol, segments) {
    try {
      return UniversalMessage.fromMilky(segments)
    } catch (convertError) {
      console.error(`[MilkyAdapter] 通用消息转换失败（协议：${protocol}）：`, convertError)
      // 转换失败时返回包含基础信息的通用消息
      const fallbackMsg = new UniversalMessage()
      // 提取所有文本和转发ID
      segments.forEach(seg => {
        if (seg.type === "text") {
          fallbackMsg.addText(seg.data?.text || "")
        } else if (seg.type === "forward") {
          fallbackMsg.addText(`[转发消息ID: ${seg.data?.forward_id}] ${seg.data?.summary}`)
        }
      })
      return fallbackMsg
    }
  }

  /**
   * 核心新增：通过forward_id获取具体的转发消息内容
   * @param {Object} options 参数
   * @param {string} options.forward_id 转发消息ID
   * @param {string/number} options.peer_id 群/好友ID（可选，加速查询）
   * @param {string} options.message_scene 场景（group/private，可选）
   * @returns {Promise<Object>} 转发消息具体内容
   */
  async getForwardMessage({ forward_id, peer_id, message_scene = "group" }) {
    if (!forward_id) {
      throw new Error("必须指定forward_id才能获取转发消息")
    }

    try {
      // 调用Milky API获取转发消息详情（根据Milky SDK实际接口调整）
      const result = await this.#milkyAdapter.callApi("get_forward_message", {
        forward_id,
        peer_id: peer_id || "",
        message_scene,
      })

      // 标准化返回格式，兼容onebot/icqq
      return {
        forward_id,
        title: result.title || "",
          summary: result.summary || "",
          preview: result.preview || [],
          messages: (result.messages || []).map(msg => ({
            user_id: msg.user_id || "",
            nickname: msg.sender_name || "",
            time: msg.time || Date.now(),
            message: msg.segments || [],
            // 转换为通用消息格式
            universal_message: safeConvertMilkyToUniversal("milky", msg.segments || []),
          })),
          raw: result, // 保留原生返回数据
        }
    } catch (error) {
      console.error(`[MilkyAdapter] 获取转发消息${forward_id}失败：`, error)
      // 降级：从数据库查询缓存的转发元数据
      const cachedMsg = await MessageDB.getMessageByForwardId(forward_id)
      if (cachedMsg) {
        const meta = findForwardMetaInRecord(cachedMsg, forward_id) || {}
        return {
          forward_id,
          title: meta.title || "",
          summary: meta.summary || "",
          preview: meta.preview || [],
          messages: [],
          raw: null,
          cached: true,
        }
      }
      throw new Error(`获取转发消息失败：${error.message}`)
    }
  }

  async #saveGroupMessage(eventData) {
    const { message_seq, sender_id, time, segments, group_member, peer_id } = eventData
    if (!peer_id || !message_seq || !sender_id || !time) {
      console.warn("[MessageDB] 群消息存储参数缺失，跳过存储：", {
        peer_id,
        message_seq,
        sender_id,
        time,
      })
      return
    }

    try {
      await MessageDB.saveMessage(peer_id, {
        message_id: message_seq,
        user_id: sender_id,
        time: time,
        message: segments,
        sender: group_member,
      })
      console.debug(`[MessageDB] 群消息 ${message_seq} 已存储`)
    } catch (error) {
      console.error(`[MessageDB] 群消息 ${message_seq} 存储失败：`, error)
    }
  }

  #normalizeEventData(e, eventType) {
    if (eventType === "message_receive") {
      e.post_type = "message"
    } else if (eventType.includes("request")) {
      e.post_type = "request"
    } else {
      e.post_type = "notice"
    }

    e[`${e.post_type}_type`] = e.message_scene === "group" || e.group_id ? "group" : "private"
    e.sub_type =
      eventType === "message_receive"
        ? "normal"
        : LLoneBotEventListener.SUB_TYPE_MAP[eventType] || ""

    if (eventType === "group_join_request") {
      e.user_id = e.initiator_id
      e.flag = e.notification_seq
    }
  }

  static bindMilkyFunctions(target, adapter, botCore) {
    if (!target || !adapter) return

    target.recallMessage = async ({ peer_id, message_seq, isGroup }) => {
      try {
        if (isGroup) {
          await adapter.recallGroupMessage({ group_id: peer_id, message_seq })
        } else {
          await adapter.recallPrivateMessage({ user_id: peer_id, message_seq })
        }
        console.debug(`[MilkyAdapter] 撤回消息 ${message_seq} 成功`)
      } catch (error) {
        console.error(`[MilkyAdapter] 撤回消息 ${message_seq} 失败：`, error)
      }
    }

    // 兼容：插件侧通常按 onebot 风格传参（reaction/message_id/message_seq）
    target.sendGroupMessageReaction = async input => {
      try {
        const group_id = Number(input?.group_id ?? input?.peer_id ?? target?.peer_id ?? 0)
        const message_seq = Number(
          input?.message_seq ?? input?.seq ?? target?.seq ?? target?.message_seq ?? 0,
        )

        const reactionRaw =
          input?.reaction ?? input?.emoji_id ?? input?.emojiId ?? input?.emoji ?? input?.id
        if (reactionRaw === undefined || reactionRaw === null || reactionRaw === "") {
          console.warn("[sendGroupMessageReaction] milky missing reaction:", input)
          return false
        }

        const is_add =
          input?.is_add !== undefined
            ? Boolean(input.is_add)
            : input?.isAdd !== undefined
              ? Boolean(input.isAdd)
              : true

        await adapter.sendGroupMessageReaction({
          group_id,
          message_seq,
          reaction: String(reactionRaw),
          is_add,
        })
        return true
      } catch (err) {
        console.warn("[sendGroupMessageReaction] milky failed:", err?.message || err)
        return false
      }
    }
    target.sendMessage = adapter.sendMsg.bind(adapter)

    target.getMsg = async seq => {
      try {
        const res = await adapter.getMessage({
          message_scene: target.message_scene,
          peer_id: target.peer_id,
          message_seq: seq,
        })

        const msgObj = res?.message
        const rawSegments = Array.isArray(msgObj) ? msgObj : Array.isArray(msgObj?.segments) ? msgObj.segments : []
        const message_scene = msgObj?.message_scene ?? target.message_scene
        const peer_id = msgObj?.peer_id ?? target.peer_id
        const message_seq = msgObj?.message_seq ?? seq
        const sender_id = msgObj?.sender_id
        const time = msgObj?.time
        // 预处理+安全转换
        const helper = new LLoneBotEventListener()
        const processedSegments = helper.#preprocessMilkySegments(rawSegments || [])
        const universalMessage = helper.#safeConvertToUniversal("milky", processedSegments)

        return {
          protocol: "milky",
          adapterType: "Milky",
          ...(msgObj && typeof msgObj === "object" ? msgObj : {}),
          message_scene,
          peer_id,
          message_seq,
          seq: message_seq,
          ...(sender_id !== undefined ? { sender_id } : {}),
          ...(time !== undefined ? { time } : {}),
          segments: processedSegments,
          forwardMeta: helper.#extractForwardMeta(processedSegments),
          universalMessage,
          message: universalMessage.segments,
        }
      } catch (error) {
        console.error(`[MilkyAdapter] 获取消息 ${seq} 失败：`, error)
        return null
      }
    }

    target.getUserInfo = adapter.getUserProfile.bind(adapter)
    target.acceptGroupRequest = adapter.acceptGroupRequest.bind(adapter)
    target.rejectGroupRequest = adapter.rejectGroupRequest.bind(adapter)
    target.renderImg = botCore?.renderImg ? botCore.renderImg.bind(botCore) : LLoneBot.prototype.renderImg
    target.makeGroupForwardMsg = botCore?.makeForwardMsg
      ? botCore.makeForwardMsg.bind(botCore)
      : LLoneBot.prototype.makeForwardMsg
    target.getGroupMemberList = async group_id => {
      let { members } = await adapter.getGroupMemberList.call(adapter, { group_id })
      return new Map(members.map(item => [item.user_id, item]))
    }

    target.getGroupMemberInfo = async (group_id, user_id) => {
      console.log(group_id, user_id)
      try {
        let { member } = await adapter.getGroupMemberInfo({
          group_id,
          user_id,
        })
        return member
      } catch (error) {
        console.error(`[MilkyAdapter] 获取群成员信息 ${user_id} 失败：`, error)
        return null
      }
    }
  }

  async dealMessage(e) {
    if (!e) return {}

    e.protocol = e.protocol || "milky"

    if (e.message_seq !== undefined && e.seq === undefined) {
      e.seq = e.message_seq
    }

    e.adapterType = "Milky"
    return e
  }

  async #sendUniversalMessage({ peer_id, message_scene, universalMsg }) {
    if (!(universalMsg instanceof UniversalMessage)) {
      throw new Error("universalMsg必须是UniversalMessage实例")
    }
    const milkySegments = universalMsg.convertTo("milky")
    const processedSegments = preprocessMilkySegments(milkySegments, { loginInfo: this.loginInfo })
    const target =
      message_scene === "group" ? { group_id: Number(peer_id) || peer_id } : String(peer_id)
    return await this.#milkyAdapter.sendMsg(target, processedSegments)
  }
}



