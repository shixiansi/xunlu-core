import { applyUniversalBotApi } from "../../Bot/api/universal-bot-api.js"
import { UniversalMessage } from "../../Bot/message/universal-message.js"

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

export function preprocessMilkySegments(segments = [], { loginInfo } = {}) {
  if (!Array.isArray(segments)) return []

  return segments.map(seg => {
    if (seg?.type === "forward") {
      const forwardMeta = {
        forward_id: seg.data?.forward_id || "",
        title: seg.data?.title || "",
        summary: seg.data?.summary || "",
        preview: seg.data?.preview || [],
        message_seq: seg.data?.message_seq || "",
        peer_id: seg.data?.peer_id || "",
      }

      const messages = seg.data?.messages || []
      const validMessages =
        messages.length > 0
          ? messages.map(msg => ({
              ...msg,
              segments: Array.isArray(msg.segments) ? msg.segments : [],
            }))
          : [
              {
                user_id: loginInfo?.uin || loginInfo?.user_id || "0",
                sender_name: "系统提示",
                segments: [
                  {
                    type: "text",
                    data: {
                      text: `[转发消息ID: ${forwardMeta.forward_id}] ${forwardMeta.summary || "点击查看转发内容"}`,
                    },
                  },
                ],
              },
            ]

      return {
        type: "forward",
        data: {
          ...seg.data,
          ...forwardMeta,
          messages: validMessages,
        },
      }
    }

    if (seg?.type === "light_app") {
      try {
        const json = JSON.parse(seg.data?.json_payload || "{}")
        const lightAppMeta = {
          app_id: json.app || "",
          title: json.title || "",
          content: json.meta?.detail_1?.text || "",
          url: json.meta?.detail_1?.qqdocurl || "",
        }
        const text = `[轻应用${lightAppMeta.app_id}] ${lightAppMeta.title}：${lightAppMeta.content} ${lightAppMeta.url}`
        return {
          type: "text",
          data: {
            text,
            __light_app_meta__: lightAppMeta,
          },
        }
      } catch (e) {
        return {
          type: "text",
          data: {
            text: "[轻应用消息] 无法解析内容",
            __light_app_meta__: { error: e.message },
          },
        }
      }
    }

    return seg
  })
}

export function extractMilkyForwardMeta(segments = []) {
  return (Array.isArray(segments) ? segments : [])
    .filter(seg => seg?.type === "forward")
    .map(seg => ({
      forward_id: seg.data?.forward_id || "",
      title: seg.data?.title || "",
      summary: seg.data?.summary || "",
      preview: seg.data?.preview || [],
      message_seq: seg.data?.message_seq || "",
      peer_id: seg.data?.peer_id || "",
    }))
}

export function safeConvertMilkyToUniversal(protocol, segments) {
  try {
    return UniversalMessage.fromMilky(segments)
  } catch (convertError) {
    console.error(`[MilkyAdapter] 通用消息转换失败（协议：${protocol}）：`, convertError)
    const fallbackMsg = new UniversalMessage()
    for (const seg of Array.isArray(segments) ? segments : []) {
      if (seg?.type === "text") {
        fallbackMsg.addText(seg.data?.text || "")
      } else if (seg?.type === "forward") {
        fallbackMsg.addText(`[转发消息ID: ${seg.data?.forward_id}] ${seg.data?.summary}`)
      }
    }
    return fallbackMsg
  }
}

function normalizeInboundEventData(e, eventType) {
  if (eventType === "message_receive") {
    e.post_type = "message"
  } else if (String(eventType || "").includes("request")) {
    e.post_type = "request"
  } else {
    e.post_type = "notice"
  }

  e[`${e.post_type}_type`] = e.message_scene === "group" || e.group_id ? "group" : "private"
  const subTypeMap = {
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
    group_message_reaction: "emoji",
    group_mute: "ban",
    group_whole_mute: "allban",
    group_nudge: "poke",
    group_file_upload: "upload",
  }
  e.sub_type = eventType === "message_receive" ? "normal" : subTypeMap[eventType] || ""

  if (eventType === "group_join_request") {
    e.user_id = e.initiator_id
    e.flag = e.notification_seq
  }
}

/**
 * Milky binding 负责协议段预处理、bindEvent/runtimeBot 装饰和入站正规化。
 */
export function createMilkyBinding() {
  return {
    decorateBindEvent(
      target,
      { adapter, botCore, sendUniversalMessage, getForwardMessage, loginInfo } = {},
    ) {
      if (!target || !adapter) return target

      target.reply = botCore?.reply?.bind?.(botCore) || target.reply
      if (sendUniversalMessage) target.sendUniversalMessage = sendUniversalMessage
      if (getForwardMessage) target.getForwardMessage = getForwardMessage

      target.recallMessage = async ({ peer_id, message_seq, isGroup }) => {
        try {
          if (isGroup) {
            await adapter.recallGroupMessage({ group_id: peer_id, message_seq })
          } else {
            await adapter.recallPrivateMessage({ user_id: peer_id, message_seq })
          }
          console.debug?.(`[MilkyAdapter] 撤回消息 ${message_seq} 成功`)
        } catch (error) {
          console.error?.(`[MilkyAdapter] 撤回消息 ${message_seq} 失败：`, error)
        }
      }

      target.sendGroupMessageReaction = async input => {
        try {
          const group_id = Number(input?.group_id ?? input?.peer_id ?? target?.peer_id ?? 0)
          const message_seq = Number(
            input?.message_seq ?? input?.seq ?? target?.seq ?? target?.message_seq ?? 0,
          )
          const reactionRaw =
            input?.reaction ?? input?.emoji_id ?? input?.emojiId ?? input?.emoji ?? input?.id
          if (reactionRaw === undefined || reactionRaw === null || reactionRaw === "") {
            console.warn("[sendGroupMessageReaction] milky missing reaction:", input)
            return false
          }

          const is_add =
            input?.is_add !== undefined
              ? Boolean(input.is_add)
              : input?.isAdd !== undefined
                ? Boolean(input.isAdd)
                : true

          await adapter.sendGroupMessageReaction({
            group_id,
            message_seq,
            reaction: String(reactionRaw),
            is_add,
          })
          return true
        } catch (err) {
          console.warn("[sendGroupMessageReaction] milky failed:", err?.message || err)
          return false
        }
      }

      target.sendMessage = adapter.sendMsg.bind(adapter)
      target.getMsg = async seq => {
        try {
          const res = await adapter.getMessage({
            message_scene: target.message_scene,
            peer_id: target.peer_id,
            message_seq: seq,
          })

          const msgObj = res?.message
          const rawSegments = Array.isArray(msgObj)
            ? msgObj
            : Array.isArray(msgObj?.segments)
              ? msgObj.segments
              : []
          const processedSegments = preprocessMilkySegments(rawSegments || [], { loginInfo })
          const universalMessage = safeConvertMilkyToUniversal("milky", processedSegments)
          const message_scene = msgObj?.message_scene ?? target.message_scene
          const peer_id = msgObj?.peer_id ?? target.peer_id
          const message_seq = msgObj?.message_seq ?? seq
          const sender_id = msgObj?.sender_id
          const time = msgObj?.time

          return {
            protocol: "milky",
            adapterType: "Milky",
            ...(msgObj && typeof msgObj === "object" ? msgObj : {}),
            message_scene,
            peer_id,
            message_seq,
            seq: message_seq,
            ...(sender_id !== undefined ? { sender_id } : {}),
            ...(time !== undefined ? { time } : {}),
            segments: processedSegments,
            forwardMeta: extractMilkyForwardMeta(processedSegments),
            universalMessage,
            message: universalMessage.segments,
          }
        } catch (error) {
          console.error(`[MilkyAdapter] 获取消息 ${seq} 失败：`, error)
          return null
        }
      }

      target.getUserInfo = adapter.getUserProfile.bind(adapter)
      target.acceptGroupRequest = adapter.acceptGroupRequest.bind(adapter)
      target.rejectGroupRequest = adapter.rejectGroupRequest.bind(adapter)
      target.renderImg = botCore?.renderImg ? botCore.renderImg.bind(botCore) : target.renderImg
      target.makeGroupForwardMsg = botCore?.makeForwardMsg
        ? botCore.makeForwardMsg.bind(botCore)
        : target.makeGroupForwardMsg
      target.getGroupMemberList = async group_id => {
        let { members } = await adapter.getGroupMemberList.call(adapter, { group_id })
        return new Map(members.map(item => [item.user_id, item]))
      }
      target.getGroupMemberInfo = async (group_id, user_id) => {
        try {
          let { member } = await adapter.getGroupMemberInfo({
            group_id,
            user_id,
          })
          return member
        } catch (error) {
          console.error(`[MilkyAdapter] 获取群成员信息 ${user_id} 失败：`, error)
          return null
        }
      }

      return target
    },

    decorateRuntimeBot({ currentBot, loginInfo, adapter, botCore, getForwardMessage } = {}) {
      const runtimeBot =
        currentBot ||
        ({
          uin: loginInfo?.uin ?? loginInfo?.user_id,
          nickname: loginInfo?.nickname ?? "",
          ...adapter,
          adapterType: adapter?.adapterType,
          callApi: adapter.callApi.bind(adapter),
          sendApi: (adapter.sendApi ?? adapter.callApi).bind(adapter),
          sendMsg: adapter.sendMsg.bind(adapter),
          recallPrivateMessage: adapter.recallPrivateMessage.bind(adapter),
          recallGroupMessage: adapter.recallGroupMessage.bind(adapter),
          getLoginInfo: adapter.getLoginInfo.bind(adapter),
          getUserProfile: adapter.getUserProfile.bind(adapter),
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
          reply: botCore?.reply?.bind?.(botCore),
          getGroupChatHistory: botCore?.getGroupHistoryMsg?.bind?.(botCore),
          toUniversalMessage: (protocol, segments) => safeConvertMilkyToUniversal(protocol, segments),
          fromUniversalMessage: (universalMsg, protocol) => universalMsg.convertTo(protocol),
          getForwardMessage,
        })

      if (getForwardMessage) runtimeBot.getForwardMessage = getForwardMessage
      applyUniversalBotApi(runtimeBot, {
        bot: botCore,
        adapterHint: "milky",
        override: UNIVERSAL_OVERRIDE,
      })
      return runtimeBot
    },

    async normalizeInboundEvent(
      eventData,
      { eventType, adapterType = "Milky", loginInfo, selfId } = {},
    ) {
      if (!eventData || typeof eventData !== "object") return eventData

      eventData.adapterType = adapterType
      eventData.protocol = "milky"

      if (eventType === "message_receive") {
        const originalSegments = Array.isArray(eventData.segments) ? eventData.segments : []
        const processedSegments = preprocessMilkySegments(originalSegments, { loginInfo })
        eventData.rawSegments = originalSegments
        eventData.segments = processedSegments
        eventData.message = processedSegments
        eventData.forwardMeta = extractMilkyForwardMeta(processedSegments)
      }

      normalizeInboundEventData(eventData, eventType)
      if (eventData?.message_scene == "group") {
        eventData.group_id = eventData.peer_id
        eventData.user_id = eventData.sender_id
      } else if (eventData?.message_scene == "friend" || eventData?.message_scene == "temp") {
        eventData.user_id = eventData.sender_id
      }
      if (selfId !== undefined) eventData.self_id = selfId
      return eventData
    },
  }
}

export default createMilkyBinding
