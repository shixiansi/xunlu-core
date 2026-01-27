import llbot from "../index.js";
import MilkyAdapter from "../milky-adapter.js";
import config from "../../../lib/config.js";
import MessageDB from "../../../db/MessageDB.js";
let llbotCfg = config.getConfig("llbot") || {};
// 创建Milky适配器实例
const milkyAdapter = new MilkyAdapter({ ...llbotCfg });
if (!global.Bot) global.Bot = milkyAdapter;
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
          if (eventType == "message_receive" && data.data.peer_id) {
            console.log(data.data);
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

          console.log(`[MilkyAdapter] 接收到事件: ${eventName}`, data);
          data.data.sendMsg = milkyAdapter?.sendMsg.bind(milkyAdapter);
          llbot.deal({
            ...data.data,
            self_id: data.self_id,
            eventType: data.event_type,
          });
        });
      });
    } catch (e) {
      throw e;
    }
  }
}
