import OneBotV11Adapter from "../onebot.js"
import config from "../../../../lib/config.js"
import MessageDB from "../../../../db/MessageDB.js"
import OneBot from "../index.js"
import { simulateIncomingMessage } from "../../../message/cli-simulator.js"
import { createOneBotV11Binding } from "../../../../runtime/drivers/onebotv11-binding.js"
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
  #binding = createOneBotV11Binding()

  constructor(options = {}) {
    if (options.binding) this.#binding = options.binding
  }

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

      // 3. 绑定所有事件监听
      this.#bindAllEvents()

      console.log("[OneBotV11EventListener] 初始化完成，已绑定所有事件监听")
    } catch (error) {
      console.error("[OneBotV11EventListener] 初始化失败：", error)
      throw error // 抛出错误，让上层感知
    }
  }

  /**
   * 对 Runtime Kernel 暴露当前协议 Bot 核心。
   */
  getBotCore() {
    return this.#oneBot
  }

  getRuntimeBot() {
    return globalThis.Bot || null
  }

  getStatus() {
    return {
      protocol: "onebotv11",
      adapterType: "OneBotV11",
      uin: globalThis.Bot?.uin,
      nickname: globalThis.Bot?.nickname,
      pluginCount: Object.keys(this.#oneBot.plugins || {}).length,
      plugins: Object.keys(this.#oneBot.plugins || {}),
    }
  }

  async reloadPlugins(options = {}) {
    return await this.#oneBot.reloadBotPlugins(options)
  }

  async simulateIncoming(payload) {
    return await simulateIncomingMessage({
      bot: this.#oneBot,
      protocol: "onebotv11",
      adapterType: "OneBotV11",
      payload,
      selfId: globalThis.Bot?.uin,
    })
  }

  dispose() {
    try {
      this.#oneBotAdapter.dispose?.()
    } catch (err) {
      console.warn("[OneBotV11EventListener] dispose failed:", err?.message || err)
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
    this.#binding.decorateBindEvent(bindEvent, { adapter: this.#oneBotAdapter, botCore: this.#oneBot })
    this.#oneBot.bindEvent = bindEvent
    await this.#oneBot.initBot()
  }

  /**
   * 初始化全局Bot对象（避免覆盖已有值）
   */
  async #initGlobalBot() {
    global.Bot = this.#binding.decorateRuntimeBot({
      currentBot: globalThis.Bot || null,
      loginInfo: this.loginInfo,
      adapter: this.#oneBotAdapter,
      botCore: this.#oneBot,
    })
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
          this.#binding.decorateBindEvent(data, { adapter: this.#oneBotAdapter, botCore: this.#oneBot })
          await this.#binding.normalizeInboundEvent(data, { eventType })
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
}
