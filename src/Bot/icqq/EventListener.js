import Filemage from "../../utils/Filemage.js";
import lodash from "lodash";
import pluginLoader from "./pluginLoader.js";

export default class EventListener {
  /**
   * 事件监听
   * @param data.prefix 事件名称前缀
   * @param data.event 监听的事件
   * @param data.once 是否只监听一次
   */
  constructor(data) {
    this.prefix = data.prefix || "";
    this.event = data.event;
    this.once = data.once || false;
    this.plugins = pluginLoader;
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
    this.client = client;
    pluginLoader.Bot = client;
    let filemag = new Filemage(
      process.cwd() + "/plugins/xunlu-core/src/Bot/icqq/Event",
    );
    let botenv = this.checkEnv();

    await pluginLoader.initBot();
    const files = filemag.GetfileList().filter((file) => file.endsWith(".js"));
    for (let File of files) {
      try {
        let listener = await import(`./Event/${File}`);

        /* eslint-disable new-cap */
        if (!listener.default) continue;
        listener = new listener.default();
        listener.client = this.client;
        const on = listener.once ? "once" : "on";

        if (lodash.isArray(listener.event)) {
          listener.event.forEach((type) => {
            const e = listener[type] ? type : "execute";
            this.client[on](listener.prefix + type, (event) => {
              this.bindEvent(event, botenv);
              return listener[e](event);
            });
          });
        } else {
          const e = listener[listener.event] ? listener.event : "execute";
          this.client[on](listener.prefix + listener.event, (event) => {
            this.bindEvent(event, botenv);
            return listener[e](event);
          });
        }
      } catch (e) {
        logger.mark(`监听事件错误：${File}`);
        logger.error(e);
      }
    }
  }

  checkEnv() {
    const Botkeys = Object.keys(this.client);

    //console.log(Object.keys(this.client));
    if (Botkeys.includes("lain")) {
      console.log(Object.keys(this.client[this.client.botQQ].adapter));
      this.bot = this.client[this.client.botQQ];
      return this.client[this.client.botQQ].adapter.name;
    }
  }

  dealEvent() {}

  bindEvent(e, env) {
    const targetE = e;
    if (env === "OneBotv11") {
      const recallMessage = ({ peer_id, message_seq, isGroup }) => {
        try {
          if (isGroup) {
            e.pickGroup(peer_id).recallMsg(e.message_id);
          } else {
            e.pickFriend(peer_id).recallMsg(e.message_id);
          }
        } catch (error) {
          console.log(error);
        }
      };
      e.sendGroupMessageReaction = ({ message_seq, reaction }) => {
        //console.log(this.bot);
        this.bot.sendApi("set_msg_emoji_like", {
          message_id: targetE.message_id,
          emoji_id: Number(reaction),
        });
      };

      e.recallMessage = recallMessage;
      e.sendMessage = async (ctx, message) => {
        if (ctx.group_id) {
          if (typeof ctx === "string") {
            // 私聊消息 - 将字符串ID转换为数字
            return await this.bot
              .pickFriend(ctx)
              .sendMsg(
                Array.isArray(message)
                  ? message
                  : [{ type: "text", data: { text: message } }],
              );
          } else if (ctx.group_id) {
            // 群聊消息 - 确保group_id是数字
            return await this.sendGroupMessage(
              Array.isArray(message)
                ? this.dealMsg(message)
                : typeof message === "string"
                  ? [{ type: "text", data: { text: message } }]
                  : [this.dealMsg(message)],
            );
          }
        }
      };
      e.renderImg = pluginLoader.renderImg;
      // e.getMsg = milkyAdapter.getMessage.bind(milkyAdapter);
      // e.getUserInfo = milkyAdapter.getUserProfile.bind(milkyAdapter);
      // e.acceptGroupRequest = milkyAdapter.acceptGroupRequest.bind(milkyAdapter);
      // e.rejectGroupRequest = milkyAdapter.rejectGroupRequest.bind(milkyAdapter);
    } else {
    }
  }

  dealMsg(msg) {
    console.log(msg);

    switch (msg.type) {
      case "text":
        break;
      case "image":
        msg = {
          type: "image",
          data: {
            file: msg.file || msg.data.uri || "",
            sub_type: "normal",
            summary: "你瞅个蛋",
          },
        };

        break;
      default:
        break;
    }
    return msg;
  }
}

export { ListenerLoader };
