import { coerceToUniversalMessage } from "../message/context.js"
import { UniversalMessage } from "../message/universal-message.js"
import { protocolDispatcher } from "../../protocol-dispatcher/index.js"
import {
  getMemberRoleFlagsWithFallback,
  hasAdminRole,
  hasOwnerRole,
} from "../role/index.js"
import {
  getFastBotRoleFlags,
  getFastMemberRoleFlags,
  getRawMethod,
  getRuntimeBotFallback,
  getRuntimeBotOrNull,
  getSelfIdFromTarget,
  getYunzaiSendApi,
  hasMilkyForwardSegments,
  hasOnebotNodeSegments,
  normalizeApiActionName,
  normalizeProtocol,
  normalizeTarget,
  rememberOutgoingGroupMessage,
  resolveProtocol,
  toInt,
  toSendTargetObject,
} from "./universal-bot-api-utils.js"

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

async function tryCallRawApi(rawApi, target, action, params) {
  if (typeof rawApi !== "function") return null
  try { return await rawApi.call(target, action, params) } catch {}
  try { return await rawApi.call(target, { action, params }) } catch {}
  return null
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

      // TRSS Bot 为包装对象，原生 Bot（含 adapter）以 uin 为 key 挂载在其上
      const nativeBotKey = ctx ? Object.keys(ctx).find(k => ctx[k]?.adapter?.callApi) : null
      const targetBot = nativeBotKey ? ctx[nativeBotKey] : ctx?.bot ?? ctx
      if (targetBot && typeof targetBot.sendApi === "function" && !targetBot.sendApi.__xunlu_universal) {
        try {
          return await targetBot.sendApi(normalizedAction, params)
        } catch {}
      }
      if (targetBot?.adapter?.callApi) {
        return await targetBot.adapter.callApi(normalizedAction, params)
      }

      const rawSendApi = getRawMethod(runtimeBot, "sendApi", api.sendApi)
      {
        const r = await tryCallRawApi(rawSendApi, runtimeBot, normalizedAction, params)
        if (r !== null) return r
      }

      const rawCallApi = getRawMethod(runtimeBot, "callApi", api.callApi)
      {
        const r = await tryCallRawApi(rawCallApi, runtimeBot, normalizedAction, params)
        if (r !== null) return r
      }

      const sendApi = getYunzaiSendApi(runtimeBot)
      if (sendApi) return await sendApi(normalizedAction, params)

      // fallback: 绕过 getRawMethod 的 selfFn/__xunlu_universal 守卫，
      // 直接尝试 fallback Bot 上的原始 sendApi/callApi/yunzaiSendApi
      const fallbackBot = getRuntimeBotFallback()
      if (fallbackBot) {
        // 先走 getRawMethod 不带 selfFn（避免 universal wrapper 自检）
        {
          const raw = getRawMethod(fallbackBot, "sendApi")
          const r = await tryCallRawApi(raw, fallbackBot, normalizedAction, params)
          if (r !== null) return r
        }
        {
          const raw = getRawMethod(fallbackBot, "callApi")
          const r = await tryCallRawApi(raw, fallbackBot, normalizedAction, params)
          if (r !== null) return r
        }
        const fbSendApi = getYunzaiSendApi(fallbackBot)
        if (fbSendApi) return await fbSendApi(normalizedAction, params)
      }

      // takeover 模式直通
      const takeoverAdapter = globalThis.__xunlu_takeover_adapter
      if (takeoverAdapter?.callApi) {
        return await takeoverAdapter.callApi(normalizedAction, params)
      }

      const lg = global.logger
      if (lg?.mark) {
        const nbKeys = ctx ? Object.keys(ctx) : []
        const nbOwn = ctx ? Object.getOwnPropertyNames(ctx) : []
        const nbFound = nbKeys.find(k => ctx[k]?.adapter?.callApi) || nbOwn.find(k => ctx[k]?.adapter?.callApi)
        const nbSelfId = String(ctx?.self_id ?? ctx?.uin ?? '')
        lg.mark(`[sendApi] diag nbFound=${nbFound} nbSelfId=${nbSelfId} hasSelfKey=${!!ctx?.[nbSelfId]?.adapter} keys=${nbKeys.length} own=${nbOwn.length} keysSample=${nbKeys.slice(0,5).join(',')} runtimeBotUU=${runtimeBot?.sendApi?.__xunlu_universal} takeoverAdapter=${typeof takeoverAdapter}`)
      }

      throw new Error("[sendApi] API not available")
    },

    async callApi(action, params = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      const normalizedAction = normalizeApiActionName(protocol, action)
      if (!normalizedAction) throw new Error("[callApi] requires action")

      // TRSS Bot 为包装对象，原生 Bot（含 adapter）以 uin 为 key 挂载在其上
      const nativeBotKey = ctx ? Object.keys(ctx).find(k => ctx[k]?.adapter?.callApi) : null
      const targetBot = nativeBotKey ? ctx[nativeBotKey] : ctx?.bot ?? ctx
      if (targetBot?.adapter?.callApi) {
        return await targetBot.adapter.callApi(normalizedAction, params)
      }

      const rawCallApi = getRawMethod(runtimeBot, "callApi", api.callApi)
      {
        const r = await tryCallRawApi(rawCallApi, runtimeBot, normalizedAction, params)
        if (r !== null) return r
      }

      const rawSendApi = getRawMethod(runtimeBot, "sendApi", api.sendApi)
      {
        const r = await tryCallRawApi(rawSendApi, runtimeBot, normalizedAction, params)
        if (r !== null) return r
      }

      const sendApi = getYunzaiSendApi(runtimeBot)
      if (sendApi) return await sendApi(normalizedAction, params)

      // fallback: 绕过 getRawMethod 的 selfFn/__xunlu_universal 守卫
      const fallbackBot = getRuntimeBotFallback()
      if (fallbackBot) {
        {
          const fbRawCallApi = getRawMethod(fallbackBot, "callApi")
          const r = await tryCallRawApi(fbRawCallApi, fallbackBot, normalizedAction, params)
          if (r !== null) return r
        }
        {
          const fbRawSendApi = getRawMethod(fallbackBot, "sendApi")
          const r = await tryCallRawApi(fbRawSendApi, fallbackBot, normalizedAction, params)
          if (r !== null) return r
        }
        const fbSendApi = getYunzaiSendApi(fallbackBot)
        if (fbSendApi) return await fbSendApi(normalizedAction, params)
      }

      // takeover 模式直通
      const takeoverAdapter = globalThis.__xunlu_takeover_adapter
      if (takeoverAdapter?.callApi) {
        return await takeoverAdapter.callApi(normalizedAction, params)
      }

      const lg = global.logger
      if (lg?.mark) {
        lg.mark(`[callApi] diag nativeBotKey=${nativeBotKey} hasTargetBot=${!!targetBot} targetBotSendApi=${typeof targetBot?.sendApi} targetBotAdapter=${typeof targetBot?.adapter} targetBotAdapterCallApi=${typeof targetBot?.adapter?.callApi} runtimeBotType=${typeof runtimeBot} runtimeBotSendApi=${typeof runtimeBot?.sendApi} runtimeBotUU=${runtimeBot?.sendApi?.__xunlu_universal} runtimeBotRaw=${typeof runtimeBot?.__xunlu_raw_sendApi} fallbackBotType=${typeof fallbackBot} takeoverAdapter=${typeof takeoverAdapter} takeoverAdapterCallApi=${typeof takeoverAdapter?.callApi}`)
      }

      throw new Error("[callApi] API not available")
    },

    async getLoginInfo() {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })
      return protocolDispatcher.exec("getLoginInfo", protocol, {}, ctx)
    },

    async getFriendList() {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })
      return protocolDispatcher.exec("getFriendList", protocol, {}, ctx)
    },

    async getFriendInfo(input = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })
      return protocolDispatcher.exec("getFriendInfo", protocol, {
        user_id: toInt(input.user_id ?? input.userId ?? ctx?.user_id ?? ctx?.sender_id),
        no_cache: input.no_cache,
      }, ctx)
    },

    async sendProfileLike(input = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      const user_id = toInt(input.user_id ?? input.userId ?? ctx?.user_id ?? ctx?.sender_id)
      if (user_id === undefined) throw new Error("[sendProfileLike] requires user_id")
      return protocolDispatcher.exec("sendProfileLike", protocol, {
        user_id,
        times: Math.max(1, Math.floor(Number(input.times ?? input.count ?? 1))),
      }, ctx)
    },

    async getGroupList() {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })
      return protocolDispatcher.exec("getGroupList", protocol, {}, ctx)
    },

    async getGroupInfo(input = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      const groupId = toInt(input.group_id ?? input.groupId ?? ctx?.group_id)
      if (groupId === undefined) throw new Error("[getGroupInfo] requires group_id")
      return protocolDispatcher.exec("getGroupInfo", protocol, {
        group_id: groupId,
        no_cache: Boolean(input.no_cache),
      }, ctx)
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
      return protocolDispatcher.exec("setGroupName", protocol, {
        group_id: groupId,
        group_name: String(groupName),
      }, ctx)
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
      return protocolDispatcher.exec("setGroupMemberCard", protocol, {
        group_id: groupId, user_id: userId, card: String(card),
      }, ctx)
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
      return protocolDispatcher.exec("setGroupMemberAdmin", protocol, {
        group_id: groupId, user_id: userId, enable: Boolean(enable),
      }, ctx)
    },

    async setGroupMemberSpecialTitle(input = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      const groupId = toInt(input.group_id ?? input.groupId ?? ctx?.group_id)
      const userId = toInt(input.user_id ?? input.userId ?? ctx?.user_id ?? ctx?.sender_id)
      const specialTitle = input.special_title ?? input.specialTitle
      if (groupId === undefined || userId === undefined)
        throw new Error("[setGroupMemberSpecialTitle] requires group_id/user_id")
      if (specialTitle === undefined || specialTitle === null)
        throw new Error("[setGroupMemberSpecialTitle] requires special_title")
      return protocolDispatcher.exec("setGroupMemberSpecialTitle", protocol, {
        group_id: groupId, user_id: userId, special_title: String(specialTitle),
        duration: input.duration,
      }, ctx)
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
      return protocolDispatcher.exec("setGroupWholeMute", protocol, {
        group_id: groupId, enable: Boolean(enable),
      }, ctx)
    },

    async kickGroupMember(input = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      const groupId = toInt(input.group_id ?? input.groupId ?? ctx?.group_id)
      const userId = toInt(input.user_id ?? input.userId ?? ctx?.user_id ?? ctx?.sender_id)
      if (groupId === undefined || userId === undefined)
        throw new Error("[kickGroupMember] requires group_id/user_id")
      return protocolDispatcher.exec("kickGroupMember", protocol, {
        group_id: groupId, user_id: userId,
        reject_add_request: input.reject_add_request ?? input.rejectAddRequest,
        message: input.message,
      }, ctx)
    },

    async quitGroup(input = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      const groupId = toInt(input.group_id ?? input.groupId ?? ctx?.group_id)
      if (groupId === undefined) throw new Error("[quitGroup] requires group_id")
      return protocolDispatcher.exec("quitGroup", protocol, {
        group_id: groupId,
        is_dismiss: input.is_dismiss ?? input.isDismiss,
      }, ctx)
    },

    async acceptFriendRequest(input = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })
      return protocolDispatcher.exec("acceptFriendRequest", protocol, input, ctx)
    },

    async rejectFriendRequest(input = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })
      return protocolDispatcher.exec("rejectFriendRequest", protocol, input, ctx)
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
      return protocolDispatcher.exec("recallMessage", protocol, {
        group_id: input.group_id ?? ctx?.group_id,
        user_id: input.user_id ?? ctx?.user_id,
        peer_id: input.peer_id ?? ctx?.peer_id,
        message_id: input.message_id,
        message_seq: toInt(input.message_seq ?? input.seq ?? input.message_id),
        seq: toInt(input.seq ?? input.message_seq),
        isGroup: Boolean(input.isGroup ?? input.group_id ?? ctx?.group_id ?? ctx?.message_scene === "group"),
      }, ctx)
    },

    async sendGroupMessageReaction(input = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })
      return protocolDispatcher.exec("sendGroupMessageReaction", protocol, {
        group_id: toInt(input.group_id ?? input.peer_id ?? ctx?.group_id ?? ctx?.peer_id),
        message_id: input.message_id ?? ctx?.message_id,
        message_seq: toInt(input.message_seq ?? input.seq ?? ctx?.seq ?? ctx?.message_seq),
        reaction: input.reaction ?? input.emoji_id ?? input.emojiId ?? input.emoji ?? input.id,
        is_add: input.is_add !== undefined ? Boolean(input.is_add) : input?.isAdd !== undefined ? Boolean(input.isAdd) : true,
        _ctx: ctx,
      }, ctx)
    },

    async getUserInfo(input = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      const userId = toInt(input.user_id ?? input.userId ?? ctx?.user_id ?? ctx?.sender_id)
      if (userId === undefined) throw new Error("[getUserInfo] requires user_id")
      return protocolDispatcher.exec("getUserInfo", protocol, {
        user_id: userId,
        no_cache: input.no_cache,
      }, ctx)
    },

    async getGroupMemberList(group_id) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })
      const groupInput = group_id && typeof group_id === "object" && !Array.isArray(group_id) ? group_id : null
      const gid = toInt(groupInput?.group_id ?? groupInput?.groupId ?? group_id ?? ctx?.group_id)
      return protocolDispatcher.exec("getGroupMemberList", protocol, { group_id: gid }, ctx)
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
      return protocolDispatcher.exec("getGroupMemberInfo", protocol, {
        group_id: gid, user_id: uid,
      }, ctx)
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
      return protocolDispatcher.exec("acceptGroupRequest", protocol, input, ctx)
    },

    async rejectGroupRequest(input = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })
      return protocolDispatcher.exec("rejectGroupRequest", protocol, input, ctx)
    },

    async setGroupMemberMute(input = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      const group_id = toInt(input.group_id ?? ctx?.group_id)
      const user_id = toInt(input.user_id ?? ctx?.user_id)
      if (group_id === undefined || user_id === undefined)
        throw new Error("[setGroupMemberMute] requires group_id/user_id")
      return protocolDispatcher.exec("setGroupMemberMute", protocol, {
        group_id, user_id,
        duration: Math.max(0, Math.floor(Number(input.duration ?? input.durationSeconds ?? 0))),
      }, ctx)
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

    async makeForwardMessage(ctxOrInput = {}, msgList = [], desc = "", msgsscr = false) {
      const hasExplicitCtx =
        ctxOrInput &&
        typeof ctxOrInput === "object" &&
        !Array.isArray(ctxOrInput) &&
        (ctxOrInput.group_id !== undefined ||
          ctxOrInput.user_id !== undefined ||
          ctxOrInput.protocol !== undefined)

      const boundCtx = this && typeof this === "object" ? this : {}
      const ctx = hasExplicitCtx ? ctxOrInput : boundCtx
      const messages = hasExplicitCtx ? msgList : ctxOrInput
      const summary = hasExplicitCtx ? desc : msgList
      const useMsgsscr = hasExplicitCtx ? msgsscr : desc

      return await api.makeGroupForwardMsg.call(
        this,
        ctx,
        messages,
        summary || "",
        Boolean(useMsgsscr),
      )
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

    async getForwardMessages(input = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })
      const forwardId = String(input.forward_id ?? input.id ?? "").trim()
      if (!forwardId) throw new Error("[getForwardMessages] requires forward_id")
      return protocolDispatcher.exec("getForwardMessages", protocol, {
        forward_id: forwardId,
        group_id: toInt(input.group_id ?? ctx?.group_id),
        user_id: toInt(input.user_id ?? ctx?.user_id ?? ctx?.sender_id),
        message_scene: input.message_scene || (input.group_id ?? ctx?.group_id ? "group" : String(ctx?.message_scene || "friend")),
      }, ctx)
    },

    async getMessage(input = {}) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })
      return protocolDispatcher.exec("getMessage", protocol, {
        message_id: input.message_id ?? input.msgId ?? input.msg_id,
        message_seq: toInt(input.message_seq ?? input.seq),
        group_id: toInt(input.group_id ?? ctx?.group_id),
        user_id: toInt(input.user_id ?? ctx?.user_id),
        peer_id: toInt(input.peer_id ?? input.group_id ?? input.user_id ?? ctx?.group_id ?? ctx?.user_id),
        message_scene: input.message_scene ||
          (input.group_id || ctx?.group_id ? "group" : String(ctx?.message_scene || "friend")),
      }, ctx)
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

export function applyUniversalBotApi(target, { bot, adapterHint, override = [], exclude = [] } = {}) {
  if (!target || typeof target !== "object") return target

  const api = createUniversalBotApi({ bot, adapterHint })
  const overrideSet = new Set(Array.isArray(override) ? override : [])
  const excludeSet = new Set(Array.isArray(exclude) ? exclude : [])

  for (const [key, value] of Object.entries(api)) {
    if (excludeSet.has(key)) continue
    if (!overrideSet.has(key) && typeof target[key] === "function") continue

    // 覆盖前始终缓存原实现（无论是否在 override 列表中）
    if (typeof target[key] === "function") {
      const rawKey = `__xunlu_raw_${key}`
      target[rawKey] = target[key]
    }
    target[key] = value
  }
  return target
}
