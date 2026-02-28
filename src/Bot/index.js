import { loadPlugins } from "../lib/pluginLoader.js"
import Render from "../utils/render.js"
import path from "path"
import lodash from "lodash"
import cfg from "../lib/config.js"
import schedule from "node-schedule"
import env from "../lib/env.js"
import getImageDisplay from "../utils/imgdisplay.js"
import MessageDB from "../db/MessageDB.js"
export default class BaseBot {
  constructor(config) {
    this.adapter = config.adapter
    this.plugins = {}
    this.groupReply = {}
    this.privateReply = {}
    this.onMount = []
  }

  async loadBotPlugins() {
    try {
      const plugins = await loadPlugins(path.join(env.RootPath, "./src/plugins"))

      for (const plugin of plugins) {
        logger.info("加载插件:", plugin)
        await this.registerPlugin(plugin)
      }

      logger.info("插件加载完成，注册命令:", Object.keys(this.plugins))
    } catch (error) {
      logger.error("加载插件时出错:", error)
    }
  }

  async renderImg(name, data) {
    return await Render.render(
      name,
      `/html/${name}/${name}.html`,
      {
        ...data,
      },
      {
        retType: "base64",
        beforeRender({ data }) {
          let resPath = data.pluResPath
          return {
            defaulthtml: env.RootPath + "/resources/html/common/" + "default.html",
            ...data,
            _res_path: resPath,
            RootPath: env.RootPath,
            version: "0.0.1",
            botname: process.env.xunLuEnv,
            imgType: "png",
          }
        },
      },
    )
  }

  async registerPlugin(plugin) {
    if (!plugin.implementation?.register) return
    let idx = 1
    const pluginAPI = {
      registerCommand: this.createCommandRegistrar(plugin.name, idx),
      contextReply: this.createContextReplyHandler(),
      setTask: this.collectTimerTasks(),
      callFnc: this.callPluginFnc(),
      onMount: fnc => this.onMount.push(fnc),
    }
    plugin.implementation.register(pluginAPI)
  }

  async runMount() {
    for (let fnc of this.onMount) {
      logger.info("执行初始化任务" + fnc.toString())

      try {
        await fnc()
      } catch (err) {
        logger.error(`执行onMount函数时出错: ${err.stack}`)
      }
    }
  }

  callPluginFnc() {
    return async (name, ctx) => {
      if (!ctx?.sendMsg) {
        ctx = {
          ...ctx,
          ...this.bindEvent,
        }
        delete ctx.reply
        this.bindEvent.reply(ctx)
      }
      let p = Object.values(this.plugins).find(i => i.id == name)
      await p.fnc.call(ctx, ctx)
    }
  }

  collectTimerTasks() {
    return (interval, task) => {
      const job = schedule.scheduleJob(interval, () => {
        task({
          ...this.bindEvent,
        })
      })
      return job
    }
  }

  createCommandRegistrar(pname, idx) {
    return (command, handler) => {
      if (!command || !handler) return
      const commands = Array.isArray(command) ? command : [command]
      this.plugins[`${pname}-${commands[0] == "" ? idx : commands[0]}`] = {
        id: `${pname}-${idx}`,
        reg: commands[0],
        event: lodash.isString(commands[1]) ? commands[1] : "message",
        priority: lodash.isNumber(commands[1])
          ? commands[1]
          : lodash.isNumber(commands[2])
            ? commands[2]
            : 5000,
        fnc: handler,
      }
      idx++
    }
  }

  createContextReplyHandler() {
    return async (ctx, callback, endMsg) => {
      const isPrivate = ctx.isPrivate
      const contextKey = isPrivate ? ctx.user_id : ctx.group_id
      const userId = ctx.sender_id || ctx.user_id

      if (!contextKey || !userId) {
        logger.warn("缺少上下文Key或用户ID")
        return
      }

      // 初始化数据结构
      this.initContextStorage(isPrivate, contextKey, userId)

      // 处理现有上下文
      if (this.hasExistingContext(isPrivate, contextKey, userId, endMsg)) {
        this.addToContextQueue(isPrivate, contextKey, userId, callback, endMsg)
        return
      }

      // 创建新上下文
      this.createNewContext(isPrivate, contextKey, userId, callback, endMsg, ctx)
    }
  }

  initContextStorage(isPrivate, contextKey, userId) {
    const storage = isPrivate ? this.privateReply : this.groupReply

    if (!storage[contextKey]) {
      storage[contextKey] = {}
    }
    if (!storage[contextKey][userId]) {
      storage[contextKey][userId] = []
    }
  }

  hasExistingContext(isPrivate, contextKey, userId, endMsg) {
    const storage = isPrivate ? this.privateReply : this.groupReply
    const userContexts = storage[contextKey]?.[userId]

    return userContexts && userContexts.length > 0 && userContexts[0]?.endMsg && endMsg
  }

  addToContextQueue(isPrivate, contextKey, userId, callback, endMsg) {
    const storage = isPrivate ? this.privateReply : this.groupReply

    const newContext = {
      cfnc: callback,
      endMsg,
      timer: null,
    }

    storage[contextKey][userId].unshift(newContext)
  }

  createNewContext(isPrivate, contextKey, userId, callback, endMsg, ctx) {
    const storage = isPrivate ? this.privateReply : this.groupReply

    const newContext = {
      cfnc: callback,
      endMsg,
      timer: this.setupTimeout(isPrivate, contextKey, userId, endMsg, ctx),
    }

    storage[contextKey][userId].push(newContext)
  }

  setupTimeout(isPrivate, contextKey, userId, endMsg, ctx) {
    if (endMsg) return null

    return setTimeout(() => {
      this.clearContext(isPrivate, contextKey, userId)
      if (ctx) {
        ctx.reply("时间超时，已取消。", true).catch(logger.error)
      }
    }, 30000)
  }

  clearContext(isPrivate, contextKey, userId) {
    const storage = isPrivate ? this.privateReply : this.groupReply

    if (storage[contextKey]?.[userId]) {
      delete storage[contextKey][userId]
    }
  }

  filtEvent(e, v) {
    let event = v.event.split(".")
    let eventMap = {
      message: ["post_type", "message_type", "sub_type"],
      notice: ["post_type", "notice_type", "sub_type"],
      request: ["post_type", "request_type", "sub_type"],
    }
    let newEvent = []
    event.forEach((val, index) => {
      if (val === "*") {
        newEvent.push(val)
      } else if (eventMap[e.post_type]) {
        newEvent.push(e[eventMap[e.post_type][index]])
      }
    })
    newEvent = newEvent.join(".")

    if (v.event == newEvent) return true

    return false
  }

  async deal(e) {
    console.log("原始 的e", e)

    await this.dealMsg(e)
    await this.reply(e)
    console.log("处理完后的e", e)

    if (e.user_id == e.self_id && e.post_type == "message") return
    //处理上下文
    const isPrivate = e.isPrivate
    const contextKey = isPrivate ? e.user_id : e.group_id
    const userId = e.user_id

    const hasContext = isPrivate
      ? this.privateReply?.[contextKey]?.[userId]
      : this.groupReply?.[contextKey]?.[userId]

    if (!hasContext) {
      // 没有上下文时处理普通命令
      return await this.processNormalCommands(e)
    }

    // 处理上下文
    const userContexts = isPrivate
      ? this.privateReply[contextKey][userId]
      : this.groupReply[contextKey][userId]

    const result = await this.processUserContexts(e, userContexts)

    // 根据处理结果清理上下文
    this.cleanupContexts(isPrivate, contextKey, userId, userContexts, result)
  }

  // 处理普通命令
  async processNormalCommands(e) {
    let regs = lodash.orderBy(Object.values(this.plugins), ["priority"], ["asc"])
    console.log("reg里的e", e)

    for (let r of regs) {
      if (r.event && !this.filtEvent(e, r)) continue
      if (new RegExp(r.reg).test(e?.msg?.trim())) {
        console.log(e.msg)

        try {
          logger.debug("触发命令:", r)
          e.reg = r.reg
          let res = await r.fnc(e)
          if (!res) continue
          return res
        } catch (err) {
          logger.error("处理命令时出错:", err)
        }
      }
    }
  }

  // 处理用户上下文
  async processUserContexts(e, userContexts) {
    const result = {
      processed: false,
      shouldCleanPersistent: false,
      shouldCleanTemporary: false,
    }

    // 优先处理临时上下文（后进先出）
    for (let i = userContexts.length - 1; i >= 0; i--) {
      const context = userContexts[i]

      if (this.isContextValid(context)) {
        let res = await this.executeContextCallback(e, context)
        result.processed = true

        // 检查是否需要结束上下文
        if (this.shouldEndContext(e, context) && res) {
          if (context.endMsg) {
            result.shouldCleanPersistent = true
          } else {
            result.shouldCleanTemporary = true
          }
          break
        }
      }
    }

    return result
  }

  // 检查上下文是否有效
  isContextValid(context) {
    return context && context.cfnc && typeof context.cfnc === "function"
  }

  // 执行上下文回调
  async executeContextCallback(e, context) {
    try {
      let res = await context.cfnc(e)
      // 清除超时计时器，因为用户已响应
      if (context.timer) {
        clearTimeout(context.timer)
        context.timer = null
      }
      return res
    } catch (error) {
      logger.error("执行上下文回调出错:", error)
      await e.reply("处理出错，请重新操作").catch(logger.error)
    }
  }

  // 检查是否需要结束上下文
  shouldEndContext(e, context) {
    // 如果有结束消息且匹配，或者临时上下文已执行一次
    return (context.endMsg && e.msg === context.endMsg) || !context.endMsg
  }

  // 清理上下文
  cleanupContexts(isPrivate, contextKey, userId, userContexts, result) {
    if (!userContexts.length) return

    const storage = isPrivate ? this.privateReply : this.groupReply

    if (result.shouldCleanPersistent) {
      // 清理指令关闭的上下文
      this.removeContextsByType(storage, contextKey, userId, true)
    } else if (result.shouldCleanTemporary) {
      // 清理临时上下文
      this.removeLastTemporaryContext(storage, contextKey, userId)
    }

    // 如果所有上下文都处理完毕，清理整个用户条目
    if (!storage[contextKey]?.[userId]?.length) {
      this.cleanupUserContext(storage, contextKey, userId)
    }
  }

  // 按类型移除上下文
  removeContextsByType(storage, contextKey, userId, isPersistent) {
    if (!storage[contextKey]?.[userId]) return

    storage[contextKey][userId] = storage[contextKey][userId].filter(context => {
      const shouldRemove = isPersistent ? context.endMsg : !context.endMsg
      if (shouldRemove && context.timer) {
        clearTimeout(context.timer)
      }
      return !shouldRemove
    })
  }

  // 移除最后一个临时上下文
  removeLastTemporaryContext(storage, contextKey, userId) {
    if (!storage[contextKey]?.[userId]) return

    const contexts = storage[contextKey][userId]
    for (let i = contexts.length - 1; i >= 0; i--) {
      if (!contexts[i].endMsg) {
        if (contexts[i].timer) {
          clearTimeout(contexts[i].timer)
        }
        contexts.splice(i, 1)
        break
      }
    }
  }

  // 清理用户上下文
  cleanupUserContext(storage, contextKey, userId) {
    if (storage[contextKey]?.[userId]) {
      delete storage[contextKey][userId]
    }

    // 如果上下文键没有其他用户上下文，清理整个条目
    if (storage[contextKey] && Object.keys(storage[contextKey]).length === 0) {
      delete storage[contextKey]
    }
  }

  reply(e) {
    const reply = async (msg = "", quote = false, data = {}) => {
      let msgRes
      if (typeof msg === "string") msg = this.dealSuffix(msg)
      let { recallMsg = 0, at = "" } = data
      if (!msg) return false
      if (quote) {
        let new_msg = [
          {
            type: "reply",
            data: {
              message_seq: e.message_seq,
            },
          },
        ]
        Array.isArray(msg)
          ? new_msg.push(...msg)
          : new_msg.push({ type: "text", data: { text: msg } })
        msg = new_msg
      }

      if (e.group_id) {
        msgRes = await e.sendMessage(e, msg).catch(err => {
          logger.error(err)
        })
      } else {
        let friend = e.friend
        msgRes = await e.sendMessage(`${e.user_id}`, msg).catch(err => {
          logger.warn(err)
        })
      }
      console.log("msg的msgRes", msgRes)

      if (!e.isGuild && recallMsg > 0 && (msgRes?.seq || msgRes?.message_id)) {
        setTimeout(async () => {
          e.recallMessage({
            peer_id: e?.peer_id || e.group_id,
            message_seq: msgRes.seq,
            message_id: msgRes?.message_id || msgRes?.data?.message_id,
            isGroup: e.group_id || e.message_scene == "group",
          })
        }, recallMsg * 1000)
      }

      return msgRes
    }

    if (e.reply) {
      e.replyNew = e.reply
      /**
       * @param msg 发送的消息
       * @param quote 是否引用回复
       * @param data.recallMsg 群聊是否撤回消息，0-120秒，0不撤回
       * @param data.at 是否at用户
       */
      e.reply = async (msg = "", quote = false, data = {}) => {
        let imgdisplay = ""
        if (typeof msg === "string") msg = this.dealSuffix(msg)
        if ((Array.isArray(msg) && msg?.find(i => i.type == "image")) || msg?.type == "image") {
          imgdisplay = await getImageDisplay()
        }
        if (Array.isArray(msg)) {
          msg = msg.map(m => {
            switch (m?.type) {
              case "image":
                m.summary = imgdisplay || ""
            }
            return m
          })
        } else {
          switch (msg.type) {
            case "image":
              msg.summary = imgdisplay || ""
          }
        }

        return await reply(msg, quote, data)
      }
    } else {
      e.reply = reply
    }
  }

  dealSuffix(msg) {
    if (typeof msg !== "string") return msg
    let suffix_text = cfg.getConfig("bot").suffix_text
    const parseFaceText = str => {
      // 定义匹配[face:数字]的正则（全局+带捕获组）
      const facePattern = /\[face:(\d+)\]/g
      // 存储最终结构化结果
      const result = []
      // 记录上一次匹配结束的位置，初始为0
      let lastIndex = 0

      // 遍历所有匹配项
      let match
      while ((match = facePattern.exec(str)) !== null) {
        const [fullMatch, faceId] = match // fullMatch是[face:xxx]，faceId是数字字符串
        const matchStart = match.index // 匹配项在字符串中的起始位置

        // 1. 处理匹配项之前的文本（如果有内容）
        if (matchStart > lastIndex) {
          const textContent = str.slice(lastIndex, matchStart)
          result.push({
            type: "text",
            text: textContent,
          })
        }

        // 2. 处理表情项（转换faceId为数字类型）
        result.push({
          type: "face",
          id: Number(faceId),
        })

        // 3. 更新上一次结束位置为当前匹配项的结束位置
        lastIndex = facePattern.lastIndex
      }

      // 4. 处理最后一个匹配项之后的剩余文本（如果有内容）
      if (lastIndex < str.length) {
        const textContent = str.slice(lastIndex)
        result.push({
          type: "text",
          text: textContent,
        })
      }

      return result
    }
    return parseFaceText(msg + suffix_text)
  }

  async dealMsg(e) {
    if (e.msg) return
    if (e.message) {
      for (let val of e.message) {
        switch (val.type) {
          case "text":
            /** 中文#转为英文 */
            val.text = val.text?.replace(/＃|井/g, "#").trim()
            if (e.msg) {
              e.msg += val.text
            } else {
              e.msg = val.text?.trim()
            }
            break
          case "image":
            if (!e.img) {
              e.img = []
            }
            e.img.push(val.temp_url)
            break
          case "mention":
            if (val.user_id == e.self_id) {
              e.atBot = true
            } else {
              /** 多个at 以最后的为准 */
              e.at = val.user_id
            }
            break
          case "file":
            e.file = { name: val.file_name, fid: val.file_id }
            break
        }
      }
    }

    e.logText = ""

    if (e.message_scene == "friend" || e.message_scene == "temp") {
      e.isPrivate = true

      if (e.sender) {
        e.sender.card = e.sender.nickname
      } else {
        e.sender = {
          card: e.friend?.nickname,
          nickname: e.friend?.nickname,
        }
      }

      e.logText = `[私聊][${e.sender.nickname}(${e.sender_id})]`
    }

    if (e.message_scene == "group" || e.group_id) {
      e.group_id = e?.peer_id || e?.group_id
      e.isGroup = true
      e.sender = {
        card: e.group_member?.card,
        nickname: e.group_member?.nickname,
      }

      if (!e.group_name) e.group_name = e.group?.group_name

      e.logText = `[${e.group_name}(${e.sender.card || e.sender.nickname})]`
    } else if (e.detail_type === "guild") {
      e.isGuild = true
    }

    const master = await this.getMaster()
    if (master.includes(e.sender_id) || master.includes(e.user_id)) {
      e.isMaster = true
    }

    e.self_id = Array.isArray(e.self_id) ? e.self_id[0] : e?.self_id

    if (e?.receiver_id) {
      e.target_id = e.receiver_id
      delete e.receiver_id
    }

    e.user_id = e?.sender_id || e?.user_id

    //let config = await this.getConfig();
    // if (config) {
    //   if (e.user_id && config.masterQQ.includes(Number(e.user_id))) {
    //     e.isMaster = true;
    //   }

    //   /** 只关注主动at msg处理 */
    //   if (e.msg && e.isGroup) {
    //     let groupCfg = config.getGroup(e.group_id);
    //     let alias = groupCfg.botAlias;
    //     if (!Array.isArray(alias)) {
    //       alias = [alias];
    //     }
    //     for (let name of alias) {
    //       if (e.msg.startsWith(name)) {
    //         e.msg = lodash.trimStart(e.msg, name).trim();
    //         e.hasAlias = true;
    //         break;
    //       }
    //     }
    //   }
    // }
  }

  async getMaster() {
    if (env.CurEnv == "QQBot-YunZai") {
      const { default: yuncfg } = await import("../../../../lib/config/config.js")
      return yuncfg.masterQQ
    }
    return cfg.getConfig("bot").masterQQ
  }

  async initBot() {
    await this.loadBotPlugins()
  }

  //获取群历史消息
  async getGroupHistoryMsg(groupId, date) {
    return await MessageDB.getGroupMsgByDay(groupId, date)
  }
  //制作消息转发
  async makeForwardMsg(e, msg = [], dec = "", msgsscr = false) {
    console.log("make里的e", e)

    if (!Array.isArray(msg)) {
      msg = [msg]
    }
    let name = msgsscr ? e?.sender?.card || e?.user_id : Bot.nickname
    let id = e.user_id || Bot.uin

    if (e.isGroup) {
      try {
        let info = await e.getGroupMemberInfo(e.group_id, id || Bot.uin)
        name = info.card || info.nickname
      } catch (err) {
        logger.error(err)
      }
    }

    let userInfo = {
      user_id: id,
      nickname: name,
    }

    let forwardMsg = []
    for (let message of msg) {
      if (!message) {
        continue
      }
      const m = {
        ...userInfo,
      }
      message?.content ? (m.message = message.content) : (m.message = message)
      message?.time ? (m.time = message.time) : ""
      forwardMsg.push(m)
    }

    /** 制作转发内容 */
    try {
      if (e?.group?.makeForwardMsg) {
        forwardMsg = await e.group.makeForwardMsg(forwardMsg)
      } else if (e?.friend?.makeForwardMsg) {
        forwardMsg = await e.friend.makeForwardMsg(forwardMsg)
      } else {
        forwardMsg = await Bot.makeGroupForwardMsg(forwardMsg, e.group_id)
      }

      if (dec) {
        /** 处理描述 */

        if (typeof forwardMsg.data === "object") {
          let detail = forwardMsg.data?.meta?.detail
          if (detail) {
            detail.news = [{ text: dec }]
          }
        } else {
          forwardMsg.data = forwardMsg.data
            ?.replace(/\n/g, "")
            ?.replace(/<title color="#777777" size="26">(.+?)<\/title>/g, "___")
            ?.replace(/___+/, `<title color="#777777" size="26">${dec}</title>`)
        }
      }
    } catch (err) {
      logger.error(err)
    }

    return forwardMsg
  }
}
