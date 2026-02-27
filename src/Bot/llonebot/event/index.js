import LLoneBot from "../index.js"
import MilkyAdapter from "../milky-adapter.js"
import config from "../../../lib/config.js"
import MessageDB from "../../../db/MessageDB.js"
import getImageDisplay from "../../../utils/imgdisplay.js"

/**
 * LLoneBot事件监听处理类
 * 负责绑定Milky适配器事件、处理消息/通知/请求事件、初始化全局Bot对象
 */
export default class LLoneBotEventListener {
  // 事件类型映射常量（统一管理，便于维护）
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

  // 事件子类型映射常量
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
    group_message_reaction: "emoji", // 修正原拼写错误 emoj -> emoji
    group_mute: "ban",
    group_whole_mute: "allban",
    group_nudge: "poke",
    group_file_upload: "upload",
  }

  // 配置项（语义化命名）
  #llbotConfig = config.getConfig("bot") || {}
  // Milky适配器实例
  #milkyAdapter = new MilkyAdapter({ ...this.#llbotConfig })
  // LLoneBot实例
  #llbot = new LLoneBot()

  /**
   * 初始化入口方法
   */
  async load() {
    try {
      // 1. 初始化适配器并校验登录状态
      await this.#initAdapter()
      // 2. 初始化全局Bot对象
      await this.#initGlobalBot()
      // 3. 绑定所有事件监听
      this.#bindAllEvents()

      console.log("[LLoneBotEventListener] 初始化完成，已绑定所有事件监听")
    } catch (error) {
      console.error("[LLoneBotEventListener] 初始化失败：", error)
      throw error // 抛出错误，让上层感知
    }
  }

  /**
   * 初始化适配器并校验登录状态
   */
  async #initAdapter() {
    this.loginInfo = await this.#milkyAdapter.getLoginInfo()
    console.log("[MilkyAdapter] 登录信息：", this.loginInfo)

    if (!this.loginInfo) {
      throw new Error("MilkyAdapter登录失败，未获取到登录信息")
    }

    // 绑定基础事件方法
    const bindEvent = {
      reply: this.#llbot.reply,
    }
    LLoneBotEventListener.bindMilkyFunctions(bindEvent, this.#milkyAdapter)
    this.#llbot.bindEvent = bindEvent
    await this.#llbot.initBot()
  }

  /**
   * 初始化全局Bot对象（避免覆盖已有值）
   */
  async #initGlobalBot() {
    console.log(this.#milkyAdapter)

    if (!global.Bot) {
      global.Bot = {
        uin: this.loginInfo.uin,
        nickname: this.loginInfo.nickname,
        ...this.#milkyAdapter,
        ...{ reply: this.#llbot.reply },
        pickUser: this.#milkyAdapter.pickUser.bind(this.#milkyAdapter),
        pickGroup: this.#milkyAdapter.pickGroup.bind(this.#milkyAdapter),
        ...this.#llbot.bindEvent,
        makeGroupForwardMsg: this.#milkyAdapter.makeForwardMsg.bind(this.#milkyAdapter), // 绑定适配器的转发消息方法
      }
      console.log(Bot)
      console.log("[GlobalBot] 全局Bot对象初始化完成：", Object.keys(global.Bot))
    } else {
      console.warn("[GlobalBot] 全局Bot对象已存在，跳过初始化")
    }
    await this.#llbot.runMount()
  }

  /**
   * 绑定所有MilkyAdapter事件监听
   */
  #bindAllEvents() {
    Object.keys(LLoneBotEventListener.EVENT_TYPE_MAP).forEach(eventType => {
      this.#milkyAdapter.on(eventType, async data => {
        try {
          const eventName = LLoneBotEventListener.EVENT_TYPE_MAP[eventType] || eventType
          const eventData = data.data

          // 补充适配器类型
          eventData.adapterType = this.#milkyAdapter.adapterType
          // 绑定Milky相关方法到事件数据
          LLoneBotEventListener.bindMilkyFunctions(eventData, this.#milkyAdapter)

          // 处理群消息存储
          if (eventType === "message_receive" && eventData.group) {
            await this.#saveGroupMessage(eventData)
          }

          // 标准化事件格式
          this.#normalizeEventData(eventData, eventType)
          // 分发事件到LLoneBot处理
          await this.dealMessage(eventData)
          this.#llbot.deal({
            ...eventData,
            self_id: data.self_id,
          })

          console.debug(`[MilkyAdapter] 处理完成事件：${eventName}`)
        } catch (error) {
          console.error(`[MilkyAdapter] 处理事件 ${eventType} 失败：`, error)
        }
      })
    })
  }

  /**
   * 存储群消息到数据库（抽离独立方法，便于维护）
   * @param {Object} eventData 事件数据
   */
  async #saveGroupMessage(eventData) {
    const { message_seq, sender_id, time, segments, group_member, peer_id } = eventData
    // 参数校验，避免数据库存储异常
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
      console.debug(`[MessageDB] 群消息 ${message_seq} 已成功存储`)
    } catch (error) {
      console.error(`[MessageDB] 群消息 ${message_seq} 存储失败：`, error)
    }
  }

  /**
   * 标准化事件数据格式（统一post_type/sub_type等字段）
   * @param {Object} e 事件数据
   * @param {string} eventType 原始事件类型
   */
  #normalizeEventData(e, eventType) {
    // 设定基础post_type
    if (eventType === "message_receive") {
      e.post_type = "message"
    } else if (eventType.includes("request")) {
      e.post_type = "request"
    } else {
      e.post_type = "notice"
    }

    // 设定消息类型（群/私聊）
    e[`${e.post_type}_type`] = e.message_scene === "group" || e.group_id ? "group" : "private"

    // 设定子类型
    e.sub_type =
      eventType === "message_receive"
        ? "normal"
        : LLoneBotEventListener.SUB_TYPE_MAP[eventType] || ""

    // 适配加群请求的特殊字段
    if (eventType === "group_join_request") {
      e.user_id = e.initiator_id
      e.flag = e.notification_seq
    }
  }

  /**
   * 绑定Milky适配器的方法到事件对象（修正原依赖外部变量问题）
   * @param {Object} target 要绑定方法的目标对象
   * @param {MilkyAdapter} adapter MilkyAdapter实例
   */
  static bindMilkyFunctions(target, adapter) {
    if (!target || !adapter) return

    // 撤回消息方法（优化错误处理）
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

    // 绑定其他方法
    target.sendGroupMessageReaction = adapter.sendGroupMessageReaction.bind(adapter)
    target.sendMessage = adapter.sendMsg.bind(adapter)

    // 获取消息方法（优化逻辑）
    target.getMsg = async seq => {
      try {
        const { message } = await adapter.getMessage({
          message_scene: target.message_scene,
          peer_id: target.peer_id,
          message_seq: seq,
        })
        return await new LLoneBotEventListener().dealMessage(message)
      } catch (error) {
        console.error(`[MilkyAdapter] 获取消息 ${seq} 失败：`, error)
        return null
      }
    }

    target.getUserInfo = adapter.getUserProfile.bind(adapter)
    target.acceptGroupRequest = adapter.acceptGroupRequest.bind(adapter)
    target.rejectGroupRequest = adapter.rejectGroupRequest.bind(adapter)
    target.renderImg = LLoneBot.prototype.renderImg // 绑定LLoneBot的渲染图片方法
    target.makeGroupForwardMsg = LLoneBot.prototype.makeForwardMsg.bind(adapter) // 绑定适配器的转发消息方法
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

  /**
   * 处理消息格式转换
   * @param {Object} e 原始消息数据
   * @returns {Object} 标准化后的消息数据
   */
  async dealMessage(e) {
    if (!e) return {}

    // 转换segments为标准格式
    if (e.segments) {
      e.message = await this.dealMsg(e, e.segments)
      delete e.segments
    }

    let msg = e.msg || ""
    const regurl = /(https?|http|ftp|file):\/\/[-A-Za-z0-9+&@#/%?=~_|!:,.;]+[-A-Za-z0-9+&@#/%=~_|]/g
    let url = msg?.match(regurl)
    e.url = url?.[0] || ""
    e.msg = ""
    // 兼容message_seq字段
    if (e.message_seq) {
      e.seq = e.message_seq
      delete e.message_seq
    }
    e.adapterType = "Milky"
    return e
  }

  /**
   * 处理消息段格式
   * @param {Array} message 原始消息段数组
   * @returns {Array} 标准化后的消息段数组
   */
  async dealMsg(e, message) {
    if (!Array.isArray(message)) return []
    let imgdisplay
    if (e.user_id === e.self_id) {
      imgdisplay = await getImageDisplay()
    }
    e.msg = ""
    return message.map(item => {
      const result = { type: item.type, ...item.data }
      // 图片类型特殊处理
      switch (item.type) {
        case "text":
          e.msg += item?.data?.text || item?.text
          break
        case "image":
          result.data = {
            fid: item.data.resource_id,
            url: item.data.temp_url,
            width: item.data.width,
            height: item.data.height,
            summary: imgdisplay || item.data.summary,
          }
          break
        case "face":
          result.id = item.face_id || item.data.face_id
          break
        case "light_app":
          result.data = {
            json: JSON.parse(item?.data?.json_payload),
          }
          e.json = result.data.json
          break
      }
      return result
    })
  }
}
