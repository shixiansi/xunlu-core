import { attachStandardMessageApis } from "../../Bot/message/context.js"
import { applyUniversalBotApi } from "../../Bot/api/universal-bot-api.js"

export default async function attachApisMiddleware(ctx, next) {
  attachStandardMessageApis(ctx)

  const universalOverride = [
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
    "makeGroupForwardMsg",
    "makeGroupForwardMsgByUser",
    "getGroupChatHistory",
    "pickUser",
    "renderImg",
  ]

  if (typeof ctx.sendMessage === "function" && ctx.sendMessage.__xunlu_legacy_sendMessage) {
    universalOverride.unshift("sendMessage")
  }

  applyUniversalBotApi(ctx, {
    bot: ctx.baseBot,
    adapterHint: ctx.baseBot?.adapter,
    override: universalOverride,
    exclude: ["sendApi", "callApi"],
  })
  await next()
}
