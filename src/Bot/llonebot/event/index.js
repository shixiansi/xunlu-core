import llbot from "../index.js";
import MilkyAdapter from "../milky-adapter.js";
import config from "../../../lib/config.js";
import MessageDB from "../../../db/MessageDB.js";
let llbotCfg = config.getConfig("llbot") || {};
// 创建Milky适配器实例
const milkyAdapter = new MilkyAdapter({ ...llbotCfg });

export default class LLoneBotEventListener {
  async load() {
    try {
      const eventTypeMap = {
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
      };
      const loginInfo = await milkyAdapter.getLoginInfo();
      console.log(loginInfo);
      Bot.renderImg = llbot.renderImg;
      await llbot.initBot();
      Object.keys(eventTypeMap).forEach((eventType) => {
        milkyAdapter.on(eventType, async (data) => {
          const eventName = eventTypeMap[eventType] || eventType;
          if (eventType == "message_receive" && data.data.group) {
            //  console.log(data.data);
            let { message_seq, sender_id, time, segments, group_member } =
              data.data;
            await MessageDB.saveMessage(data.data.peer_id, {
              message_id: message_seq,
              user_id: sender_id,
              time: time,
              message: segments,
              sender: group_member,
            });
          }
          LLoneBotEventListener.bindMilkyFnc(data.data);
          // console.log(`[MilkyAdapter] 接收到事件: ${eventName}`, data);
          this.dealEvent(data.data, eventType);
          llbot.deal({
            ...data.data,
            self_id: data.self_id,
          });
        });
      });
    } catch (e) {
      throw e;
    }
  }

  dealEvent(e, eventType) {
    const subMap = {
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
      group_message_reaction: "emoj",
      group_mute: "ban",
      group_whole_mute: "allban",
      group_nudge: "poke",
      group_file_upload: "upload",
    };
    if (eventType === "message_receive") {
      e.post_type = "message";
    } else if (eventType.includes("request")) {
      e.post_type = "request";
    } else {
      e.post_type = "notice";
    }
    e[`${e.post_type}_type`] = e.message_scene == "group" ? "group" : "private";

    e.sub_type = eventType == "message_receive" ? "normal" : subMap[eventType];
  }

  static bindMilkyFnc(e) {
    const recallMessage = ({ peer_id, message_seq, isGroup }) => {
      try {
        if (isGroup) {
          milkyAdapter.recallGroupMessage({
            group_id: peer_id,
            message_seq,
          });
        } else {
          milkyAdapter.recallPrivateMessage({
            user_id: peer_id,
            message_seq,
          });
        }
      } catch (error) {
        console.log(error);
      }
    };
    e.sendGroupMessageReaction =
      milkyAdapter.sendGroupMessageReaction.bind(milkyAdapter);
    e.recallMessage = recallMessage;
    e.sendMsg = milkyAdapter?.sendMsg.bind(milkyAdapter);
    e.getMsg = milkyAdapter.getMessage.bind(milkyAdapter);
  }
}

if (!global.Bot) {
  LLoneBotEventListener.bindMilkyFnc(milkyAdapter);
  global.Bot = milkyAdapter;
}
