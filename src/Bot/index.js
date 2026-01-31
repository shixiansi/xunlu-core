import { loadPlugins } from "../lib/pluginLoader.js";
import Render from "../utils/render.js";
import path from "path";
import lodash from "lodash";
import schedule from "node-schedule";
import env from "../lib/env.js";
export default class Bot {
  constructor(config) {
    this.adapter = config.adapter;
    this.plugins = {};
    this.groupReply = {};
    this.privateReply = {};
  }

  async loadBotPlugins() {
    try {
      console.log(env.RootPath);

      const plugins = await loadPlugins(
        path.join(env.RootPath, "./src/plugins"),
      );

      for (const plugin of plugins) {
        console.log("加载插件:", plugin);
        await this.registerPlugin(plugin);
      }

      console.log("插件加载完成，注册命令:", Object.keys(this.plugins));
    } catch (error) {
      console.error("加载插件时出错:", error);
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
          let resPath = data.pluResPath;
          return {
            defaulthtml:
              env.RootPath + "/resources/html/common/" + "default.html",
            ...data,
            _res_path: resPath,
            RootPath: env.RootPath,
            version: "0.0.1",
            botname: process.env.xunLuEnv,
            imgType: "png",
          };
        },
      },
    );
  }

  async registerPlugin(plugin) {
    if (!plugin.implementation?.register) return;
    let idx = 1;
    const pluginAPI = {
      registerCommand: this.createCommandRegistrar(plugin.name, idx),
      contextReply: this.createContextReplyHandler(),
      setTask: this.collectTimerTasks(),
      callFnc: this.callPluginFnc(),
    };

    plugin.implementation.register(pluginAPI);
  }

  callPluginFnc() {
    return async (name, ctx) => {
      if (!ctx?.sendMsg) {
        ctx = {
          ...ctx,
          ...this.bindEvent,
        };
        delete ctx.reply;
        this.bindEvent.reply(ctx);
      }
      let p = Object.values(this.plugins).find((i) => i.id == name);
      await p.fnc.call(ctx, ctx);
    };
  }

  collectTimerTasks() {
    return (interval, task) => {
      const job = schedule.scheduleJob(interval, () => {
        task();
      });
      return job;
    };
  }

  createCommandRegistrar(pname, idx) {
    return (command, handler) => {
      if (!command || !handler) return;
      console.log(command, handler);
      const commands = Array.isArray(command) ? command : [command];
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
      };
      idx++;
    };
  }

  createContextReplyHandler() {
    return async (ctx, callback, endMsg) => {
      console.log("上下文回复的ctx", ctx);

      const isPrivate = ctx.isPrivate;
      const contextKey = isPrivate ? ctx.user_id : ctx.group_id;
      const userId = ctx.sender_id || ctx.user_id;
      console.log(contextKey);

      if (!contextKey || !userId) {
        console.warn("缺少上下文Key或用户ID");
        return;
      }

      // 初始化数据结构
      this.initContextStorage(isPrivate, contextKey, userId);

      // 处理现有上下文
      if (this.hasExistingContext(isPrivate, contextKey, userId, endMsg)) {
        this.addToContextQueue(isPrivate, contextKey, userId, callback, endMsg);
        return;
      }

      // 创建新上下文
      this.createNewContext(
        isPrivate,
        contextKey,
        userId,
        callback,
        endMsg,
        ctx,
      );
    };
  }

  initContextStorage(isPrivate, contextKey, userId) {
    const storage = isPrivate ? this.privateReply : this.groupReply;

    if (!storage[contextKey]) {
      storage[contextKey] = {};
    }
    if (!storage[contextKey][userId]) {
      storage[contextKey][userId] = [];
    }
  }

  hasExistingContext(isPrivate, contextKey, userId, endMsg) {
    const storage = isPrivate ? this.privateReply : this.groupReply;
    const userContexts = storage[contextKey]?.[userId];

    return (
      userContexts &&
      userContexts.length > 0 &&
      userContexts[0]?.endMsg &&
      endMsg
    );
  }

  addToContextQueue(isPrivate, contextKey, userId, callback, endMsg) {
    const storage = isPrivate ? this.privateReply : this.groupReply;

    const newContext = {
      cfnc: callback,
      endMsg,
      timer: null,
    };

    storage[contextKey][userId].unshift(newContext);
  }

  createNewContext(isPrivate, contextKey, userId, callback, endMsg, ctx) {
    const storage = isPrivate ? this.privateReply : this.groupReply;

    const newContext = {
      cfnc: callback,
      endMsg,
      timer: this.setupTimeout(isPrivate, contextKey, userId, endMsg, ctx),
    };

    storage[contextKey][userId].push(newContext);
  }

  setupTimeout(isPrivate, contextKey, userId, endMsg, ctx) {
    if (endMsg) return null;

    return setTimeout(() => {
      this.clearContext(isPrivate, contextKey, userId);
      if (ctx) {
        ctx.reply("时间超时，已取消。", true).catch(console.error);
      }
    }, 30000);
  }

  clearContext(isPrivate, contextKey, userId) {
    const storage = isPrivate ? this.privateReply : this.groupReply;

    if (storage[contextKey]?.[userId]) {
      delete storage[contextKey][userId];
    }
  }

  filtEvent(e, v) {
    let event = v.event.split(".");
    let eventMap = {
      message: ["post_type", "message_type", "sub_type"],
      notice: ["post_type", "notice_type", "sub_type"],
      request: ["post_type", "request_type", "sub_type"],
    };
    let newEvent = [];
    event.forEach((val, index) => {
      if (val === "*") {
        newEvent.push(val);
      } else if (eventMap[e.post_type]) {
        newEvent.push(e[eventMap[e.post_type][index]]);
      }
    });
    newEvent = newEvent.join(".");

    if (v.event == newEvent) return true;

    return false;
  }

  async deal(e) {
    await this.dealMsg(e);
    await this.reply(e);
    if (e.user_id == e.self_id) return;
    //处理上下文
    const isPrivate = e.isPrivate;
    const contextKey = isPrivate ? e.user_id : e.group_id;
    const userId = e.user_id;

    const hasContext = isPrivate
      ? this.privateReply?.[contextKey]?.[userId]
      : this.groupReply?.[contextKey]?.[userId];

    if (!hasContext) {
      // 没有上下文时处理普通命令
      return await this.processNormalCommands(e);
    }

    // 处理上下文
    const userContexts = isPrivate
      ? this.privateReply[contextKey][userId]
      : this.groupReply[contextKey][userId];

    const result = await this.processUserContexts(e, userContexts);

    // 根据处理结果清理上下文
    this.cleanupContexts(isPrivate, contextKey, userId, userContexts, result);
  }

  // 处理普通命令
  async processNormalCommands(e) {
    let regs = lodash.orderBy(
      Object.values(this.plugins),
      ["priority"],
      ["asc"],
    );

    for (let r of regs) {
      if (r.event && !this.filtEvent(e, r)) continue;

      if (new RegExp(r.reg).test(e?.msg?.trim())) {
        try {
          console.log("触发命令:", r);
          let res = await r.fnc(e);
          if (!res) continue;
          return res;
        } catch (err) {
          console.error("处理命令时出错:", err);
          // await e.reply("命令执行出错，请稍后重试").catch(console.error);
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
    };

    // 优先处理临时上下文（后进先出）
    for (let i = userContexts.length - 1; i >= 0; i--) {
      const context = userContexts[i];

      if (this.isContextValid(context)) {
        let res = await this.executeContextCallback(e, context);
        result.processed = true;

        // 检查是否需要结束上下文
        if (this.shouldEndContext(e, context) && res) {
          if (context.endMsg) {
            result.shouldCleanPersistent = true;
          } else {
            result.shouldCleanTemporary = true;
          }
          break;
        }
      }
    }

    return result;
  }

  // 检查上下文是否有效
  isContextValid(context) {
    return context && context.cfnc && typeof context.cfnc === "function";
  }

  // 执行上下文回调
  async executeContextCallback(e, context) {
    try {
      let res = await context.cfnc(e);
      // 清除超时计时器，因为用户已响应
      if (context.timer) {
        clearTimeout(context.timer);
        context.timer = null;
      }
      return res;
    } catch (error) {
      console.error("执行上下文回调出错:", error);
      await e.reply("处理出错，请重新操作").catch(console.error);
    }
  }

  // 检查是否需要结束上下文
  shouldEndContext(e, context) {
    // 如果有结束消息且匹配，或者临时上下文已执行一次
    return (context.endMsg && e.msg === context.endMsg) || !context.endMsg;
  }

  // 清理上下文
  cleanupContexts(isPrivate, contextKey, userId, userContexts, result) {
    if (!userContexts.length) return;

    const storage = isPrivate ? this.privateReply : this.groupReply;

    if (result.shouldCleanPersistent) {
      // 清理指令关闭的上下文
      this.removeContextsByType(storage, contextKey, userId, true);
    } else if (result.shouldCleanTemporary) {
      // 清理临时上下文
      this.removeLastTemporaryContext(storage, contextKey, userId);
    }

    // 如果所有上下文都处理完毕，清理整个用户条目
    if (!storage[contextKey]?.[userId]?.length) {
      this.cleanupUserContext(storage, contextKey, userId);
    }
  }

  // 按类型移除上下文
  removeContextsByType(storage, contextKey, userId, isPersistent) {
    if (!storage[contextKey]?.[userId]) return;

    storage[contextKey][userId] = storage[contextKey][userId].filter(
      (context) => {
        const shouldRemove = isPersistent ? context.endMsg : !context.endMsg;
        if (shouldRemove && context.timer) {
          clearTimeout(context.timer);
        }
        return !shouldRemove;
      },
    );
  }

  // 移除最后一个临时上下文
  removeLastTemporaryContext(storage, contextKey, userId) {
    if (!storage[contextKey]?.[userId]) return;

    const contexts = storage[contextKey][userId];
    for (let i = contexts.length - 1; i >= 0; i--) {
      if (!contexts[i].endMsg) {
        if (contexts[i].timer) {
          clearTimeout(contexts[i].timer);
        }
        contexts.splice(i, 1);
        break;
      }
    }
  }

  // 清理用户上下文
  cleanupUserContext(storage, contextKey, userId) {
    if (storage[contextKey]?.[userId]) {
      delete storage[contextKey][userId];
    }

    // 如果上下文键没有其他用户上下文，清理整个条目
    if (storage[contextKey] && Object.keys(storage[contextKey]).length === 0) {
      delete storage[contextKey];
    }
  }

  reply(e) {
    if (e.reply) {
      console.log("e.reply存在");

      e.replyNew = e.reply;
      /**
       * @param msg 发送的消息
       * @param quote 是否引用回复
       * @param data.recallMsg 群聊是否撤回消息，0-120秒，0不撤回
       * @param data.at 是否at用户
       */
      e.reply = async (msg = "", quote = false, data = {}) => {
        if (!msg) return false;

        /** 禁言中 */
        if (e.isGroup && e?.group?.mute_left > 0) return false;

        let { recallMsg = 0, at = "" } = data;

        if (at && e.isGroup) {
          let text = "";
          if (e?.sender?.card) {
            text = lodash.truncate(e.sender.card, { length: 10 });
          }
          if (at === true) {
            at = Number(e.user_id);
          } else if (!isNaN(at)) {
            if (e.isGuild) {
              text = e.sender?.nickname;
            } else {
              let info = e.group.pickMember(at).info;
              text = info?.card ?? info?.nickname;
            }
            text = lodash.truncate(text, { length: 10 });
          }

          if (Array.isArray(msg)) {
            msg = [segment.at(at, text), ...msg];
          } else {
            msg = [segment.at(at, text), msg];
          }
        }

        let wz = JSON.parse(await redis.get("qianyu:wz")) || "";
        let isOpen = await redis.get("qianyu:iswzopen");
        if (isOpen == 1) {
          if (Array.isArray(msg)) {
            let isImgMsg = false;
            let vaule = msg.some((item) => {
              if (item) {
                if (item.type === "image") {
                  isImgMsg = true;
                }
                if (
                  item.type == "text" &&
                  (item?.text.includes("尾缀已设置为") ||
                    item?.text.includes("尾缀已开启"))
                ) {
                  return true;
                }
              }
            });
            if (!vaule && !isImgMsg) {
              msg = Array.isArray(wz) ? [...msg, ...wz] : [...msg, wz];
            }
          } else if (
            typeof msg === "string" &&
            !msg.includes("尾缀已设置为") &&
            !msg.includes("尾缀已开启")
          ) {
            msg = Array.isArray(wz) ? [msg, ...wz] : msg + wz;
          }
        }
        let msgRes;
        try {
          msgRes = await e.replyNew(msg, quote);
        } catch (err) {
          if (typeof msg != "string") {
            if (msg.type == "image" && Buffer.isBuffer(msg?.file))
              msg.file = {};
            msg = lodash.truncate(JSON.stringify(msg), { length: 300 });
          }
          logger.error(`发送消息错误:${msg}`);
          logger.error(err);
        }

        // 频道一下是不是频道
        if (!e.isGuild && recallMsg > 0 && msgRes?.message_id) {
          if (e.isGroup) {
            setTimeout(
              () => e.group.recallMsg(msgRes.message_id),
              recallMsg * 1000,
            );
          } else if (e.friend) {
            setTimeout(
              () => e.friend.recallMsg(msgRes.message_id),
              recallMsg * 1000,
            );
          }
        }
        return msgRes;
      };
    } else {
      console.log("e.reply不存在");
      console.log(e);

      e.reply = async (msg = "", quote = false, data = {}) => {
        console.log("reply对象的e:", e);
        let msgRes;
        let { recallMsg = 0, at = "" } = data;
        if (!msg) return false;
        if (quote) {
          let new_msg = [
            {
              type: "reply",
              data: {
                message_seq: e.message_seq,
              },
            },
          ];
          Array.isArray(msg)
            ? new_msg.push(...msg)
            : new_msg.push({ type: "text", data: { text: msg } });
          msg = new_msg;
        }

        if (e.group_id) {
          msgRes = await e.sendMessage(e, msg).catch((err) => {
            console.log(err);
          });
        } else {
          console.log(e);

          let friend = e.friend;
          msgRes = await e.sendMessage(`${e.user_id}`, msg).catch((err) => {
            logger.warn(err);
          });
        }
        console.log("这是发送后的msgTes", msgRes);

        if (!e.isGuild && recallMsg > 0 && msgRes?.message_seq) {
          setTimeout(async () => {
            if (!msgRes?.message_seq) return;
            e.recallMessage({
              peer_id: e.peer_id,
              message_seq: msgRes.message_seq,
              isGroup: e.message_scene == "group",
            });
          }, recallMsg * 1000);
        }

        return msgRes;
      };
    }
  }

  async dealMsg(e) {
    if (e.msg) return;
    if (e.segments) {
      for (let val of e.segments) {
        console.log(val.data);

        switch (val.type) {
          case "text":
            /** 中文#转为英文 */
            val.data.text = val.data.text?.replace(/＃|井/g, "#").trim();
            if (e.msg) {
              e.msg += val.data.text;
            } else {
              e.msg = val.data.text?.trim();
            }
            break;
          case "image":
            if (!e.img) {
              e.img = [];
            }
            e.img.push(val.data.temp_url);
            break;
          case "mention":
            if (val.data.user_id == e.self_id) {
              e.atBot = true;
            } else {
              /** 多个at 以最后的为准 */
              e.at = val.data.user_id;
            }
            break;
          case "file":
            e.file = { name: val.data.file_name, fid: val.data.file_id };
            break;
        }
      }
    }

    e.logText = "";

    if (e.message_scene == "friend" || e.message_scene == "temp") {
      e.isPrivate = true;

      if (e.sender) {
        e.sender.card = e.sender.nickname;
      } else {
        e.sender = {
          card: e.friend?.nickname,
          nickname: e.friend?.nickname,
        };
      }

      e.logText = `[私聊][${e.sender.nickname}(${e.sender_id})]`;
    }

    if (e.message_scene == "group" || e.notice_type == "group") {
      e.group_id = e?.peer_id || e?.group_id;
      e.isGroup = true;
      e.sender = {
        card: e.group_member?.card,
        nickname: e.group_member?.nickname,
      };

      if (!e.group_name) e.group_name = e.group?.group_name;

      e.logText = `[${e.group_name}(${e.sender.card || e.sender.nickname})]`;
    } else if (e.detail_type === "guild") {
      e.isGuild = true;
    }

    if (e.sender_id == 1765629830) {
      e.isMaster = true;
    }

    e.user_id = e?.sender_id || e?.user_id;

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

  async initBot() {
    await this.loadBotPlugins();
  }

  //获取群历史消息（统一通过数据库获取，如果数据库不存在记录，再通过方法获取）
  static async getGroupHistoryMsg(groupId, count, before) {
    return await milkyAdapter.getGroupHistoryMsg({
      groupId,
      count,
      before,
    });
  }
  //制作消息转发
  static async forwardMsg(msgId, groupId, targetGroupId) {}
}
