import BotBase from "../index.js";
class LloneBot extends BotBase {
  constructor() {
    super({ adapter: "llonebot" });
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
    if (!e.msg) return;

    for (let p of Object.keys(this.plugins)) {
      if (new RegExp(p).test(e.msg.trim())) {
        try {
          console.log("触发命令:", p);
          let res = await this.plugins[p](e);
          if (!res) continue;
          return res;
        } catch (err) {
          console.error("处理命令时出错:", err);
          await e.reply("命令执行出错，请稍后重试").catch(console.error);
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
      }
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
              recallMsg * 1000
            );
          } else if (e.friend) {
            setTimeout(
              () => e.friend.recallMsg(msgRes.message_id),
              recallMsg * 1000
            );
          }
        }
        return msgRes;
      };
    } else {
      e.reply = async (msg = "", quote = false, data = {}) => {
        console.log("reply对象的e:", e);
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
          return await e.sendMsg(e, msg).catch((err) => {
            console.log(err);
          });
        } else {
          console.log(e);

          let friend = e.friend;
          return await e.sendMsg(`${e.user_id}`, msg).catch((err) => {
            logger.warn(err);
          });
        }
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
      e.group_id = e.peer_id;
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

    e.user_id = e.sender_id;

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
}
export default new LloneBot();
