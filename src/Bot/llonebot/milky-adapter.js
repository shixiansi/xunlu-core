import { MilkyClient } from "@saltify/milky-node-sdk";

/**
 * Milky标准的QQ机器人适配器
 * 完整实现milky标准的所有API接口，与icqq组件兼容
 */
class MilkyAdapter {
  constructor(config = {}) {
    this.config = {
      authority: config.authority || "localhost:8080",
      basePath: config.basePath || "/",
      accessToken: config.accessToken,
      useTLS: config.useTLS || false,
      useSSE: config.useSSE || false,
      ...config,
    };

    this.client = new MilkyClient(
      this.config.authority,
      this.config.basePath,
      this.config.accessToken,
      this.config.useTLS,
      this.config.useSSE,
    );

    console.log(this.client);

    //this.setupEventHandlers();

    // 标识适配器类型
    this.adapterType = "milky";
  }

  /**
   * 设置事件处理器
   */
  setupEventHandlers() {
    // 监听milky事件并转发到内部事件系统
    // 事件类型到中文描述的映射
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

    Object.keys(eventTypeMap).forEach((eventType) => {
      this.client.onEvent(eventType, (data) => {
        const eventName = eventTypeMap[eventType] || eventType;
        console.log(`[MilkyAdapter] 接收到事件: ${eventName}`, data);
      });
    });
  }
  /**
   * 系统API
   */

  // 获取登录信息
  async getLoginInfo() {
    return await this.client.callApi("get_login_info");
  }

  // 获取协议端信息
  async getImplInfo() {
    return await this.client.callApi("get_impl_info");
  }

  // 获取用户个人信息
  async getUserProfile(input) {
    return await this.client.callApi("get_user_profile", input);
  }

  /**
   * 好友API
   */

  // 获取好友列表
  async getFriendList(input) {
    return await this.client.callApi("get_friend_list", input);
  }

  // 获取好友信息
  async getFriendInfo(input) {
    return await this.client.callApi("get_friend_info", input);
  }

  // 发送好友戳一戳
  async sendFriendNudge(input) {
    return await this.client.callApi("send_friend_nudge", input);
  }

  // 发送名片点赞
  async sendProfileLike(input) {
    return await this.client.callApi("send_profile_like", input);
  }

  // 获取好友请求列表
  async getFriendRequests(input) {
    return await this.client.callApi("get_friend_requests", input);
  }

  // 同意好友请求
  async acceptFriendRequest(input) {
    return await this.client.callApi("accept_friend_request", input);
  }

  // 拒绝好友请求
  async rejectFriendRequest(input) {
    return await this.client.callApi("reject_friend_request", input);
  }

  /**
   * 群聊API
   */

  // 获取群列表
  async getGroupList(input) {
    return await this.client.callApi("get_group_list", input);
  }

  // 获取群信息
  async getGroupInfo(input) {
    return await this.client.callApi("get_group_info", input);
  }

  // 获取群成员列表
  async getGroupMemberList(input) {
    return await this.client.callApi("get_group_member_list", input);
  }

  // 获取群成员信息
  async getGroupMemberInfo(input) {
    return await this.client.callApi("get_group_member_info", input);
  }

  // 设置群名称
  async setGroupName(input) {
    return await this.client.callApi("set_group_name", input);
  }

  // 设置群头像
  async setGroupAvatar(input) {
    return await this.client.callApi("set_group_avatar", input);
  }

  // 设置群名片
  async setGroupMemberCard(input) {
    return await this.client.callApi("set_group_member_card", input);
  }

  // 设置群成员专属头衔
  async setGroupMemberSpecialTitle(input) {
    return await this.client.callApi("set_group_member_special_title", input);
  }

  // 设置群管理员
  async setGroupMemberAdmin(input) {
    return await this.client.callApi("set_group_member_admin", input);
  }

  // 设置群成员禁言
  async setGroupMemberMute(input) {
    return await this.client.callApi("set_group_member_mute", input);
  }

  // 设置群全员禁言
  async setGroupWholeMute(input) {
    return await this.client.callApi("set_group_whole_mute", input);
  }

  // 踢出群成员
  async kickGroupMember(input) {
    return await this.client.callApi("kick_group_member", input);
  }

  // 发送群戳一戳
  async sendGroupNudge(input) {
    return await this.client.callApi("send_group_nudge", input);
  }

  // 退出群
  async quitGroup(input) {
    return await this.client.callApi("quit_group", input);
  }

  // 获取群公告列表
  async getGroupAnnouncements(input) {
    return await this.client.callApi("get_group_announcements", input);
  }

  // 发送群公告
  async sendGroupAnnouncement(input) {
    return await this.client.callApi("send_group_announcement", input);
  }

  // 删除群公告
  async deleteGroupAnnouncement(input) {
    return await this.client.callApi("delete_group_announcement", input);
  }

  // 获取群精华消息列表
  async getGroupEssenceMessages(input) {
    return await this.client.callApi("get_group_essence_messages", input);
  }

  // 设置群精华消息
  async setGroupEssenceMessage(input) {
    return await this.client.callApi("set_group_essence_message", input);
  }

  // 发送群消息表情回应
  async sendGroupMessageReaction(input) {
    return await this.client.callApi("send_group_message_reaction", input);
  }

  // 获取群通知列表
  async getGroupNotifications(input) {
    return await this.client.callApi("get_group_notifications", input);
  }

  // 同意入群/邀请他人入群请求
  async acceptGroupRequest(input) {
    return await this.client.callApi("accept_group_request", input);
  }

  // 拒绝入群/邀请他人入群请求
  async rejectGroupRequest(input) {
    return await this.client.callApi("reject_group_request", input);
  }

  // 同意他人邀请自身入群
  async acceptGroupInvitation(input) {
    return await this.client.callApi("accept_group_invitation", input);
  }

  // 拒绝他人邀请自身入群
  async rejectGroupInvitation(input) {
    return await this.client.callApi("reject_group_invitation", input);
  }

  /**
   * 消息API
   */

  // 发送私聊消息
  async sendPrivateMessage(input) {
    return await this.client.callApi("send_private_message", input);
  }

  // 发送群聊消息
  async sendGroupMessage(input) {
    return await this.client.callApi("send_group_message", input);
  }

  // 撤回私聊消息
  async recallPrivateMessage(input) {
    return await this.client.callApi("recall_private_message", input);
  }

  // 撤回群聊消息
  async recallGroupMessage(input) {
    return await this.client.callApi("recall_group_message", input);
  }

  // 获取消息
  async getMessage(input) {
    return await this.client.callApi("get_message", input);
  }

  // 获取历史消息列表
  async getHistoryMessages(input) {
    return await this.client.callApi("get_history_messages", input);
  }

  // 标记消息为已读
  async markMessageAsRead(input) {
    return await this.client.callApi("mark_message_as_read", input);
  }

  // 获取临时资源链接
  async getResourceTempUrl(input) {
    return await this.client.callApi("get_resource_temp_url", input);
  }

  // 获取合并转发消息内容
  async getForwardedMessages(input) {
    return await this.client.callApi("get_forwarded_messages", input);
  }

  /**
   * 文件API
   */

  // 上传私聊文件
  async uploadPrivateFile(input) {
    return await this.client.callApi("upload_private_file", input);
  }

  // 上传群文件
  async uploadGroupFile(input) {
    return await this.client.callApi("upload_group_file", input);
  }

  // 获取私聊文件下载链接
  async getPrivateFileDownloadUrl(input) {
    return await this.client.callApi("get_private_file_download_url", input);
  }

  // 获取群文件下载链接
  async getGroupFileDownloadUrl(input) {
    return await this.client.callApi("get_group_file_download_url", input);
  }

  // 获取群文件列表
  async getGroupFiles(input) {
    return await this.client.callApi("get_group_files", input);
  }

  // 移动群文件
  async moveGroupFile(input) {
    return await this.client.callApi("move_group_file", input);
  }

  // 重命名群文件
  async renameGroupFile(input) {
    return await this.client.callApi("rename_group_file", input);
  }

  // 删除群文件
  async deleteGroupFile(input) {
    return await this.client.callApi("delete_group_file", input);
  }

  // 创建群文件夹
  async createGroupFolder(input) {
    return await this.client.callApi("create_group_folder", input);
  }

  // 重命名群文件夹
  async renameGroupFolder(input) {
    return await this.client.callApi("rename_group_folder", input);
  }

  // 删除群文件夹
  async deleteGroupFolder(input) {
    return await this.client.callApi("delete_group_folder", input);
  }

  /**
   * 事件监听
   */

  // 监听事件
  on(eventType, listener) {
    console.log(eventType, listener);

    this.client.onEvent(eventType, listener);
  }

  // 一次性监听事件
  once(eventType, listener) {
    this.client.onEvent(eventType, listener);
  }

  // 移除事件监听器
  off(eventType, listener) {
    this.client.onEvent(eventType, listener);
  }

  /**
   * 工具方法
   */

  // 获取Cookies
  async getCookies(input) {
    return await this.client.callApi("get_cookies", input);
  }

  // 获取CSRF Token
  async getCSRFToken() {
    return await this.client.callApi("get_csrf_token");
  }

  /**
   * 兼容性方法
   * 为了与现有icqq插件兼容
   */

  // 兼容现有的Bot调用方式
  async sendMsg(target, message) {
    console.log(target, message);

    if (typeof target === "string") {
      // 私聊消息 - 将字符串ID转换为数字
      return await this.sendPrivateMessage({
        user_id: Number(target),
        message: Array.isArray(message)
          ? message
          : [{ type: "text", data: { text: message } }],
      });
    } else if (target.group_id) {
      // 群聊消息 - 确保group_id是数字
      return await this.sendGroupMessage({
        group_id: Number(target.group_id),
        message: Array.isArray(message)
          ? message
          : typeof message === "string"
            ? [{ type: "text", data: { text: message } }]
            : [this.dealMilkyMsg(message)],
      });
    }
  }

  dealMilkyMsg(msg) {
    console.log(msg);

    switch (msg.type) {
      case "text":
        break;
      case "image":
        msg = {
          type: "image",
          data: {
            uri: msg.file || msg.data.uri || "",
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

  // 兼容pickUser方法
  pickUser(userId) {
    return {
      sendMsg: async (message) => {
        return await this.sendPrivateMessage({
          user_id: Number(userId),
          message: Array.isArray(message)
            ? message
            : [{ type: "text", data: { text: message } }],
        });
      },
    };
  }

  // 兼容pickGroup方法
  pickGroup(groupId) {
    return {
      sendMsg: async (message) => {
        return await this.sendGroupMessage({
          group_id: Number(groupId),
          message: Array.isArray(message)
            ? message
            : [{ type: "text", data: { text: message } }],
        });
      },
    };
  }

  /**
   * 资源清理
   */

  // 释放资源
  dispose() {
    this.client.dispose();
    this.eventEmitter.removeAllListeners();
  }

  [Symbol.dispose]() {
    // this.dispose();
  }
}

export default MilkyAdapter;
