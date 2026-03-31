import { coerceToUniversalMessage } from "../message/context.js"
import { UniversalMessage } from "../message/universal-message.js"
import { rememberRuntimeLastGroupMessage } from "../runtime-last-message.js"

function getRuntimeBotOrNull() {
  try {
    // eslint-disable-next-line no-undef
    return Bot || globalThis.Bot || null
  } catch {
    return globalThis.Bot || null
  }
}

function toInt(value) {
  if (value === undefined || value === null) return undefined
  const v = typeof value === "string" ? value.trim() : value
  if (v === "") return undefined
  const num = Number(v)
  return Number.isFinite(num) ? num : undefined
}

function resolveProtocol({ ctx, bot, runtimeBot, adapterHint } = {}) {
  const fromCtx = ctx && typeof ctx.protocol === "string" ? String(ctx.protocol).toLowerCase() : ""
  if (fromCtx) return normalizeProtocol(fromCtx)

  const fromRuntime =
    runtimeBot && typeof runtimeBot.adapterType === "string"
      ? String(runtimeBot.adapterType).toLowerCase()
      : ""
  if (fromRuntime) return normalizeProtocol(fromRuntime)

  const fromBot = bot && typeof bot.adapter === "string" ? String(bot.adapter).toLowerCase() : ""
  if (fromBot) return normalizeProtocol(fromBot)

  const fromHint = adapterHint ? String(adapterHint).toLowerCase() : ""
  if (fromHint) return normalizeProtocol(fromHint)

  return "icqq"
}

function getRawMethod(runtimeBot, methodName, selfFn) {
  if (!runtimeBot || (typeof runtimeBot !== "object" && typeof runtimeBot !== "function"))
    return null

  const rawKey = `__xunlu_raw_${methodName}`
  const raw = runtimeBot?.[rawKey]
  if (typeof raw === "function") return raw

  const fn = runtimeBot?.[methodName]
  if (typeof fn === "function" && fn !== selfFn) return fn

  return null
}

function rememberOutgoingGroupMessage(sendTarget, message, { ctx, runtimeBot } = {}) {
  const groupId = sendTarget?.group_id
  if (groupId === undefined || groupId === null) return
  const selfId =
    ctx?.self_id ??
    runtimeBot?.self_id ??
    runtimeBot?.uin ??
    runtimeBot?.user_id ??
    runtimeBot?.botQQ ??
    ""
  rememberRuntimeLastGroupMessage({
    group_id: groupId,
    user_id: selfId,
    sender_id: selfId,
    self_id: selfId,
    message,
    isMaster: false,
    isBot: true,
  })
}

function getYunzaiSendApi(runtimeBot) {
  if (!runtimeBot || typeof runtimeBot !== "object") return null
  if (typeof runtimeBot.sendApi === "function" && !runtimeBot.sendApi?.__xunlu_universal)
    return runtimeBot.sendApi.bind(runtimeBot)

  const qq = runtimeBot.botQQ
  if (!qq) return null
  const sub = runtimeBot[qq]
  if (sub && typeof sub.sendApi === "function") return sub.sendApi.bind(sub)
  return null
}

function normalizeProtocol(value) {
  const v = String(value || "").toLowerCase()
  if (v.includes("onebot")) return "onebotv11"
  if (v.includes("milky")) return "milky"
  if (v.includes("icqq")) return "icqq"
  if (v === "onebotv11") return "onebotv11"
  if (v === "milky") return "milky"
  if (v === "icqq") return "icqq"
  return "icqq"
}

function normalizeApiActionName(protocol, action) {
  if (action === undefined || action === null) return ""
  let out = String(action).trim()
  while (out.startsWith("/")) out = out.slice(1)
  if (protocol === "milky" && out.startsWith("api/")) out = out.slice("api/".length)
  return out
}

function normalizeTarget(target, fallbackCtx) {
  const ctx = fallbackCtx && typeof fallbackCtx === "object" ? fallbackCtx : null

  if (typeof target === "string" || typeof target === "number") {
    return { scene: "private", user_id: target }
  }

  if (target && typeof target === "object") {
    const gid = target.group_id ?? target.groupId
    if (gid !== undefined && gid !== null) return { scene: "group", group_id: gid }

    const uid = target.user_id ?? target.userId
    if (uid !== undefined && uid !== null) return { scene: "private", user_id: uid }
  }

  if (ctx) {
    if (ctx.group_id !== undefined && ctx.group_id !== null)
      return { scene: "group", group_id: ctx.group_id }
    if (ctx.user_id !== undefined && ctx.user_id !== null)
      return { scene: "private", user_id: ctx.user_id }
  }

  throw new Error("[sendMessage] invalid target")
}

function hasOnebotNodeSegments(message) {
  const list = Array.isArray(message) ? message : message ? [message] : []
  return list.some(i => i && typeof i === "object" && i.type === "node")
}

function hasMilkyForwardSegments(message) {
  const list = Array.isArray(message) ? message : message ? [message] : []
  return list.some(
    i => i && typeof i === "object" && i.type === "forward" && Array.isArray(i?.data?.messages),
  )
}

function toSendTargetObject(t) {
  if (!t || typeof t !== "object") return t
  if (t.group_id !== undefined && t.group_id !== null) {
    const gid = toInt(t.group_id) ?? t.group_id
    return { group_id: gid }
  }
  if (t.user_id !== undefined && t.user_id !== null) {
    const uid = toInt(t.user_id) ?? t.user_id
    return String(uid)
  }
  return t
}

function toMemberMap(listOrMap) {
  if (!listOrMap) return new Map()
  if (listOrMap instanceof Map) return listOrMap

  if (Array.isArray(listOrMap)) {
    return new Map(listOrMap.map(item => [item?.user_id ?? item?.uin ?? item?.id, item]))
  }

  // milky: { members: [...] }
  if (typeof listOrMap === "object" && Array.isArray(listOrMap.members)) {
    return new Map(listOrMap.members.map(item => [item?.user_id ?? item?.uin ?? item?.id, item]))
  }

  // onebot: may return plain array/object
  if (typeof listOrMap === "object") {
    const values = Object.values(listOrMap)
    if (Array.isArray(values) && values.every(v => v && typeof v === "object")) {
      const maybeArray = values
      return new Map(maybeArray.map(item => [item?.user_id ?? item?.uin ?? item?.id, item]))
    }
  }

  return new Map()
}

function toKeyMap(listOrMap, key) {
  if (!listOrMap) return new Map()
  if (listOrMap instanceof Map) return listOrMap
  if (!Array.isArray(listOrMap)) return new Map()

  const map = new Map()
  for (const item of listOrMap) {
    if (!item || typeof item !== "object") continue
    const id = item[key]
    if (id === undefined || id === null) continue
    map.set(id, item)
  }
  return map
}

function mapOnebotGroupRequestSubType(input = {}) {
  const subType = input.sub_type ?? input.subType
  if (subType === "add" || subType === "invite") return subType

  const type = input.type ?? input.notification_type ?? input.notificationType
  if (type === "join_request") return "add"
  if (type === "invited_join_request") return "invite"
  if (type === "invite") return "invite"
  return "add"
}

function mapMilkyNotificationType(input = {}) {
  const t = input.notification_type ?? input.notificationType ?? input.type
  if (t === "join_request" || t === "invited_join_request") return t

  const subType = input.sub_type ?? input.subType
  if (subType === "invite") return "invited_join_request"
  return "join_request"
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
        try {
          const rawGetStranger =
            runtimeBot?.__xunlu_raw_getStrangerInfo || runtimeBot?.getStrangerInfo || null
          if (rawGetStranger) return await rawGetStranger.call(runtimeBot, userId)
        } catch (err) {
          console.warn("[getFriendInfo] icqq upstream failed:", err?.message || err)
        }
        return { user_id: userId, nickname: String(userId) }
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

      if (protocol === "onebotv11") {
        return await api.sendApi.call(ctx ?? api, "send_like", { user_id, times })
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

      // icqq/yunzai: best-effort fallback to onebot action name if supported by upstream
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

      // onebot node 转发：必须透传，否则会被转换成文本
      if (protocol === "onebotv11" && hasOnebotNodeSegments(message)) {
        if (runtimeBot?.sendMsg) {
          const res = await runtimeBot.sendMsg(sendTarget, message)
          rememberOutgoingGroupMessage(sendTarget, message, { ctx, runtimeBot })
          return res
        }
        throw new Error("[sendMessage] onebotv11 forward requires sendMsg")
      }

      // milky forward 段：如果已经是原生 forward 格式则透传
      if (protocol === "milky" && hasMilkyForwardSegments(message)) {
        if (runtimeBot?.sendMsg) {
          const res = await runtimeBot.sendMsg(sendTarget, message)
          rememberOutgoingGroupMessage(sendTarget, message, { ctx, runtimeBot })
          return res
        }
        throw new Error("[sendMessage] milky forward requires sendMsg")
      }

      const universalMsg =
        message instanceof UniversalMessage ? message : coerceToUniversalMessage(message)
      const outSegments = universalMsg.convertTo(protocol)

      if (runtimeBot?.sendMsg) {
        const res = await runtimeBot.sendMsg(sendTarget, outSegments)
        rememberOutgoingGroupMessage(sendTarget, outSegments, { ctx, runtimeBot })
        return res
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
        const raw =
          runtimeBot?.__xunlu_raw_sendGroupMessageReaction ||
          runtimeBot?.sendGroupMessageReaction ||
          null
        if (!messageId) throw new Error("[sendGroupMessageReaction] onebotv11 requires message_id")
        if (reactionRaw === undefined || reactionRaw === null || reactionRaw === "")
          throw new Error("[sendGroupMessageReaction] onebotv11 requires reaction")

        if (raw) {
          return await raw.call(runtimeBot, {
            message_id: messageId,
            emoji_id: Number(reactionRaw),
          })
        }

        const sendApi = getYunzaiSendApi(runtimeBot)
        if (sendApi) {
          return await sendApi("set_msg_emoji_like", {
            message_id: messageId,
            emoji_id: Number(reactionRaw),
          })
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

      const gid = toInt(group_id ?? ctx?.group_id)
      if (gid === undefined) throw new Error("[getGroupMemberList] requires group_id")

      // icqq: prefer native getMemberMap
      if (protocol === "icqq" && runtimeBot?.pickGroup) {
        try {
          const group = runtimeBot.pickGroup(gid)
          if (group?.getMemberMap) return await group.getMemberMap()
        } catch {}
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
          // some icqq implementations use object input
          try {
            const res2 = await rawGetGroupMemberList.call(runtimeBot, { group_id: gid })
            return toMemberMap(res2)
          } catch {
            console.warn("[getGroupMemberList] upstream failed:", err?.message || err)
          }
        }
      }

      return new Map()
    },

    async getGroupMemberInfo(group_id, user_id) {
      const ctx = this && typeof this === "object" ? this : null
      const runtimeBot = getRuntimeBotOrNull()
      const protocol = resolveProtocol({ ctx, bot, runtimeBot, adapterHint })

      const gid = toInt(group_id ?? ctx?.group_id)
      const uid = toInt(user_id ?? ctx?.user_id ?? ctx?.sender_id)
      if (gid === undefined || uid === undefined)
        throw new Error("[getGroupMemberInfo] requires group_id/user_id")

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
          try {
            const res2 = await rawGetGroupMemberInfo.call(runtimeBot, {
              group_id: gid,
              user_id: uid,
            })
            return res2?.member ?? res2
          } catch {
            console.warn("[getGroupMemberInfo] upstream failed:", err?.message || err)
          }
        }
      }

      return null
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
        const rawAccept = getRawMethod(runtimeBot, "acceptGroupRequest", api.acceptGroupRequest)
        if (rawAccept) {
          return await rawAccept.call(runtimeBot, { flag, sub_type, reason: input.reason })
        }

        const sendApi = getYunzaiSendApi(runtimeBot)
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
        return await runtimeBot.setGroupAddRequest(flag, sub_type, true)
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
        const rawReject = getRawMethod(runtimeBot, "rejectGroupRequest", api.rejectGroupRequest)
        if (rawReject) {
          return await rawReject.call(runtimeBot, { flag, sub_type, reason: input.reason })
        }

        const sendApi = getYunzaiSendApi(runtimeBot)
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
        return await runtimeBot.setGroupAddRequest(flag, sub_type, false, input.reason)
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
    api.sendApi.__xunlu_universal = true
    api.callApi.__xunlu_universal = true
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
