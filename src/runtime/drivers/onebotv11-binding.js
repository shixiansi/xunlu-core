import { applyUniversalBotApi } from "../../Bot/api/universal-bot-api.js"
import { coerceToUniversalMessage, UniversalMessage } from "../../Bot/message/index.js"

const UNIVERSAL_OVERRIDE = [
  "getLoginInfo",
  "getFriendList",
  "getFriendInfo",
  "getGroupList",
  "getGroupInfo",
  "setGroupName",
  "setGroupMemberCard",
  "setGroupMemberAdmin",
  "setGroupMemberSpecialTitle",
  "setGroupWholeMute",
  "kickGroupMember",
  "quitGroup",
  "acceptFriendRequest",
  "rejectFriendRequest",
  "sendGroupMessageReaction",
  "acceptGroupRequest",
  "rejectGroupRequest",
  "getUserInfo",
  "getGroupMemberList",
  "getGroupMemberInfo",
  "setGroupMemberMute",
  "pickUser",
]

function normalizeInboundEventData(e) {
  switch (e.post_type) {
    case "notice": {
      const noticeMap = {
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
      const nativeNoticeType = e.notice_type
      e.notice_type = e.group_id ? "group" : "private"
      e.sub_type = noticeMap[nativeNoticeType] || nativeNoticeType
      if (nativeNoticeType === "group_admin") {
        e.is_set = e.sub_type === "set"
      }
      break
    }
    case "request":
      e.sub_type = e.request_type === "friend" ? "friend" : e.sub_type
      e.request_type = e.group_id ? "group" : "private"
      break
    case "message":
      e.sub_type = e.sub_type || "normal"
      break
  }
}

async function dealOnebotMessage(e) {
  if (!e || !e.message || typeof e.message === "string") return e
  e.protocol = e.protocol || "onebotv11"
  const rawSegments = Array.isArray(e.message) ? e.message : [e.message]
  e.universalMessage = UniversalMessage.fromOnebotV11(rawSegments)
  e.message = e.universalMessage.segments
  return e
}

/**
 * OneBotV11 binding 只处理协议相关的装饰和入站正规化。
 */
export function createOneBotV11Binding() {
  return {
    decorateBindEvent(target, { adapter, botCore } = {}) {
      if (!target || !adapter || !botCore) return target

      target.recallMessage = async ({ message_id }) => {
        try {
          await adapter.deleteMessage({ message_id })
          logger.debug?.(`[OneBotV11Adapter] 撤回消息 ${message_id} 成功`)
        } catch (error) {
          logger.error?.(`[OneBotV11Adapter] 撤回消息 ${message_id} 失败：`, error)
        }
      }

      target.sendGroupMessageReaction = async data => {
        try {
          await adapter.sendGroupMessageReaction.call(adapter, {
            message_id: data.message_id,
            emoji_id: Number(data.emoji_id ?? data.reaction),
          })
          return true
        } catch (err) {
          console.warn("[sendGroupMessageReaction] onebotv11 failed:", err?.message || err)
          return false
        }
      }

      target.sendMessage = async (ctx, msg) => {
        if (msg?.message) msg = msg.message

        const rawList = Array.isArray(msg) ? msg : msg ? [msg] : []
        if (rawList.some(i => i?.type === "node")) {
          return await adapter.sendMsg.call(adapter, ctx, rawList)
        }

        const universalMsg = coerceToUniversalMessage(msg)
        const onebotSegments = universalMsg.convertTo("onebotv11")
        return await adapter.sendMsg.call(adapter, ctx, onebotSegments)
      }

      target.getMsg = async message_id => {
        if (!message_id || isNaN(Number(message_id))) {
          console.warn(`[OneBotV11Adapter] 获取消息失败：无效的message_id ${message_id}`)
          return null
        }
        try {
          const msgData = await adapter.getMessage(Number(message_id))
          return await dealOnebotMessage({ ...msgData, protocol: "onebotv11" })
        } catch (error) {
          console.error(`[OneBotV11Adapter] 获取消息 ${message_id} 失败：`, error)
          return null
        }
      }

      target.getUserInfo = adapter.getFriendInfo.bind(adapter)
      target.acceptGroupRequest = adapter.acceptGroupRequest.bind(adapter)
      target.rejectGroupRequest = adapter.rejectGroupRequest.bind(adapter)
      target.renderImg = botCore.renderImg.bind(botCore)
      target.makeGroupForwardMsg = botCore.makeForwardMsg.bind(botCore)
      target.getGroupMemberList = async group_id => {
        let members = await adapter.getGroupMemberList.call(adapter, { group_id })
        return new Map(members.map(item => [item.user_id, item]))
      }
      target.getGroupMemberInfo = async (group_id, user_id) => {
        try {
          return await adapter.getGroupMemberInfo.bind(adapter)({ group_id, user_id })
        } catch (error) {
          console.error(`[OneBotV11Adapter] 获取群${group_id} 用户${user_id} 信息失败：`, error)
          return null
        }
      }

      return target
    },

    decorateRuntimeBot({ currentBot, loginInfo, adapter, botCore } = {}) {
      const runtimeBot =
        currentBot && typeof currentBot === "object"
          ? currentBot
          : {}

      Object.assign(runtimeBot, {
        ...adapter,
        uin: loginInfo?.user_id,
        self_id: loginInfo?.user_id,
        user_id: loginInfo?.user_id,
        nickname: loginInfo?.nickname,
        adapterType: adapter?.adapterType,
        callApi: adapter.callApi.bind(adapter),
        sendApi: (adapter.sendApi ?? adapter.callApi).bind(adapter),
        sendMsg: adapter.sendMsg.bind(adapter),
        deleteMessage: adapter.deleteMessage.bind(adapter),
        getLoginInfo: adapter.getLoginInfo.bind(adapter),
        getFriendList: adapter.getFriendList.bind(adapter),
        getFriendInfo: adapter.getFriendInfo.bind(adapter),
        acceptFriendRequest: adapter.acceptFriendRequest.bind(adapter),
        rejectFriendRequest: adapter.rejectFriendRequest.bind(adapter),
        getGroupList: adapter.getGroupList.bind(adapter),
        getGroupInfo: adapter.getGroupInfo.bind(adapter),
        getGroupMemberList: adapter.getGroupMemberList.bind(adapter),
        getGroupMemberInfo: adapter.getGroupMemberInfo.bind(adapter),
        setGroupName: adapter.setGroupName.bind(adapter),
        setGroupMemberCard: adapter.setGroupMemberCard.bind(adapter),
        setGroupMemberAdmin: adapter.setGroupMemberAdmin.bind(adapter),
        setGroupMemberSpecialTitle: adapter.setGroupMemberSpecialTitle.bind(adapter),
        setGroupMemberMute: adapter.setGroupMemberMute.bind(adapter),
        setGroupWholeMute: adapter.setGroupWholeMute.bind(adapter),
        kickGroupMember: adapter.kickGroupMember.bind(adapter),
        quitGroup: adapter.quitGroup.bind(adapter),
        sendGroupMessageReaction: adapter.sendGroupMessageReaction.bind(adapter),
        acceptGroupRequest: adapter.acceptGroupRequest.bind(adapter),
        rejectGroupRequest: adapter.rejectGroupRequest.bind(adapter),
        pickUser: adapter.pickUser.bind(adapter),
        pickGroup: adapter.pickGroup.bind(adapter),
        sendMessage: adapter.sendMsg.bind(adapter),
        makeGroupForwardMsg: adapter.makeForwardMsg.bind(adapter),
        reply: botCore.reply,
        getGroupChatHistory: botCore.getGroupHistoryMsg,
      })

      // Save raw references before applyUniversalBotApi overwrites them
      for (const methodName of UNIVERSAL_OVERRIDE) {
        if (typeof runtimeBot[methodName] === "function") {
          runtimeBot[`__xunlu_raw_${methodName}`] = runtimeBot[methodName]
        }
      }

      applyUniversalBotApi(runtimeBot, {
        bot: botCore,
        adapterHint: "onebotv11",
        override: UNIVERSAL_OVERRIDE,
      })
      return runtimeBot
    },

    async normalizeInboundEvent(eventData, { eventType } = {}) {
      if (!eventData || typeof eventData !== "object") return eventData
      eventData.adapterType = "OneBotV11"
      eventData.protocol = "onebotv11"
      if (eventType === "message" && Array.isArray(eventData.message)) {
        await dealOnebotMessage(eventData)
      }
      normalizeInboundEventData(eventData)
      return eventData
    },
  }
}

export default createOneBotV11Binding
