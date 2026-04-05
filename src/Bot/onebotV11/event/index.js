import OneBotV11Adapter from "../onebot.js"
import config from "../../../lib/config.js"
import MessageDB from "../../../db/MessageDB.js"
import OneBot from "../index.js"
import { UniversalMessage } from "../../message/universal-message.js"
import { coerceToUniversalMessage } from "../../message/context.js"
import { applyUniversalBotApi } from "../../api/universal-bot-api.js"
import { startControlServer } from "../../../lib/controlServer.js"
import { startWebuiServer } from "../../../lib/webuiServer.js"
import { simulateIncomingMessage } from "../../message/cli-simulator.js"
/**
 * OneBot V11 事件监听处理类
 * 负责绑定OneBotV11适配器事件、标准化事件格式、处理消息存储与分发
 */
export default class OneBotV11EventListener {
  // 事件类型映射常量（集中管理，便于维护）
  static EVENT_TYPES = ["message", "request", "notice"]

  // OneBot V11 通知事件子类型映射
  static NOTICE_SUB_TYPE_MAP = {
    group_upload: "upload",
    group_admin: "admin",
    group_decrease: "decrease",
    group_increase: "increase",
    group_recall: "recall",
    friend_recall: "recall",
    group_ban: "ban",
    group_whole_ban: "allban",
    notify: "poke",
  }

  // 私有字段：封装核心依赖，避免外部篡改
  #oneBotConfig = config.getConfig("onebot") || {} // 从配置读取OneBot相关配置
  #adapterConfig = {
    wsPort: this.#oneBotConfig.wsPort || 2955, // 配置化，替代硬编码
    wsPath: this.#oneBotConfig.wsPath || "/OneBotV11",
  }
  #oneBotAdapter = new OneBotV11Adapter(this.#adapterConfig) // 适配器实例

  #oneBot = new OneBot() // OneBot核心实例

  /**
   * 初始化入口方法
   * 替代原模块末尾的setTimeout，建议调用方自行控制延迟加载
   */
  async load() {
    this.#oneBotAdapter.startServer()
    try {
      // 等待连接后再初始化（替代固定延迟）
      await this.#oneBotAdapter.waitUntilConnected({ timeoutMs: 60000 })

      await this.#initAdapter()
      // 2. 初始化全局Bot对象
      await this.#initGlobalBot()

      try {
        await startWebuiServer()
      } catch (err) {
        console.warn("[OneBotV11EventListener] webui server start failed:", err)
      }

      // 3. 绑定所有事件监听
      this.#bindAllEvents()

      try {
        startControlServer({
          getStatus: () => ({
            protocol: "onebotv11",
            adapterType: "OneBotV11",
            uin: global.Bot?.uin,
            nickname: global.Bot?.nickname,
            pluginCount: Object.keys(this.#oneBot.plugins || {}).length,
            plugins: Object.keys(this.#oneBot.plugins || {}),
          }),
          reloadPlugins: async () => {
            return await this.#oneBot.reloadBotPlugins({ cacheBust: true })
          },
          sendMessage: async payload => {
            return await simulateIncomingMessage({
              bot: this.#oneBot,
              protocol: "onebotv11",
              adapterType: "OneBotV11",
              payload,
              selfId: global.Bot?.uin,
            })
          },
        })
      } catch (err) {
        console.warn("[OneBotV11EventListener] control server start failed:", err)
      }

      console.log("[OneBotV11EventListener] 初始化完成，已绑定所有事件监听")
    } catch (error) {
      console.error("[OneBotV11EventListener] 初始化失败：", error)
      throw error // 抛出错误，让上层感知
    }
  }

  /**
   * 初始化适配器并校验登录状态
   */
  async #initAdapter() {
    console.log("[OneBotV11Adapter] 适配器配置：", this.#adapterConfig)
    this.loginInfo = await this.#oneBotAdapter.getLoginInfo()
    console.log("[OneBotV11Adapter] 登录信息：", this.loginInfo)

    if (!this.loginInfo) {
      throw new Error("OneBotV11Adapter登录失败，未获取到登录信息")
    }

    // 绑定基础回复方法
    const bindEvent = {
      reply: this.#oneBot.reply.bind(this.#oneBot),
    }
    OneBotV11EventListener.bindOneBotFunctions(bindEvent, this.#oneBotAdapter, this.#oneBot)
    applyUniversalBotApi(bindEvent, { bot: this.#oneBot, adapterHint: "onebotv11" })
    this.#oneBot.bindEvent = bindEvent
    await this.#oneBot.initBot()
  }

  /**
   * 初始化全局Bot对象（避免覆盖已有值）
   */
  async #initGlobalBot() {
    if (!global.Bot) {
      const adapter = this.#oneBotAdapter

      // 注意：不能用 `{ ...adapter }`（类方法在 prototype 上，不可枚举），否则会导致通用 API 找不到原生方法
      global.Bot = {
        uin: this.loginInfo.user_id,
        nickname: this.loginInfo.nickname,
        ...adapter,
        adapterType: adapter.adapterType,

        // passthrough API (doc-friendly): callApi/sendApi
        callApi: adapter.callApi.bind(adapter),
        sendApi: (adapter.sendApi ?? adapter.callApi).bind(adapter),

        // onebot adapter core (bound): 供通用 API / 插件直接调用（默认抛异常，不吞错）
        sendMsg: adapter.sendMsg.bind(adapter),
        deleteMessage: adapter.deleteMessage.bind(adapter),
        getLoginInfo: adapter.getLoginInfo.bind(adapter),
        getFriendList: adapter.getFriendList.bind(adapter),
        getFriendInfo: adapter.getFriendInfo.bind(adapter),
        acceptFriendRequest: adapter.acceptFriendRequest.bind(adapter),
        rejectFriendRequest: adapter.rejectFriendRequest.bind(adapter),
        getGroupList: adapter.getGroupList.bind(adapter),
        getGroupInfo: adapter.getGroupInfo.bind(adapter),
        getGroupMemberList: adapter.getGroupMemberList.bind(adapter),
        getGroupMemberInfo: adapter.getGroupMemberInfo.bind(adapter),
        setGroupName: adapter.setGroupName.bind(adapter),
        setGroupMemberCard: adapter.setGroupMemberCard.bind(adapter),
        setGroupMemberAdmin: adapter.setGroupMemberAdmin.bind(adapter),
        setGroupMemberSpecialTitle: adapter.setGroupMemberSpecialTitle.bind(adapter),
        setGroupMemberMute: adapter.setGroupMemberMute.bind(adapter),
        setGroupWholeMute: adapter.setGroupWholeMute.bind(adapter),
        kickGroupMember: adapter.kickGroupMember.bind(adapter),
        quitGroup: adapter.quitGroup.bind(adapter),
        sendGroupMessageReaction: adapter.sendGroupMessageReaction.bind(adapter),
        acceptGroupRequest: adapter.acceptGroupRequest.bind(adapter),
        rejectGroupRequest: adapter.rejectGroupRequest.bind(adapter),
        pickUser: adapter.pickUser.bind(adapter),
        pickGroup: adapter.pickGroup.bind(adapter),

        // compatibility aliases
        sendMessage: adapter.sendMsg.bind(adapter),
        makeGroupForwardMsg: adapter.makeForwardMsg.bind(adapter),

        // core bot abilities
        reply: this.#oneBot.reply,
        getGroupChatHistory: this.#oneBot.getGroupHistoryMsg,
      }
      console.log("[GlobalBot] 全局Bot对象初始化完成：", Object.keys(global.Bot))
    } else {
      console.warn("[GlobalBot] 全局Bot对象已存在，跳过初始化")
    }

    // 全局Bot补齐通用API（注意：仅覆盖群申请 accept/reject 的参数语义）
    try {
      applyUniversalBotApi(global.Bot, {
        bot: this.#oneBot,
        adapterHint: "onebotv11",
        override: [
          "getLoginInfo",
          "getFriendList",
          "getFriendInfo",
          "getGroupList",
          "getGroupInfo",
          "setGroupName",
          "setGroupMemberCard",
          "setGroupMemberAdmin",
          "setGroupMemberSpecialTitle",
          "setGroupWholeMute",
          "kickGroupMember",
          "quitGroup",
          "acceptFriendRequest",
          "rejectFriendRequest",
          "sendGroupMessageReaction",
          "acceptGroupRequest",
          "rejectGroupRequest",
          "getUserInfo",
          "getGroupMemberList",
          "getGroupMemberInfo",
          "setGroupMemberMute",
          "pickUser",
        ],
      })
    } catch {}
    await this.#oneBot.runMount()
  }

  /**
   * 绑定所有OneBotV11事件监听
   */
  #bindAllEvents() {
    OneBotV11EventListener.EVENT_TYPES.forEach(eventType => {
      this.#oneBotAdapter.on(eventType, async data => {
        try {
          // 补充适配器类型标识
          data.adapterType = this.#oneBotAdapter.adapterType
          data.protocol = "onebotv11"

          // 处理群消息存储
          if (eventType === "message" && data.group_id) {
            await this.#saveGroupMessage(data)
          }

          // 绑定OneBot方法到事件数据
          OneBotV11EventListener.bindOneBotFunctions(data, this.#oneBotAdapter, this.#oneBot)
          // 标准化事件格式
          this.#normalizeEventData(data)
          data.adapterType = "OneBotV11"
          await this.#oneBot.deal(data)

          console.debug(`[OneBotV11Adapter] 处理完成事件：${eventType}`)
        } catch (error) {
          console.error(`[OneBotV11Adapter] 处理事件 ${eventType} 失败：`, error)
        }
      })
    })
  }

  /**
   * 存储群消息到数据库（抽离独立方法，增加参数校验）
   * @param {Object} data 消息事件数据
   */
  async #saveGroupMessage(data) {
    const { group_id, message_id, user_id, time, message, sender } = data
    // 参数校验，避免空值导致数据库异常
    if (!group_id || !message_id || !user_id || !time) {
      console.warn("[MessageDB] 群消息存储参数缺失，跳过存储：", { group_id, message_id, user_id })
      return
    }

    try {
      await MessageDB.saveMessage(group_id, {
        message_id,
        user_id,
        time,
        message,
        sender,
      })
      console.debug(`[MessageDB] 群消息 ${message_id} 已成功存储`)
    } catch (error) {
      console.error(`[MessageDB] 群消息 ${message_id} 存储失败：`, error)
    }
  }

  /**
   * 标准化事件数据格式（修正原逻辑错误）
   * @param {Object} e 原始事件数据
   */
  #normalizeEventData(e) {
    switch (e.post_type) {
      case "notice":
        // 修正原逻辑错误：先取原生notice_type，再映射子类型
        const nativeNoticeType = e.notice_type
        e.notice_type = e.group_id ? "group" : "private" // 标识群/私聊通知
        e.sub_type =
          OneBotV11EventListener.NOTICE_SUB_TYPE_MAP[nativeNoticeType] || nativeNoticeType

        // 群管理员变更特殊处理
        if (nativeNoticeType === "group_admin") {
          e.is_set = e.sub_type === "set" // 修正原逻辑：基于原生sub_type判断
        }
        break

      case "request":
        e.sub_type = e.request_type === "friend" ? "friend" : e.sub_type
        e.request_type = e.group_id ? "group" : "private" // 标识群/私聊请求
        break

      case "message":
        e.sub_type = e.sub_type || "normal" // 补充默认值
        break
    }
  }

  /**
   * 绑定OneBotV11适配器方法到目标对象（解耦全局依赖，语义化命名）
   * @param {Object} target 目标对象（事件数据/绑定对象）
   * @param {OneBotV11Adapter} adapter 适配器实例
   * @param {OneBot} oneBot OneBot核心实例
   */
  static bindOneBotFunctions(target, adapter, oneBot) {
    if (!target || !adapter || !oneBot) return

    // 撤回消息方法（优化错误处理，语义化参数）
    target.recallMessage = async ({ message_id }) => {
      try {
        await adapter.deleteMessage({ message_id })
        logger.debug(`[OneBotV11Adapter] 撤回消息 ${message_id} 成功`)
      } catch (error) {
        logger.error(`[OneBotV11Adapter] 撤回消息 ${message_id} 失败：`, error)
      }
    }

    // 发送群消息表情回应（修正重复赋值，优化参数映射）
    target.sendGroupMessageReaction = async data => {
      try {
        await adapter.sendGroupMessageReaction.call(adapter, {
          message_id: data.message_id,
          emoji_id: Number(data.emoji_id ?? data.reaction),
        })
        return true
      } catch (err) {
        console.warn("[sendGroupMessageReaction] onebotv11 failed:", err?.message || err)
        return false
      }
    }

    // 绑定核心方法
    target.sendMessage = async (ctx, msg) => {
      if (msg?.message) msg = msg.message

      // forward/raw onebot 消息直接透传，避免被 UniversalMessage 误转换
      const rawList = Array.isArray(msg) ? msg : msg ? [msg] : []
      if (rawList.some(i => i?.type === "node")) {
        return await adapter.sendMsg.call(adapter, ctx, rawList)
      }

      const universalMsg = coerceToUniversalMessage(msg)
      const onebotSegments = universalMsg.convertTo("onebotv11")
      return await adapter.sendMsg.call(adapter, ctx, onebotSegments)
    }

    // 获取消息（增加参数校验，优化类型转换）
    target.getMsg = async message_id => {
      if (!message_id || isNaN(Number(message_id))) {
        console.warn(`[OneBotV11Adapter] 获取消息失败：无效的message_id ${message_id}`)
        return null
      }
      try {
        const msgData = await adapter.getMessage(Number(message_id))
        return await OneBotV11EventListener.dealMessage({ ...msgData, protocol: "onebotv11" })
      } catch (error) {
        console.error(`[OneBotV11Adapter] 获取消息 ${message_id} 失败：`, error)
        return null
      }
    }

    target.getUserInfo = adapter.getFriendInfo.bind(adapter)
    target.acceptGroupRequest = adapter.acceptGroupRequest.bind(adapter)
    target.rejectGroupRequest = adapter.rejectGroupRequest.bind(adapter)
    target.renderImg = oneBot.renderImg.bind(oneBot)
    target.makeGroupForwardMsg = oneBot.makeForwardMsg
    target.getGroupMemberList = async group_id => {
      let members = await adapter.getGroupMemberList.call(adapter, { group_id })
      return new Map(members.map(item => [item.user_id, item]))
    }

    // 获取群成员信息（优化日志，增加错误处理）
    const getGroupMemberInfo = adapter.getGroupMemberInfo.bind(adapter)
    target.getGroupMemberInfo = async (group_id, user_id) => {
      try {
        console.debug(`[OneBotV11Adapter] 获取群成员信息：群${group_id} 用户${user_id}`)
        const data = await getGroupMemberInfo({ group_id, user_id })
        return data
      } catch (error) {
        console.error(`[OneBotV11Adapter] 获取群${group_id} 用户${user_id} 信息失败：`, error)
        return null
      }
    }
  }

  /**
   * 处理消息格式转换（简化逻辑，移除冗余）
   * @param {Object} e 原始消息数据
   * @returns {Object} 标准化后的消息数据
   */
  static async dealMessage(e) {
    if (!e || !e.message || typeof e.message === "string") return e

    // 统一真值：ctx.message 为 UniversalMessage.segments
    e.protocol = e.protocol || "onebotv11"
    const rawSegments = Array.isArray(e.message) ? e.message : [e.message]
    e.universalMessage = UniversalMessage.fromOnebotV11(rawSegments)
    e.message = e.universalMessage.segments
    return e
  }
}

// 【可选】如需延迟加载，建议调用方自行控制，此处仅保留示例（注释）
const listener = new OneBotV11EventListener()
listener.load()
