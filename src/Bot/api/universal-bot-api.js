import { coerceToUniversalMessage } from "../message/context.js"
import { UniversalMessage } from "../message/universal-message.js"
import {
  getMemberRoleFlagsWithFallback,
  hasAdminRole,
  hasOwnerRole,
} from "../role/index.js"
import {
  getFastBotRoleFlags,
  getFastMemberRoleFlags,
  getRawMethod,
  getRuntimeBotOrNull,
  getSelfIdFromTarget,
  getYunzaiSendApi,
  hasMilkyForwardSegments,
  hasOnebotNodeSegments,
  mapMilkyNotificationType,
  mapOnebotGroupRequestSubType,
  normalizeApiActionName,
  normalizeProtocol,
  normalizeTarget,
  rememberOutgoingGroupMessage,
  resolveProtocol,
  toInt,
  toKeyMap,
  toMemberMap,
  toSendTargetObject,
} from "./universal-bot-api-utils.js"

function getOnebotReactionSendApiCandidate(target) {
  if (!target || (typeof target !== "object" && typeof target !== "function")) return null

  if (typeof target.__xunlu_raw_sendApi === "function") {
    return target.__xunlu_raw_sendApi.bind(target)
  }

  if (target.__xunlu_takeover_state) return null

  if (typeof target.sendApi === "function" && !target.sendApi?.__xunlu_universal) {
    return target.sendApi.bind(target)
  }

  return null
}

function getOnebotReactionSendApi({ ctx, runtimeBot } = {}) {
  return (
    getOnebotReactionSendApiCandidate(ctx?.bot) ||
    getOnebotReactionSendApiCandidate(globalThis.Bot) ||
    getOnebotReactionSendApiCandidate(runtimeBot)
  )
}

function getDirectOnebotReactionMethod(runtimeBot) {
  if (!runtimeBot || (typeof runtimeBot !== "object" && typeof runtimeBot !== "function")) {
    return null
  }

  if (typeof runtimeBot.__xunlu_raw_sendGroupMessageReaction === "function") {
    return runtimeBot.__xunlu_raw_sendGroupMessageReaction.bind(runtimeBot)
  }

  if (runtimeBot.__xunlu_takeover_state) return null

  const adapterIdentity = String(
    runtimeBot?.adapterType ??
      runtimeBot?.adapter?.name ??
      runtimeBot?.adapter_name ??
      runtimeBot?.constructor?.name ??
      "",
  ).toLowerCase()
  if (!adapterIdentity.includes("onebot")) return null

  return typeof runtimeBot.sendGroupMessageReaction === "function"
    ? runtimeBot.sendGroupMessageReaction.bind(runtimeBot)
    : null
}

function collectMessageBotCandidates(...targets) {
  const out = []
  const seen = new Set()

  for (const target of targets) {
    if (!target || (typeof target !== "object" && typeof target !== "function")) continue
    if (seen.has(target)) continue
    seen.add(target)
    out.push(target)
  }

  return out
}

async function sendMessageViaCandidate(candidate, target, message, sendTarget) {
  if (!candidate || (typeof candidate !== "object" && typeof candidate !== "function")) {
    return { handled: false, result: null }
  }

  if (typeof candidate.sendMsg === "function") {
    return {
      handled: true,
      result: await candidate.sendMsg(sendTarget, message),
    }
  }

  if (target?.scene === "group") {
    const groupId = toInt(target.group_id) ?? target.group_id

    if (typeof candidate.sendGroupMsg === "function") {
      return {
        handled: true,
        result: await candidate.sendGroupMsg(groupId, message),
      }
    }

    if (typeof candidate.pickGroup === "function") {
      const group = candidate.pickGroup(groupId)
      if (group?.sendMsg) {
        return {
          handled: true,
          result: await group.sendMsg(message),
        }
      }
    }

    return { handled: false, result: null }
  }

  const userId = toInt(target?.user_id) ?? target?.user_id

  if (typeof candidate.sendPrivateMsg === "function") {
    return {
      handled: true,
      result: await candidate.sendPrivateMsg(userId, message),
    }
  }

  if (typeof candidate.pickFriend === "function") {
    const friend = candidate.pickFriend(userId)
    if (friend?.sendMsg) {
      return {
        handled: true,
        result: await friend.sendMsg(message),
      }
    }
  }

  if (typeof candidate.pickUser === "function") {
    const user = candidate.pickUser(userId)
    if (user?.sendMsg) {
      return {
        handled: true,
        result: await user.sendMsg(message),
      }
    }
  }

  return { handled: false, result: null }
}

export function createUniversalBotApi({ bot, adapterHint } = {}) {
  const api = {
    getBot() {
      return getRuntimeBotOrNull()
    },

    async sendApi(action, params = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      const normalizedAction = normalizeApiActionName(protocol, action)
      if (!normalizedAction) throw new Error("[sendApi] requires action")

      const rawSendApi = getRawMethod(runtimeBot, "sendApi", api.sendApi)
      if (rawSendApi) return await rawSendApi.call(runtimeBot, normalizedAction, params)

      const rawCallApi = getRawMethod(runtimeBot, "callApi", api.callApi)
      if (rawCallApi) return await rawCallApi.call(runtimeBot, normalizedAction, params)

      const sendApi = getYunzaiSendApi(runtimeBot)
      if (sendApi) return await sendApi(normalizedAction, params)

      throw new Error("[sendApi] API not available")
    },

    async callApi(action, params = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      const normalizedAction = normalizeApiActionName(protocol, action)
      if (!normalizedAction) throw new Error("[callApi] requires action")

      const rawCallApi = getRawMethod(runtimeBot, "callApi", api.callApi)
      if (rawCallApi) return await rawCallApi.call(runtimeBot, normalizedAction, params)

      const rawSendApi = getRawMethod(runtimeBot, "sendApi", api.sendApi)
      if (rawSendApi) return await rawSendApi.call(runtimeBot, normalizedAction, params)

      const sendApi = getYunzaiSendApi(runtimeBot)
      if (sendApi) return await sendApi(normalizedAction, params)

      throw new Error("[callApi] API not available")
    },

    async getLoginInfo() {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      if (protocol === "icqq") {
        const user_id = toInt(runtimeBot?.uin) ?? 0
        const nickname = runtimeBot?.nickname ? String(runtimeBot.nickname) : ""
        return { user_id, nickname }
      }

      const raw = getRawMethod(runtimeBot, "getLoginInfo", api.getLoginInfo)
      if (!raw) throw new Error("[getLoginInfo] API not available")
      return await raw.call(runtimeBot)
    },

    async getFriendList() {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      const raw = getRawMethod(runtimeBot, "getFriendList", api.getFriendList)
      if (!raw) throw new Error("[getFriendList] API not available")

      if (protocol === "icqq") {
        const res = await raw.call(runtimeBot)
        return res instanceof Map ? res : toKeyMap(res?.friends ?? res, "user_id")
      }

      const res = await raw.call(runtimeBot, {})
      return toKeyMap(res?.friends ?? res, "user_id")
    },

    async getFriendInfo(input = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      const userId = toInt(input.user_id ?? input.userId ?? ctx?.user_id ?? ctx?.sender_id)
      if (userId === undefined) throw new Error("[getFriendInfo] requires user_id")

      if (protocol === "icqq") {
        const rawGetStranger =
          runtimeBot?.__xunlu_raw_getStrangerInfo || runtimeBot?.getStrangerInfo || null
        if (rawGetStranger) return await rawGetStranger.call(runtimeBot, userId)

        const rawGetFriendInfo = getRawMethod(runtimeBot, "getFriendInfo", api.getFriendInfo)
        if (!rawGetFriendInfo) throw new Error("[getFriendInfo] icqq API not available")

        const res = await rawGetFriendInfo.call(runtimeBot, {
          user_id: userId,
          no_cache: Boolean(input.no_cache),
        })
        return res?.friend ?? res
      }

      const raw = getRawMethod(runtimeBot, "getFriendInfo", api.getFriendInfo)
      if (!raw) throw new Error("[getFriendInfo] API not available")

      const res = await raw.call(runtimeBot, { user_id: userId, no_cache: Boolean(input.no_cache) })
      return res?.friend ?? res
    },

    /**
     * 资料卡点赞（OneBot send_like / Milky send_profile_like）
     */
    async sendProfileLike(input = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      const user_id = toInt(input.user_id ?? input.userId ?? ctx?.user_id ?? ctx?.sender_id)
      if (user_id === undefined) throw new Error("[sendProfileLike] requires user_id")

      const timesRaw = input.times ?? input.count
      const times = Math.max(1, Math.floor(Number(timesRaw ?? 1)))

      const likeCandidates = collectMessageBotCandidates(ctx?.bot, runtimeBot, globalThis.Bot)

      const tryRawSendLike = async candidates => {
        for (const candidate of candidates) {
          const raw = getRawMethod(candidate, "sendLike", api.sendProfileLike)
          if (!raw) continue
          return await raw.call(candidate, user_id, times)
        }
        return undefined
      }

      const tryThumbUp = async candidates => {
        for (const candidate of candidates) {
          const thumbTarget =
            typeof candidate?.pickFriend === "function"
              ? candidate.pickFriend(user_id)
              : typeof candidate?.pickUser === "function"
                ? candidate.pickUser(user_id)
                : null
          if (!thumbTarget?.thumbUp) continue
          return await thumbTarget.thumbUp(times)
        }
        return undefined
      }

      if (protocol === "onebotv11") {
        const rawLikeResult = await tryRawSendLike(likeCandidates)
        if (rawLikeResult !== undefined) return rawLikeResult

        const thumbUpResult = await tryThumbUp(likeCandidates)
        if (thumbUpResult !== undefined) return thumbUpResult

        const sendApi = getOnebotReactionSendApi({ ctx, runtimeBot })
        if (sendApi) {
          return await sendApi("send_like", { user_id, times })
        }

        throw new Error("[sendProfileLike] API not available")
      }

      if (protocol === "milky") {
        try {
          return await api.sendApi.call(ctx ?? api, "send_profile_like", { user_id, count: times })
        } catch (error) {
          const msg = error?.message || String(error)
          if (/(missing|required|must be|缺少|字段|参数)/i.test(msg)) {
            return await api.sendApi.call(ctx ?? api, "send_profile_like", {
              user_id,
              count: times,
            })
          }
          throw error
        }
      }

      // icqq: prefer native client API, fallback to yunzai/onebot-style send_like when available.
      const rawLikeResult = await tryRawSendLike(likeCandidates)
      if (rawLikeResult !== undefined) {
        return rawLikeResult
      }

      const thumbUpResult = await tryThumbUp(likeCandidates)
      if (thumbUpResult !== undefined) {
        return thumbUpResult
      }

      try {
        return await api.sendApi.call(ctx ?? api, "send_like", { user_id, times })
      } catch (err) {
        throw new Error("[sendProfileLike] API not available")
      }
    },

    async getGroupList() {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      const raw = getRawMethod(runtimeBot, "getGroupList", api.getGroupList)
      if (!raw) throw new Error("[getGroupList] API not available")

      if (protocol === "icqq") {
        const res = await raw.call(runtimeBot)
        return res instanceof Map ? res : toKeyMap(res?.groups ?? res, "group_id")
      }

      const res = await raw.call(runtimeBot, {})
      return toKeyMap(res?.groups ?? res, "group_id")
    },

    async getGroupInfo(input = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      const groupId = toInt(input.group_id ?? input.groupId ?? ctx?.group_id)
      if (groupId === undefined) throw new Error("[getGroupInfo] requires group_id")

      const raw = getRawMethod(runtimeBot, "getGroupInfo", api.getGroupInfo)
      if (!raw) throw new Error("[getGroupInfo] API not available")

      if (protocol === "icqq") {
        return await raw.call(runtimeBot, groupId, Boolean(input.no_cache))
      }

      const res = await raw.call(runtimeBot, {
        group_id: groupId,
        no_cache: Boolean(input.no_cache),
      })
      return res?.group ?? res
    },

    async setGroupName(input = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      const groupId = toInt(input.group_id ?? input.groupId ?? ctx?.group_id)
      const groupName = input.group_name ?? input.groupName
      if (groupId === undefined) throw new Error("[setGroupName] requires group_id")
      if (groupName === undefined || groupName === null)
        throw new Error("[setGroupName] requires group_name")

      const raw = getRawMethod(runtimeBot, "setGroupName", api.setGroupName)
      if (protocol === "icqq") {
        if (!raw) throw new Error("[setGroupName] API not available")
        return await raw.call(runtimeBot, groupId, String(groupName))
      }

      if (!raw) throw new Error("[setGroupName] API not available")

      if (protocol === "milky") {
        return await raw.call(runtimeBot, { group_id: groupId, new_group_name: String(groupName) })
      }

      return await raw.call(runtimeBot, { group_id: groupId, group_name: String(groupName) })
    },

    async setGroupMemberCard(input = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      const groupId = toInt(input.group_id ?? input.groupId ?? ctx?.group_id)
      const userId = toInt(input.user_id ?? input.userId ?? ctx?.user_id ?? ctx?.sender_id)
      const card = input.card
      if (groupId === undefined || userId === undefined)
        throw new Error("[setGroupMemberCard] requires group_id/user_id")
      if (card === undefined || card === null) throw new Error("[setGroupMemberCard] requires card")

      if (protocol === "icqq") {
        const raw = getRawMethod(runtimeBot, "setGroupCard", api.setGroupMemberCard)
        if (!raw) throw new Error("[setGroupMemberCard] icqq API not available")
        return await raw.call(runtimeBot, groupId, userId, String(card))
      }

      const raw = getRawMethod(runtimeBot, "setGroupMemberCard", api.setGroupMemberCard)
      if (!raw) throw new Error("[setGroupMemberCard] API not available")
      return await raw.call(runtimeBot, { group_id: groupId, user_id: userId, card: String(card) })
    },

    async setGroupMemberAdmin(input = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      const groupId = toInt(input.group_id ?? input.groupId ?? ctx?.group_id)
      const userId = toInt(input.user_id ?? input.userId ?? ctx?.user_id ?? ctx?.sender_id)
      const enable = input.enable ?? input.is_set ?? input.isSet
      if (groupId === undefined || userId === undefined)
        throw new Error("[setGroupMemberAdmin] requires group_id/user_id")
      if (enable === undefined || enable === null)
        throw new Error("[setGroupMemberAdmin] requires enable")

      if (protocol === "icqq") {
        const raw = getRawMethod(runtimeBot, "setGroupAdmin", api.setGroupMemberAdmin)
        if (!raw) throw new Error("[setGroupMemberAdmin] icqq API not available")
        return await raw.call(runtimeBot, groupId, userId, Boolean(enable))
      }

      const raw = getRawMethod(runtimeBot, "setGroupMemberAdmin", api.setGroupMemberAdmin)
      if (!raw) throw new Error("[setGroupMemberAdmin] API not available")

      if (protocol === "milky") {
        return await raw.call(runtimeBot, {
          group_id: groupId,
          user_id: userId,
          is_set: Boolean(enable),
        })
      }

      return await raw.call(runtimeBot, {
        group_id: groupId,
        user_id: userId,
        enable: Boolean(enable),
      })
    },

    async setGroupMemberSpecialTitle(input = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      const groupId = toInt(input.group_id ?? input.groupId ?? ctx?.group_id)
      const userId = toInt(input.user_id ?? input.userId ?? ctx?.user_id ?? ctx?.sender_id)
      const specialTitle = input.special_title ?? input.specialTitle
      const duration = input.duration
      if (groupId === undefined || userId === undefined)
        throw new Error("[setGroupMemberSpecialTitle] requires group_id/user_id")
      if (specialTitle === undefined || specialTitle === null)
        throw new Error("[setGroupMemberSpecialTitle] requires special_title")

      if (protocol === "icqq") {
        const raw = getRawMethod(runtimeBot, "setGroupSpecialTitle", api.setGroupMemberSpecialTitle)
        if (!raw) throw new Error("[setGroupMemberSpecialTitle] icqq API not available")
        return await raw.call(runtimeBot, groupId, userId, String(specialTitle), duration)
      }

      const raw = getRawMethod(
        runtimeBot,
        "setGroupMemberSpecialTitle",
        api.setGroupMemberSpecialTitle,
      )
      if (!raw) throw new Error("[setGroupMemberSpecialTitle] API not available")

      if (protocol === "milky") {
        // milky-types 不支持 duration
        return await raw.call(runtimeBot, {
          group_id: groupId,
          user_id: userId,
          special_title: String(specialTitle),
        })
      }

      return await raw.call(runtimeBot, {
        group_id: groupId,
        user_id: userId,
        special_title: String(specialTitle),
        ...(duration !== undefined ? { duration: Number(duration) } : {}),
      })
    },

    async setGroupWholeMute(input = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      const groupId = toInt(input.group_id ?? input.groupId ?? ctx?.group_id)
      const enable = input.enable ?? input.is_mute ?? input.isMute
      if (groupId === undefined) throw new Error("[setGroupWholeMute] requires group_id")
      if (enable === undefined || enable === null)
        throw new Error("[setGroupWholeMute] requires enable")

      if (protocol === "icqq") {
        const raw = getRawMethod(runtimeBot, "setGroupWholeBan", api.setGroupWholeMute)
        if (!raw) throw new Error("[setGroupWholeMute] icqq API not available")
        return await raw.call(runtimeBot, groupId, Boolean(enable))
      }

      const raw = getRawMethod(runtimeBot, "setGroupWholeMute", api.setGroupWholeMute)
      if (!raw) throw new Error("[setGroupWholeMute] API not available")

      if (protocol === "milky") {
        return await raw.call(runtimeBot, { group_id: groupId, is_mute: Boolean(enable) })
      }

      return await raw.call(runtimeBot, { group_id: groupId, enable: Boolean(enable) })
    },

    async kickGroupMember(input = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      const groupId = toInt(input.group_id ?? input.groupId ?? ctx?.group_id)
      const userId = toInt(input.user_id ?? input.userId ?? ctx?.user_id ?? ctx?.sender_id)
      const reject_add_request = input.reject_add_request ?? input.rejectAddRequest
      const message = input.message
      if (groupId === undefined || userId === undefined)
        throw new Error("[kickGroupMember] requires group_id/user_id")

      if (protocol === "icqq") {
        const raw = getRawMethod(runtimeBot, "setGroupKick", api.kickGroupMember)
        if (!raw) throw new Error("[kickGroupMember] icqq API not available")
        return await raw.call(runtimeBot, groupId, userId, Boolean(reject_add_request), message)
      }

      const raw = getRawMethod(runtimeBot, "kickGroupMember", api.kickGroupMember)
      if (!raw) throw new Error("[kickGroupMember] API not available")

      return await raw.call(runtimeBot, {
        group_id: groupId,
        user_id: userId,
        ...(reject_add_request !== undefined
          ? { reject_add_request: Boolean(reject_add_request) }
          : {}),
      })
    },

    async quitGroup(input = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      const groupId = toInt(input.group_id ?? input.groupId ?? ctx?.group_id)
      const is_dismiss = input.is_dismiss ?? input.isDismiss
      if (groupId === undefined) throw new Error("[quitGroup] requires group_id")

      if (protocol === "icqq") {
        const raw = getRawMethod(runtimeBot, "setGroupLeave", api.quitGroup)
        if (!raw) throw new Error("[quitGroup] icqq API not available")
        return await raw.call(runtimeBot, groupId)
      }

      const raw = getRawMethod(runtimeBot, "quitGroup", api.quitGroup)
      if (!raw) throw new Error("[quitGroup] API not available")

      if (protocol === "milky") {
        return await raw.call(runtimeBot, { group_id: groupId })
      }

      return await raw.call(runtimeBot, {
        group_id: groupId,
        ...(is_dismiss !== undefined ? { is_dismiss: Boolean(is_dismiss) } : {}),
      })
    },

    async acceptFriendRequest(input = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      if (protocol === "milky") {
        const raw = getRawMethod(runtimeBot, "acceptFriendRequest", api.acceptFriendRequest)
        if (!raw) throw new Error("[acceptFriendRequest] milky API not available")
        const initiator_uid = input.initiator_uid ?? input.initiatorUid
        if (!initiator_uid) throw new Error("[acceptFriendRequest] milky requires initiator_uid")
        const is_filtered =
          input.is_filtered !== undefined
            ? Boolean(input.is_filtered)
            : input.isFiltered !== undefined
              ? Boolean(input.isFiltered)
              : false
        const reason = input.reason
        return await raw.call(runtimeBot, {
          initiator_uid: String(initiator_uid),
          is_filtered,
          ...(reason !== undefined ? { reason: String(reason) } : {}),
        })
      }

      const flag = input.flag
      if (!flag) throw new Error("[acceptFriendRequest] requires flag")

      if (protocol === "onebotv11") {
        const raw = getRawMethod(runtimeBot, "acceptFriendRequest", api.acceptFriendRequest)
        if (!raw) throw new Error("[acceptFriendRequest] onebotv11 API not available")
        const remark = input.remark ?? input.reason
        return await raw.call(runtimeBot, {
          flag,
          ...(remark !== undefined ? { remark: String(remark) } : {}),
        })
      }

      // icqq
      const raw = getRawMethod(runtimeBot, "setFriendAddRequest", api.acceptFriendRequest)
      if (!raw) throw new Error("[acceptFriendRequest] icqq API not available")
      const remark = input.remark ?? input.reason
      return await raw.call(runtimeBot, flag, true, remark, input.block)
    },

    async rejectFriendRequest(input = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      if (protocol === "milky") {
        const raw = getRawMethod(runtimeBot, "rejectFriendRequest", api.rejectFriendRequest)
        if (!raw) throw new Error("[rejectFriendRequest] milky API not available")
        const initiator_uid = input.initiator_uid ?? input.initiatorUid
        if (!initiator_uid) throw new Error("[rejectFriendRequest] milky requires initiator_uid")
        const is_filtered =
          input.is_filtered !== undefined
            ? Boolean(input.is_filtered)
            : input.isFiltered !== undefined
              ? Boolean(input.isFiltered)
              : false
        const reason = input.reason
        return await raw.call(runtimeBot, {
          initiator_uid: String(initiator_uid),
          is_filtered,
          ...(reason !== undefined ? { reason: String(reason) } : {}),
        })
      }

      const flag = input.flag
      if (!flag) throw new Error("[rejectFriendRequest] requires flag")

      if (protocol === "onebotv11") {
        const raw = getRawMethod(runtimeBot, "rejectFriendRequest", api.rejectFriendRequest)
        if (!raw) throw new Error("[rejectFriendRequest] onebotv11 API not available")
        const remark = input.remark ?? input.reason
        return await raw.call(runtimeBot, {
          flag,
          ...(remark !== undefined ? { remark: String(remark) } : {}),
        })
      }

      // icqq
      const raw = getRawMethod(runtimeBot, "setFriendAddRequest", api.rejectFriendRequest)
      if (!raw) throw new Error("[rejectFriendRequest] icqq API not available")
      const remark = input.remark ?? input.reason
      return await raw.call(runtimeBot, flag, false, remark, input.block)
    },

    pickUser(user_id) {
      const runtimeBot = getRuntimeBotOrNull()
      const rawPickUser = runtimeBot?.__xunlu_raw_pickUser || null
      if (rawPickUser) return rawPickUser.call(runtimeBot, user_id)

      // 避免：当该封装被挂到 global Bot 自己身上时递归调用自身
      if (runtimeBot?.pickUser && runtimeBot.pickUser !== api.pickUser)
        return runtimeBot.pickUser(user_id)
      if (runtimeBot?.pickFriend) return runtimeBot.pickFriend(user_id)
      throw new Error("[pickUser] API not available")
    },

    pickGroup(group_id) {
      const runtimeBot = getRuntimeBotOrNull()
      const rawPickGroup = runtimeBot?.__xunlu_raw_pickGroup || null
      if (rawPickGroup) return rawPickGroup.call(runtimeBot, group_id)

      if (runtimeBot?.pickGroup && runtimeBot.pickGroup !== api.pickGroup)
        return runtimeBot.pickGroup(group_id)
      throw new Error("[pickGroup] API not available")
    },

    async sendMessage(target, message) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      const t = normalizeTarget(target, ctx)
      const sendTarget = toSendTargetObject(t)
      const candidateBots = collectMessageBotCandidates(ctx?.bot, runtimeBot, globalThis.Bot)

      // 原生 onebot node 转发：必须透传，否则会被转换成文本。
      // 这里不能只依赖 protocol 判定，因为某些运行时上下文（如定时任务）
      // 可能拿不到准确协议，但消息结构本身已经是原生转发节点。
      if (hasOnebotNodeSegments(message)) {
        for (const candidate of candidateBots) {
          const attempt = await sendMessageViaCandidate(candidate, t, message, sendTarget)
          if (!attempt?.handled) continue
          if (attempt.result === false) continue
          rememberOutgoingGroupMessage(sendTarget, message, { ctx, runtimeBot })
          return attempt.result
        }

        throw new Error("[sendMessage] onebot node forward requires sendMsg or pickGroup/pickFriend")
      }

      // 原生 milky forward 段：如果已经是原生 forward 格式则直接透传。
      if (hasMilkyForwardSegments(message)) {
        for (const candidate of candidateBots) {
          const attempt = await sendMessageViaCandidate(candidate, t, message, sendTarget)
          if (!attempt?.handled) continue
          if (attempt.result === false) continue
          rememberOutgoingGroupMessage(sendTarget, message, { ctx, runtimeBot })
          return attempt.result
        }
        throw new Error("[sendMessage] milky forward requires sendMsg")
      }

      const universalMsg =
        message instanceof UniversalMessage ? message : coerceToUniversalMessage(message)
      const outSegments = universalMsg.convertTo(protocol)

      for (const candidate of candidateBots) {
        const attempt = await sendMessageViaCandidate(candidate, t, outSegments, sendTarget)
        if (!attempt?.handled) continue
        if (attempt.result === false) continue
        rememberOutgoingGroupMessage(sendTarget, outSegments, { ctx, runtimeBot })
        return attempt.result
      }

      // icqq/yunzai fallback
      if (protocol === "icqq" && runtimeBot) {
        if (t.scene === "group" && runtimeBot.pickGroup) {
          const res = await runtimeBot.pickGroup(toInt(t.group_id) ?? t.group_id).sendMsg(outSegments)
          rememberOutgoingGroupMessage(sendTarget, outSegments, { ctx, runtimeBot })
          return res
        }
        if (runtimeBot.pickFriend) {
          return await runtimeBot.pickFriend(toInt(t.user_id) ?? t.user_id).sendMsg(outSegments)
        }
        if (runtimeBot.pickUser) {
          return await runtimeBot.pickUser(toInt(t.user_id) ?? t.user_id).sendMsg(outSegments)
        }
      }

      throw new Error("[sendMessage] API not available")
    },

    async recallMessage(input = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      const peerId =
        input.group_id ??
        input.peer_id ??
        (input.isGroup ? undefined : input.user_id) ??
        ctx?.peer_id ??
        ctx?.group_id ??
        ctx?.user_id
      const isGroup = Boolean(
        input.isGroup ?? input.group_id ?? ctx?.group_id ?? ctx?.message_scene === "group",
      )

      const messageSeq = toInt(input.message_seq ?? input.seq ?? input.message_id)
      const messageId =
        input.message_id ?? (messageSeq !== undefined ? String(messageSeq) : undefined)

      if (protocol === "milky") {
        if (messageSeq === undefined)
          throw new Error("[recallMessage] milky requires message_seq/seq")
        if (!peerId) throw new Error("[recallMessage] milky requires peer_id/group_id/user_id")
        if (isGroup && runtimeBot?.recallGroupMessage) {
          return await runtimeBot.recallGroupMessage({
            group_id: Number(peerId),
            message_seq: messageSeq,
          })
        }
        if (!isGroup && runtimeBot?.recallPrivateMessage) {
          return await runtimeBot.recallPrivateMessage({
            user_id: Number(peerId),
            message_seq: messageSeq,
          })
        }
      }

      if (protocol === "onebotv11") {
        const mid = toInt(messageId ?? input.message_seq ?? input.seq)
        if (mid === undefined) throw new Error("[recallMessage] onebotv11 requires message_id")
        if (runtimeBot?.deleteMessage) return await runtimeBot.deleteMessage({ message_id: mid })
      }

      // icqq
      if (!peerId) throw new Error("[recallMessage] icqq requires peer_id/group_id/user_id")
      const seq = messageSeq
      if (seq === undefined) throw new Error("[recallMessage] icqq requires message_seq/seq")

      if (isGroup && runtimeBot?.pickGroup)
        return await runtimeBot.pickGroup(Number(peerId)).recallMsg(seq)
      if (!isGroup && runtimeBot?.pickFriend)
        return await runtimeBot.pickFriend(Number(peerId)).recallMsg(seq)
      if (!isGroup && runtimeBot?.pickUser)
        return await runtimeBot.pickUser(Number(peerId)).recallMsg(seq)

      throw new Error("[recallMessage] API not available")
    },

    async sendGroupMessageReaction(input = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      const groupId = toInt(input.group_id ?? input.peer_id ?? ctx?.group_id ?? ctx?.peer_id)
      const messageId = input.message_id ?? ctx?.message_id
      const messageSeq = toInt(input.message_seq ?? input.seq ?? ctx?.seq ?? ctx?.message_seq)
      const reactionRaw =
        input.reaction ?? input.emoji_id ?? input.emojiId ?? input.emoji ?? input.id ?? undefined

      if (protocol === "milky") {
        const raw =
          runtimeBot?.__xunlu_raw_sendGroupMessageReaction ||
          runtimeBot?.sendGroupMessageReaction ||
          null
        if (!raw) throw new Error("[sendGroupMessageReaction] milky API not available")
        if (!groupId) throw new Error("[sendGroupMessageReaction] milky requires group_id")
        if (messageSeq === undefined)
          throw new Error("[sendGroupMessageReaction] milky requires message_seq")
        if (reactionRaw === undefined || reactionRaw === null || reactionRaw === "")
          throw new Error("[sendGroupMessageReaction] milky requires reaction")

        const is_add =
          input?.is_add !== undefined
            ? Boolean(input.is_add)
            : input?.isAdd !== undefined
              ? Boolean(input.isAdd)
              : true

        try {
          return await raw.call(runtimeBot, {
            group_id: groupId,
            message_seq: messageSeq,
            reaction: String(reactionRaw),
            is_add,
          })
        } catch (err) {
          const msg = err?.message || String(err)
          // LLoneBot/Milky implementations may not support this API
          if (/retcode\s*404/i.test(msg) && /api not found/i.test(msg)) {
            throw new Error("[sendGroupMessageReaction] milky API not available")
          }
          throw err
        }
      }

      if (protocol === "onebotv11") {
        if (!messageId) throw new Error("[sendGroupMessageReaction] onebotv11 requires message_id")
        if (reactionRaw === undefined || reactionRaw === null || reactionRaw === "")
          throw new Error("[sendGroupMessageReaction] onebotv11 requires reaction")

        const params = {
          message_id: messageId,
          emoji_id: Number(reactionRaw),
        }

        const sendApi = getOnebotReactionSendApi({ ctx, runtimeBot })
        if (sendApi) {
          return await sendApi("set_msg_emoji_like", params)
        }

        const raw = getDirectOnebotReactionMethod(runtimeBot)
        if (raw) {
          return await raw(params)
        }

        throw new Error("[sendGroupMessageReaction] onebotv11 API not available")
      }

      // icqq: QQNT setReaction / OneBot set_msg_emoji_like
      if (!groupId) throw new Error("[sendGroupMessageReaction] icqq requires group_id")
      if (messageSeq === undefined)
        throw new Error("[sendGroupMessageReaction] icqq requires message_seq")
      if (reactionRaw === undefined || reactionRaw === null || reactionRaw === "")
        throw new Error("[sendGroupMessageReaction] icqq requires reaction")

      if (runtimeBot?.pickGroup) {
        const group = runtimeBot.pickGroup(groupId)
        if (group?.setReaction) {
          return await group.setReaction(messageSeq, Number(reactionRaw))
        }
      }

      const sendApi = getYunzaiSendApi(runtimeBot)
      if (sendApi && messageId) {
        return await sendApi("set_msg_emoji_like", {
          message_id: messageId,
          emoji_id: Number(reactionRaw),
        })
      }

      throw new Error("[sendGroupMessageReaction] API not available")
    },

    async getUserInfo(input = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      const userId = toInt(input.user_id ?? input.userId ?? ctx?.user_id ?? ctx?.sender_id)
      if (userId === undefined) throw new Error("[getUserInfo] requires user_id")

      try {
        if (protocol === "milky") {
          if (runtimeBot?.getUserProfile)
            return await runtimeBot.getUserProfile({ user_id: userId })
        } else if (protocol === "onebotv11") {
          if (runtimeBot?.getFriendInfo)
            return await runtimeBot.getFriendInfo({
              user_id: userId,
              no_cache: Boolean(input.no_cache),
            })
        } else {
          if (runtimeBot?.getStrangerInfo) return await runtimeBot.getStrangerInfo(userId)
          if (runtimeBot?.getFriendInfo) return await runtimeBot.getFriendInfo({ user_id: userId })
        }
      } catch (err) {
        console.warn("[getUserInfo] upstream failed:", err?.message || err)
      }

      return { user_id: userId, nickname: String(userId) }
    },

    async getGroupMemberList(group_id) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      const groupInput =
        group_id && typeof group_id === "object" && !Array.isArray(group_id) ? group_id : null
      const gid = toInt(groupInput?.group_id ?? groupInput?.groupId ?? group_id ?? ctx?.group_id)
      if (gid === undefined) throw new Error("[getGroupMemberList] requires group_id")

      let lastError = null

      // icqq: prefer native getMemberMap
      if (protocol === "icqq" && runtimeBot?.pickGroup) {
        try {
          const group = runtimeBot.pickGroup(gid)
          if (group?.getMemberMap) return await group.getMemberMap()
        } catch (err) {
          lastError = err
        }
      }

      const rawGetGroupMemberList = getRawMethod(
        runtimeBot,
        "getGroupMemberList",
        api.getGroupMemberList,
      )
      if (rawGetGroupMemberList) {
        try {
          const res =
            protocol === "icqq"
              ? await rawGetGroupMemberList.call(runtimeBot, gid)
              : await rawGetGroupMemberList.call(runtimeBot, { group_id: gid })
          return toMemberMap(res)
        } catch (err) {
          lastError = err
          // some icqq implementations use object input
          try {
            const res2 = await rawGetGroupMemberList.call(runtimeBot, { group_id: gid })
            return toMemberMap(res2)
          } catch (fallbackErr) {
            lastError = fallbackErr
            console.warn("[getGroupMemberList] upstream failed:", fallbackErr?.message || fallbackErr)
          }
        }
      }

      if (lastError) throw lastError
      throw new Error("[getGroupMemberList] API not available")
    },

    async getGroupMemberInfo(group_id, user_id) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      const groupInput =
        group_id && typeof group_id === "object" && !Array.isArray(group_id) ? group_id : null
      const gid = toInt(groupInput?.group_id ?? groupInput?.groupId ?? group_id ?? ctx?.group_id)
      const uid = toInt(
        groupInput?.user_id ??
          groupInput?.userId ??
          user_id ??
          ctx?.user_id ??
          ctx?.sender_id,
      )
      if (gid === undefined || uid === undefined)
        throw new Error("[getGroupMemberInfo] requires group_id/user_id")

      let lastError = null

      const rawGetGroupMemberInfo = getRawMethod(
        runtimeBot,
        "getGroupMemberInfo",
        api.getGroupMemberInfo,
      )
      if (rawGetGroupMemberInfo) {
        try {
          const res =
            protocol === "icqq"
              ? await rawGetGroupMemberInfo.call(runtimeBot, gid, uid)
              : await rawGetGroupMemberInfo.call(runtimeBot, { group_id: gid, user_id: uid })
          return res?.member ?? res
        } catch (err) {
          lastError = err
          try {
            const res2 = await rawGetGroupMemberInfo.call(runtimeBot, {
              group_id: gid,
              user_id: uid,
            })
            return res2?.member ?? res2
          } catch (fallbackErr) {
            lastError = fallbackErr
            console.warn("[getGroupMemberInfo] upstream failed:", fallbackErr?.message || fallbackErr)
          }
        }
      }

      if (lastError) throw lastError
      throw new Error("[getGroupMemberInfo] API not available")
    },

    async getGroupMemberRoleFlags(group_id, user_id) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()

      const groupInput =
        group_id && typeof group_id === "object" && !Array.isArray(group_id) ? group_id : null
      const gid = toInt(groupInput?.group_id ?? groupInput?.groupId ?? group_id ?? ctx?.group_id)
      const uid = toInt(
        groupInput?.user_id ??
          groupInput?.userId ??
          user_id ??
          ctx?.user_id ??
          ctx?.sender_id,
      )
      if (gid === undefined || uid === undefined) return null

      const fastFlags = getFastMemberRoleFlags(ctx, uid)
      if (fastFlags) return fastFlags

      return await getMemberRoleFlagsWithFallback(ctx || runtimeBot || {}, gid, uid)
    },

    async isGroupOwner(group_id, user_id) {
      const flags = await api.getGroupMemberRoleFlags.call(this, group_id, user_id)
      return hasOwnerRole(flags)
    },

    async isGroupAdmin(group_id, user_id) {
      const flags = await api.getGroupMemberRoleFlags.call(this, group_id, user_id)
      return hasAdminRole(flags)
    },

    async getBotGroupRoleFlags(group_id) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const groupInput =
        group_id && typeof group_id === "object" && !Array.isArray(group_id) ? group_id : null
      const gid = toInt(groupInput?.group_id ?? groupInput?.groupId ?? group_id ?? ctx?.group_id)
      const selfId = getSelfIdFromTarget(ctx, runtimeBot)
      if (gid === undefined || selfId === undefined) return null

      const fastFlags = getFastBotRoleFlags(ctx)
      if (fastFlags) return fastFlags

      return await getMemberRoleFlagsWithFallback(ctx || runtimeBot || {}, gid, selfId)
    },

    async isBotGroupOwner(group_id) {
      const flags = await api.getBotGroupRoleFlags.call(this, group_id)
      return hasOwnerRole(flags)
    },

    async isBotGroupAdmin(group_id) {
      const flags = await api.getBotGroupRoleFlags.call(this, group_id)
      return hasAdminRole(flags)
    },

    async acceptGroupRequest(input = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      if (protocol === "milky") {
        const rawAccept = getRawMethod(runtimeBot, "acceptGroupRequest", api.acceptGroupRequest)
        if (!rawAccept) throw new Error("[acceptGroupRequest] milky API not available")
        const notification_seq = toInt(input.notification_seq ?? input.flag)
        const group_id = toInt(input.group_id)
        if (notification_seq === undefined || group_id === undefined)
          throw new Error("[acceptGroupRequest] milky requires flag(notification_seq) + group_id")
        const notification_type = mapMilkyNotificationType(input)
        const payload = {
          notification_seq,
          notification_type,
          group_id,
          ...(input.is_filtered !== undefined ? { is_filtered: Boolean(input.is_filtered) } : {}),
        }
        return await rawAccept.call(runtimeBot, payload)
      }

      if (protocol === "onebotv11") {
        const flag = input.flag
        if (!flag) throw new Error("[acceptGroupRequest] onebotv11 requires flag")
        const sub_type = mapOnebotGroupRequestSubType(input)
        const requestCandidates = collectMessageBotCandidates(ctx?.bot, runtimeBot, globalThis.Bot)
        for (const candidate of requestCandidates) {
          const rawAccept = getRawMethod(candidate, "acceptGroupRequest", api.acceptGroupRequest)
          if (!rawAccept) continue
          return await rawAccept.call(candidate, { flag, sub_type, reason: input.reason })
        }

        const sendApi = getOnebotReactionSendApi({ ctx, runtimeBot }) || getYunzaiSendApi(runtimeBot)
        if (sendApi) {
          return await sendApi("set_group_add_request", {
            flag,
            sub_type,
            approve: true,
            reason: input.reason,
          })
        }

        throw new Error("[acceptGroupRequest] onebotv11 API not available")
      }

      // icqq/yunzai
      const flag = input.flag
      const sub_type = mapOnebotGroupRequestSubType(input)
      if (!flag) throw new Error("[acceptGroupRequest] icqq requires flag")
      if (runtimeBot?.setGroupAddRequest)
        return await runtimeBot.setGroupAddRequest(
          flag,
          true,
          input.reason !== undefined ? String(input.reason) : "",
          input.block,
        )
      if (runtimeBot?.sendApi) {
        return await runtimeBot.sendApi("set_group_add_request", {
          flag,
          sub_type,
          approve: true,
        })
      }
      throw new Error("[acceptGroupRequest] API not available")
    },

    async rejectGroupRequest(input = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      if (protocol === "milky") {
        const rawReject = getRawMethod(runtimeBot, "rejectGroupRequest", api.rejectGroupRequest)
        if (!rawReject) throw new Error("[rejectGroupRequest] milky API not available")
        const notification_seq = toInt(input.notification_seq ?? input.flag)
        const group_id = toInt(input.group_id)
        if (notification_seq === undefined || group_id === undefined)
          throw new Error("[rejectGroupRequest] milky requires flag(notification_seq) + group_id")
        const notification_type = mapMilkyNotificationType(input)
        const payload = {
          notification_seq,
          notification_type,
          group_id,
          ...(input.is_filtered !== undefined ? { is_filtered: Boolean(input.is_filtered) } : {}),
          ...(input.reason !== undefined ? { reason: input.reason } : {}),
        }
        return await rawReject.call(runtimeBot, payload)
      }

      if (protocol === "onebotv11") {
        const flag = input.flag
        if (!flag) throw new Error("[rejectGroupRequest] onebotv11 requires flag")
        const sub_type = mapOnebotGroupRequestSubType(input)
        const requestCandidates = collectMessageBotCandidates(ctx?.bot, runtimeBot, globalThis.Bot)
        for (const candidate of requestCandidates) {
          const rawReject = getRawMethod(candidate, "rejectGroupRequest", api.rejectGroupRequest)
          if (!rawReject) continue
          return await rawReject.call(candidate, { flag, sub_type, reason: input.reason })
        }

        const sendApi = getOnebotReactionSendApi({ ctx, runtimeBot }) || getYunzaiSendApi(runtimeBot)
        if (sendApi) {
          return await sendApi("set_group_add_request", {
            flag,
            sub_type,
            approve: false,
            reason: input.reason,
          })
        }

        throw new Error("[rejectGroupRequest] onebotv11 API not available")
      }

      // icqq/yunzai
      const flag = input.flag
      const sub_type = mapOnebotGroupRequestSubType(input)
      if (!flag) throw new Error("[rejectGroupRequest] icqq requires flag")
      if (runtimeBot?.setGroupAddRequest)
        return await runtimeBot.setGroupAddRequest(
          flag,
          false,
          input.reason !== undefined ? String(input.reason) : "",
          input.block,
        )
      if (runtimeBot?.sendApi) {
        return await runtimeBot.sendApi("set_group_add_request", {
          flag,
          sub_type,
          approve: false,
          reason: input.reason,
        })
      }
      throw new Error("[rejectGroupRequest] API not available")
    },

    async setGroupMemberMute(input = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      const group_id = toInt(input.group_id ?? ctx?.group_id)
      const user_id = toInt(input.user_id ?? ctx?.user_id)
      const duration = Math.max(0, Math.floor(Number(input.duration ?? input.durationSeconds ?? 0)))

      if (group_id === undefined || user_id === undefined)
        throw new Error("[setGroupMemberMute] requires group_id/user_id")

      if (protocol === "milky" || protocol === "onebotv11") {
        const rawSetGroupMemberMute = getRawMethod(
          runtimeBot,
          "setGroupMemberMute",
          api.setGroupMemberMute,
        )
        if (!rawSetGroupMemberMute) throw new Error("[setGroupMemberMute] API not available")
        return await rawSetGroupMemberMute.call(runtimeBot, { group_id, user_id, duration })
      }

      // icqq/yunzai
      if (runtimeBot?.pickGroup) {
        const group = runtimeBot.pickGroup(group_id)
        if (group?.muteMember) return await group.muteMember(user_id, duration)
        if (group?.mute) return await group.mute(user_id, duration)
        if (group?.setMute) return await group.setMute(user_id, duration)
      }

      throw new Error("[setGroupMemberMute] API not available")
    },

    /**
     * 列出当前已注册的命令（用于“帮助/指令列表”等插件）。
     * 依赖 BaseBot 实例（即 xunlu-core 的内部 bot）。
     */
    listCommands(options = {}) {
      if (!bot || typeof bot !== "object") {
        throw new Error("[listCommands] requires BaseBot instance")
      }

      const pluginFilterRaw = options?.plugin ?? options?.name ?? options?.pluginName ?? ""
      const pluginFilter = pluginFilterRaw ? String(pluginFilterRaw).toLowerCase() : ""

      const items = Object.values(bot.plugins || {})
        .filter(i => i && typeof i === "object")
        .map(i => ({
          id: i.id,
          plugin: i.plugin,
          pluginTitle: i.pluginTitle,
          pluginShortName: i.pluginShortName,
          pluginAliases: i.pluginAliases,
          reg: i.reg,
          event: i.event,
          priority: i.priority,
          help: i.help,
        }))
        .filter(i => (pluginFilter ? String(i.plugin || "").toLowerCase() === pluginFilter : true))

      items.sort((a, b) => {
        const pa = String(a.plugin || "")
        const pb = String(b.plugin || "")
        if (pa !== pb) return pa.localeCompare(pb)
        const da = Number(a.priority ?? 5000)
        const db = Number(b.priority ?? 5000)
        if (da !== db) return da - db
        return String(a.reg || "").localeCompare(String(b.reg || ""))
      })

      return items
    },

    listPlugins() {
      if (!bot || typeof bot !== "object") {
        throw new Error("[listPlugins] requires BaseBot instance")
      }

      const items = Object.values(bot.pluginCatalog || {})
        .filter(i => i && typeof i === "object")
        .map(i => ({
          name: i.name,
          title: i.title,
          shortName: i.shortName,
          aliases: i.aliases,
          helpHidden: Boolean(i.helpHidden),
        }))

      items.sort((a, b) => String(a.title || a.name || "").localeCompare(String(b.title || b.name || "")))
      return items
    },

    async invokeCommandByText(rawCommand, options = {}) {
      if (!bot || typeof bot.invokeCommandByText !== "function") {
        throw new Error("[invokeCommandByText] requires BaseBot instance")
      }

      const boundCtx = this && typeof this === "object" ? this : null
      return await bot.invokeCommandByText(rawCommand, boundCtx || {}, options)
    },

    async renderImg(name, data, options) {
      if (!bot || typeof bot.renderImg !== "function") {
        throw new Error("[renderImg] requires BaseBot instance")
      }
      return await bot.renderImg(name, data, options)
    },

    async makeGroupForwardMsg(ctx, msgList = [], desc = "", msgsscr = false) {
      if (!bot || typeof bot.makeForwardMsg !== "function") {
        throw new Error("[makeGroupForwardMsg] requires BaseBot instance")
      }
      return await bot.makeForwardMsg(ctx, msgList, desc, msgsscr)
    },

    async makeGroupForwardMsgByUser(ctxOrTargetUserId, targetUserIdOrMsgList = [], msgListOrDesc = [], descMaybe = "") {
      if (!bot || typeof bot.makeForwardMsg !== "function") {
        throw new Error("[makeGroupForwardMsgByUser] requires BaseBot instance")
      }

      const boundCtx =
        this && typeof this === "object"
          ? this
          : null
      const hasExplicitCtx =
        ctxOrTargetUserId &&
        typeof ctxOrTargetUserId === "object" &&
        !Array.isArray(ctxOrTargetUserId) &&
        (ctxOrTargetUserId.group_id !== undefined ||
          ctxOrTargetUserId.user_id !== undefined ||
          typeof ctxOrTargetUserId.getGroupMemberInfo === "function" ||
          typeof ctxOrTargetUserId.getUserInfo === "function")

      const ctx = hasExplicitCtx ? ctxOrTargetUserId : boundCtx
      const targetUserId = hasExplicitCtx ? targetUserIdOrMsgList : ctxOrTargetUserId
      const msgList = hasExplicitCtx ? msgListOrDesc : targetUserIdOrMsgList
      const desc = hasExplicitCtx ? descMaybe : msgListOrDesc

      const uid = toInt(targetUserId)
      if (uid === undefined) {
        throw new Error("[makeGroupForwardMsgByUser] requires targetUserId")
      }

      let nickname = String(uid)
      try {
        if (ctx?.group_id && typeof ctx?.getGroupMemberInfo === "function") {
          const member =
            (await ctx.getGroupMemberInfo(ctx.group_id, uid).catch(() => null)) ||
            (await ctx.getGroupMemberInfo({ group_id: ctx.group_id, user_id: uid }).catch(() => null))
          const unwrapped = member?.member ?? member?.data?.member ?? member?.data ?? member
          const card = String(unwrapped?.card ?? unwrapped?.remark ?? "").trim()
          const nick = String(unwrapped?.nickname ?? unwrapped?.name ?? "").trim()
          nickname = card || nick || nickname
        } else if (typeof ctx?.getUserInfo === "function") {
          const info = await ctx.getUserInfo({ user_id: uid }).catch(() => null)
          nickname = String(info?.card ?? info?.nickname ?? info?.remark ?? uid).trim() || String(uid)
        }
      } catch {}

      const normalizedList = (Array.isArray(msgList) ? msgList : [msgList]).map(item => {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          return {
            ...item,
            user_id: item.user_id ?? item.uin ?? item.id ?? uid,
            uin: item.uin ?? item.user_id ?? item.id ?? uid,
            nickname: item.nickname ?? item.sender_name ?? item.name ?? nickname,
            sender_name: item.sender_name ?? item.nickname ?? item.name ?? nickname,
            name: item.name ?? item.nickname ?? item.sender_name ?? nickname,
          }
        }

        return {
          user_id: uid,
          uin: uid,
          nickname,
          sender_name: nickname,
          name: nickname,
          content: item,
        }
      })

      return await bot.makeForwardMsg(ctx || {}, normalizedList, desc, false)
    },

    async getGroupChatHistory(group_id, date) {
      if (!bot || typeof bot.getGroupHistoryMsg !== "function") {
        throw new Error("[getGroupChatHistory] requires BaseBot instance")
      }
      return await bot.getGroupHistoryMsg(group_id, date)
    },
  }

  try {
    for (const value of Object.values(api)) {
      if (typeof value === "function") {
        value.__xunlu_universal = true
      }
    }
  } catch {}

  return api
}

export function applyUniversalBotApi(target, { bot, adapterHint, override = [] } = {}) {
  if (!target || typeof target !== "object") return target

  const api = createUniversalBotApi({ bot, adapterHint })
  const overrideSet = new Set(Array.isArray(override) ? override : [])

  for (const [key, value] of Object.entries(api)) {
    if (!overrideSet.has(key) && typeof target[key] === "function") continue

    // 若覆盖已有实现，则缓存原实现，避免通用封装递归调用自身
    if (overrideSet.has(key) && typeof target[key] === "function") {
      const rawKey = `__xunlu_raw_${key}`
      if (typeof target[rawKey] !== "function") {
        target[rawKey] = target[key]
      }
    }
    target[key] = value
  }
  return target
}
