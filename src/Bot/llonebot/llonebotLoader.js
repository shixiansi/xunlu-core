//处理信息处理，添加发送方法
class llonebotLoader {
  reply(e) {}
  async dealMsg(e) {
    if (e.msg) return;
    if (e.message) {
      for (let val of e.message) {
        switch (val.type) {
          case "text":
            /** 中文#转为英文 */
            val.text = val.text.replace(/＃|井/g, "#").trim();
            if (e.msg) {
              e.msg += val.text;
            } else {
              e.msg = val.text.trim();
            }
            break;
          case "image":
            if (!e.img) {
              e.img = [];
            }
            e.img.push(val.url);
            break;
          case "at":
            if (val.qq == Bot.uin) {
              e.atBot = true;
            } else {
              /** 多个at 以最后的为准 */
              e.at = val.qq;
            }
            break;
          case "file":
            e.file = { name: val.name, fid: val.fid };
            break;
        }
      }
    }

    e.logText = "";

    if (e.message_type == "private" || e.notice_type == "friend") {
      e.isPrivate = true;

      if (e.sender) {
        e.sender.card = e.sender.nickname;
      } else {
        e.sender = {
          card: e.friend?.nickname,
          nickname: e.friend?.nickname,
        };
      }

      e.logText = `[私聊][${e.sender.nickname}(${e.user_id})]`;
    }

    if (e.message_type == "group" || e.notice_type == "group") {
      e.isGroup = true;
      if (e.sender) {
        e.sender.card = e.sender.card || e.sender.nickname;
      } else if (e.member) {
        e.sender = {
          card: e.member.card || e.member.nickname,
        };
      } else if (e.nickname) {
        e.sender = {
          card: e.nickname,
          nickname: e.nickname,
        };
      } else {
        e.sender = {
          card: "",
          nickname: "",
        };
      }

      if (!e.group_name) e.group_name = e.group?.name;

      e.logText = `[${e.group_name}(${e.sender.card})]`;
    } else if (e.detail_type === "guild") {
      e.isGuild = true;
    }
    let config = await this.getConfig();
    if (config) {
      if (e.user_id && config.masterQQ.includes(Number(e.user_id))) {
        e.isMaster = true;
      }

      /** 只关注主动at msg处理 */
      if (e.msg && e.isGroup) {
        let groupCfg = config.getGroup(e.group_id);
        let alias = groupCfg.botAlias;
        if (!Array.isArray(alias)) {
          alias = [alias];
        }
        for (let name of alias) {
          if (e.msg.startsWith(name)) {
            e.msg = lodash.trimStart(e.msg, name).trim();
            e.hasAlias = true;
            break;
          }
        }
      }
    }
  }

  deal(e) {
    //替换reply方法
  }
}
