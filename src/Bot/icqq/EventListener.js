import Filemage from "../../utils/Filemage.js"
import lodash from "lodash"
import pluginLoader from "./pluginLoader.js"
import getImageDisplay from "../../utils/imgdisplay.js"

const dealMsg = async (e, msg) => {
  console.log(msg)
  let imgdisplay
  if (e.user_id === e.self_id) {
    imgdisplay = await getImageDisplay()
  }

  switch (msg.type) {
    case "text":
      break
    case "image":
      msg = {
        type: "image",
        data: {
          file: msg.file || msg.data.uri || "",
          sub_type: "normal",
          summary: imgdisplay || msg.summary || "",
        },
      }
      break
    default:
      break
  }
  return msg
}

const sendMessage = async (ctx, message) => {
  if (ctx.group_id) {
    if (typeof ctx === "string") {
      // 私聊消息 - 将字符串ID转换为数字
      return await Bot.pickFriend(ctx).sendMsg(
        Array.isArray(message) ? message : [{ type: "text", data: { text: message } }],
      )
    } else if (ctx.group_id) {
      // 群聊消息 - 确保group_id是数字
      let msg = Array.isArray(message)
        ? await dealMsg(ctx, message)
        : typeof message === "string"
          ? [{ type: "text", data: { text: message } }]
          : [await dealMsg(ctx, message)]
      return await Bot.pickGroup(ctx.group_id).sendMsg(msg)
    }
  }
}

export default class EventListener {
  /**
   * 事件监听
   * @param data.prefix 事件名称前缀
   * @param data.event 监听的事件
   * @param data.once 是否只监听一次
   */
  constructor(data) {
    this.prefix = data.prefix || ""
    this.event = data.event
    this.once = data.once || false
    this.plugins = pluginLoader
  }
}

/**
 * 加载监听事件
 */
class ListenerLoader {
  /**
   * 监听事件加载
   * @param client Bot示例
   */
  async load(client) {
    console.log("原始bot", Bot)
    this.client = client
    pluginLoader.Bot = client
    let filemag = new Filemage(process.cwd() + "/plugins/xunlu-core/src/Bot/icqq/Event")
    let botenv = this.checkEnv()

    await pluginLoader.initBot()
    await pluginLoader.runMount()
    Bot.sendMessage = sendMessage
    Bot.makeForwardMsg = pluginLoader.makeForwardMsg
    Bot.renderImg = pluginLoader.renderImg
    const files = filemag.GetfileList().filter(file => file.endsWith(".js"))
    for (let File of files) {
      try {
        let listener = await import(`./Event/${File}`)

        /* eslint-disable new-cap */
        if (!listener.default) continue
        listener = new listener.default()
        listener.client = this.client
        const on = listener.once ? "once" : "on"

        if (lodash.isArray(listener.event)) {
          listener.event.forEach(type => {
            const e = listener[type] ? type : "execute"
            this.client[on](listener.prefix + type, event => {
              this.bindEvent(event, botenv)
              return listener[e](event)
            })
          })
        } else {
          const e = listener[listener.event] ? listener.event : "execute"
          this.client[on](listener.prefix + listener.event, event => {
            this.bindEvent(event, botenv)
            return listener[e](event)
          })
        }
      } catch (e) {
        logger.mark(`监听事件错误：${File}`)
        logger.error(e)
      }
    }
  }

  checkEnv() {
    const Botkeys = Object.keys(this.client)
    console.log(Object.keys(this.client))
    if (Botkeys.includes("lain")) {
      this.bot = this.client[this.client.botQQ]
      return this.client[this.client.botQQ].adapter.name
    } else if (Botkeys.includes("uin") && Botkeys.includes("QQNT")) {
      return "icqq"
    } else {
      return this.client[this.client.botQQ]?.adapter.name
    }
  }

  bindEvent(e, env) {
    e.adapterType = "icqq"
    const targetE = e
    if (env === "OneBotv11") {
      e.adapterType = "OneBotv11"
      const recallMessage = ({ peer_id, message_seq, isGroup }) => {
        try {
          if (isGroup) {
            e.pickGroup(peer_id).recallMsg(e.message_id)
          } else {
            e.pickFriend(peer_id).recallMsg(e.message_id)
          }
        } catch (error) {
          console.log(error)
        }
      }
      e.sendGroupMessageReaction = ({ message_seq, reaction }) => {
        Bot[Bot.botQQ].sendApi("set_msg_emoji_like", {
          message_id: targetE.message_id,
          emoji_id: Number(reaction),
        })
      }

      e.recallMessage = recallMessage
      e.sendMessage = sendMessage
      e.renderImg = pluginLoader.renderImg
      e.getMsg = async msg_id => {
        return await Bot[Bot.botQQ].sendApi("get_msg", {
          message_id: msg_id,
        })
      }
    } else if (env === "icqq") {
      const recallMessage = ({ peer_id, message_seq, isGroup }) => {
        try {
          if (isGroup) {
            Bot.pickGroup(peer_id).recallMsg(message_seq)
          } else {
            Bot.pickFriend(peer_id).recallMsg(message_seq)
          }
        } catch (error) {
          console.log(error)
        }
      }
      e.sendGroupMessageReaction = ({ message_seq, reaction }) => {
        Bot.pickGroup(targetE.group_id).setReaction(targetE.seq, Number(reaction))
      }
      e.recallMessage = recallMessage

      e.getMsg = async msg_id => {
        return await Bot.getMsg(msg_id)
      }
      e.getReplyMsg = async seq => {
        if (e.group_id) {
          return await Bot.pickGroup(e.group_id).getChatHistory(seq, 1)
        }
        return await Bot.pickFriend(e.user_id).getChatHistory(seq, 1)
      }
      e.getGroupMemberInfo = Bot.getGroupMemberInfo.bind(Bot)
    }
    e.sendMessage = sendMessage
    e.makeForwardMsg = pluginLoader.makeForwardMsg
    e.renderImg = pluginLoader.renderImg
    delete e.client
  }
}

export { ListenerLoader }
