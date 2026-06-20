import { toInt, safeStringify, logWarn, logError } from "./_helpers.js"

function looksLikeGroupFacade(input) {
  return Boolean(
    input &&
      typeof input === "object" &&
      !Array.isArray(input) &&
      (typeof input.sendMsg === "function" ||
        typeof input.pickMember === "function" ||
        typeof input.getMemberMap === "function" ||
        typeof input.makeForwardMsg === "function" ||
        typeof input.recallMsg === "function"),
  )
}

function looksLikeMemberFacade(input) {
  return Boolean(
    input &&
      typeof input === "object" &&
      !Array.isArray(input) &&
      ((typeof input.getAvatarUrl === "function" && typeof input.mute === "function") ||
        (input.card !== undefined && input.nickname !== undefined)),
  )
}

function normalizeGroupArg(input) {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return toInt(input.group_id ?? input.groupId ?? input.gid ?? input.id ?? input.peer_id ?? input.peerId)
  }
  return toInt(input)
}

function normalizeUserArg(input) {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return toInt(input.user_id ?? input.userId ?? input.uid ?? input.uin ?? input.id ?? input.sender_id ?? input.senderId)
  }
  return toInt(input)
}

function getLockedProxyValue(target, prop) {
  try {
    const desc = Reflect.getOwnPropertyDescriptor(target, prop)
    if (!desc || desc.configurable) return null
    if ("value" in desc && !desc.writable) return { value: desc.value }
    if (!("value" in desc) && desc.get === undefined) return { value: undefined }
  } catch {}
  return null
}

function installTakeoverBotCompatProxy(bot) {
  if (!bot || typeof bot !== "object") return bot
  if (bot.__xunlu_takeover_compat_proxy) return bot.__xunlu_takeover_compat_proxy

  const proxy = new Proxy(bot, {
    get(target, prop, receiver) {
      const locked = getLockedProxyValue(target, prop)
      if (locked) return locked.value

      if (prop === "pickGroup" && typeof target.__xunlu_pickGroup_compat === "function") {
        return target.__xunlu_pickGroup_compat
      }
      if (prop === "pickMember" && typeof target.__xunlu_pickMember_compat === "function") {
        return target.__xunlu_pickMember_compat
      }
      if (prop === "pickFriend" && typeof target.__xunlu_pickFriend_compat === "function") {
        return target.__xunlu_pickFriend_compat
      }
      if (prop === "pickUser" && typeof target.__xunlu_pickFriend_compat === "function") {
        return target.__xunlu_pickFriend_compat
      }
      return Reflect.get(target, prop, receiver)
    },
    has(target, prop) {
      if (
        prop === "pickGroup" ||
        prop === "pickMember" ||
        prop === "pickFriend" ||
        prop === "pickUser"
      ) {
        return true
      }
      return Reflect.has(target, prop)
    },
  })

  try {
    bot.__xunlu_takeover_compat_proxy = proxy
  } catch {}
  return proxy
}

function parseQuoteRefFromIcqqSource(source) {
  if (!source) return null

  if (typeof source === "string" || typeof source === "number") {
    return { msgId: String(source), seq: toInt(source) }
  }

  if (source && typeof source === "object") {
    const msgIdRaw =
      source.msgId ??
      source.message_id ??
      source.messageId ??
      source.id ??
      source?.data?.id ??
      source?.data?.message_id
    const seqRaw = source.seq ?? source.message_seq ?? source.messageSeq ?? source?.data?.message_seq

    const msgId = msgIdRaw !== undefined && msgIdRaw !== null ? String(msgIdRaw) : undefined
    const seq = toInt(seqRaw)
    if (!msgId && seq === undefined) return null
    return { msgId, seq }
  }

  return null
}

function parseMessageIdFromIcqqRecallParam(param) {
  if (param === undefined || param === null) return ""
  if (typeof param === "string" || typeof param === "number") return String(param)
  if (param && typeof param === "object") {
    const mid =
      param.message_id ??
      param.messageId ??
      param.msgId ??
      param.id ??
      param.seq ??
      param.message_seq ??
      param.messageSeq
    return mid !== undefined && mid !== null ? String(mid) : ""
  }
  return ""
}

function patchIcqqPrototypeOnce(proto, methodName, patchKey, wrapFn) {
  if (!proto || typeof proto !== "object") return
  const current = proto[methodName]
  if (typeof current !== "function") return
  if (current?.[patchKey]) return

  const raw = current
  const wrapped = wrapFn(raw)
  try {
    wrapped[patchKey] = true
    wrapped.__xunlu_raw = raw
  } catch {}
  proto[methodName] = wrapped
}

function patchIcqqEntitiesForTakeover(bot) {
  if (globalThis.__xunlu_takeover_icqq_patched) return

  const tryGetProto = fn => {
    try {
      const obj = fn()
      if (!obj) return null
      return Object.getPrototypeOf(obj)
    } catch {
      return null
    }
  }

  const userProto = tryGetProto(() => bot?.pickUser?.(toInt(bot?.uin) || 10000))
  const groupProto = tryGetProto(() => bot?.pickGroup?.(toInt(bot?.uin) || 10000))
  const memberProto = tryGetProto(() => bot?.pickMember?.(toInt(bot?.uin) || 10000, toInt(bot?.uin) || 10000))

  const patchUserLike = proto => {
    if (!proto) return
    patchIcqqPrototypeOnce(proto, "sendMsg", "__xunlu_takeover_sendMsg", raw => {
      return async function sendMsgTakeover(content, source) {
        const state = this?.c?.__xunlu_takeover_state
        if (!state) return await raw.call(this, content, source)

        const quoteRef = parseQuoteRefFromIcqqSource(source)
        const quote = Boolean(quoteRef)

        const uid = toInt(this.user_id ?? this.uin)
        if (!uid) throw new Error(`[takeover] invalid private target uin=${safeStringify(this?.uin)} user_id=${safeStringify(this?.user_id)} uid=${safeStringify(this?.uid)}`)

        return await state.sendTo({
          scene: "private",
          user_id: uid,
          message: content,
          quote,
          quoteRef,
        })
      }
    })

    patchIcqqPrototypeOnce(proto, "recallMsg", "__xunlu_takeover_recallMsg", raw => {
      return async function recallMsgTakeover(param, _rand = 0, _time = 0) {
        const state = this?.c?.__xunlu_takeover_state
        if (!state) return await raw.call(this, param, _rand, _time)

        const message_id = parseMessageIdFromIcqqRecallParam(param)
        const uid = toInt(this.user_id ?? this.uin)
        if (!uid) throw new Error(`[takeover] invalid private target uin=${safeStringify(this?.uin)} user_id=${safeStringify(this?.user_id)} uid=${safeStringify(this?.uid)}`)
        return await state.recall({
          scene: "private",
          user_id: uid,
          message_id,
        })
      }
    })
  }

  const patchGroupLike = proto => {
    if (!proto) return
    patchIcqqPrototypeOnce(proto, "sendMsg", "__xunlu_takeover_sendMsg", raw => {
      return async function sendMsgTakeover(content, source, _anony = false) {
        const state = this?.c?.__xunlu_takeover_state
        if (!state) return await raw.call(this, content, source, _anony)

        const quoteRef = parseQuoteRefFromIcqqSource(source)
        const quote = Boolean(quoteRef)

        return await state.sendTo({
          scene: "group",
          group_id: this.gid ?? this.group_id,
          message: content,
          quote,
          quoteRef,
        })
      }
    })

    patchIcqqPrototypeOnce(proto, "muteMember", "__xunlu_takeover_muteMember", raw => {
      return async function muteMemberTakeover(userId, duration = 600) {
        const state = this?.c?.__xunlu_takeover_state
        if (!state) return await raw.call(this, userId, duration)

        const group_id = toInt(this.gid ?? this.group_id)
        const user_id = toInt(userId)
        const dur = Math.max(0, Math.floor(Number(duration) || 0))

        if (!group_id || !user_id) {
          throw new Error(
            `[takeover] invalid muteMember args group_id=${safeStringify(group_id)} user_id=${safeStringify(userId)} duration=${safeStringify(duration)}`,
          )
        }

        if (typeof state.adapter?.setGroupMemberMute === "function") {
          return await state.adapter.setGroupMemberMute({ group_id, user_id, duration: dur })
        }

        if (typeof state.adapter?.callApi === "function") {
          const action = state.protocol === "onebotv11" ? "set_group_ban" : "set_group_member_mute"
          return await state.adapter.callApi(action, { group_id, user_id, duration: dur })
        }

        throw new Error("[takeover] adapter.setGroupMemberMute not available")
      }
    })

    patchIcqqPrototypeOnce(proto, "recallMsg", "__xunlu_takeover_recallMsg", raw => {
      return async function recallMsgTakeover(param, _rand = 0, _pktnum = 1) {
        const state = this?.c?.__xunlu_takeover_state
        if (!state) return await raw.call(this, param, _rand, _pktnum)

        const message_id = parseMessageIdFromIcqqRecallParam(param)
        return await state.recall({
          scene: "group",
          group_id: this.gid ?? this.group_id,
          message_id,
        })
      }
    })

    patchIcqqPrototypeOnce(proto, "getMemberMap", "__xunlu_takeover_getMemberMap", raw => {
      return async function getMemberMapTakeover(_no_cache = false) {
        const state = this?.c?.__xunlu_takeover_state
        if (!state) return await raw.call(this, _no_cache)

        const gid = toInt(this.gid ?? this.group_id)
        if (!gid) return new Map()

        try {
          const res = await state.adapter.getGroupMemberList?.call(state.adapter, { group_id: gid })
          const list = Array.isArray(res) ? res : Array.isArray(res?.members) ? res.members : []
          const now = Math.floor(Date.now() / 1000)
          const m = new Map()

          for (const item of list) {
            const uid = toInt(item?.user_id ?? item?.uin ?? item?.id)
            if (!uid) continue
            const nickname = String(item?.nickname ?? item?.name ?? uid)
            const card = String(item?.card ?? item?.remark ?? item?.member_card ?? item?.memberCard ?? nickname ?? "")
            const role = String(item?.role ?? item?.permission ?? item?.member_role ?? item?.memberRole ?? "member")
            m.set(uid, { group_id: gid, user_id: uid, nickname, card, role, update_time: now })
          }

          if (this.c?.gml instanceof Map) this.c.gml.set(gid, m)
          return m
        } catch (err) {
          logWarn("[xunlu-core][takeover] getMemberMap via adapter failed:", err?.message || err)
          return new Map()
        }
      }
    })

    patchIcqqPrototypeOnce(proto, "renew", "__xunlu_takeover_renew", raw => {
      return async function renewTakeover() {
        const state = this?.c?.__xunlu_takeover_state
        if (!state) return await raw.call(this)

        try {
          const info = this._info || this.c?.gl?.get?.(this.gid) || {}
          if (info && typeof info === "object") info.update_time = Math.floor(Date.now() / 1000)
          return info
        } catch {
          return this._info || {}
        }
      }
    })
  }

  patchUserLike(userProto)
  patchGroupLike(groupProto)

  if (memberProto) {
    patchIcqqPrototypeOnce(memberProto, "mute", "__xunlu_takeover_mute", raw => {
      return async function muteTakeover(duration = 1800) {
        const state = this?.c?.__xunlu_takeover_state
        if (!state) return await raw.call(this, duration)

        const group_id = toInt(this.gid ?? this.group_id)
        const user_id = toInt(this.uid ?? this.user_id ?? this.uin)
        const dur = Math.max(0, Math.floor(Number(duration) || 0))

        if (!group_id || !user_id) {
          throw new Error(
            `[takeover] invalid member.mute args group_id=${safeStringify(group_id)} user_id=${safeStringify(user_id)} duration=${safeStringify(duration)}`,
          )
        }

        if (typeof state.adapter?.setGroupMemberMute === "function") {
          return await state.adapter.setGroupMemberMute({ group_id, user_id, duration: dur })
        }

        if (typeof state.adapter?.callApi === "function") {
          const action = state.protocol === "onebotv11" ? "set_group_ban" : "set_group_member_mute"
          return await state.adapter.callApi(action, { group_id, user_id, duration: dur })
        }

        throw new Error("[takeover] adapter.setGroupMemberMute not available")
      }
    })

    patchIcqqPrototypeOnce(memberProto, "renew", "__xunlu_takeover_renew", raw => {
      return async function renewTakeover() {
        const state = this?.c?.__xunlu_takeover_state
        if (!state) return await raw.call(this)

        try {
          const info = this._info || this.c?.gml?.get?.(this.gid)?.get?.(this.uid) || {}
          if (info && typeof info === "object") info.update_time = Math.floor(Date.now() / 1000)
          this._info = info
          return info
        } catch {
          return this._info || {}
        }
      }
    })
  }

  globalThis.__xunlu_takeover_icqq_patched = true
}

function patchYunzaiBot(bot, state, { loginInfo } = {}) {
  if (!bot || typeof bot !== "object") throw new Error("[takeover] invalid bot")
  if (bot.__xunlu_takeover_patched) return

  patchIcqqEntitiesForTakeover(bot)

  bot.__xunlu_takeover_patched = true
  bot.__xunlu_takeover_state = state

  if (!bot.__xunlu_raw_pickUser && typeof bot.pickUser === "function") bot.__xunlu_raw_pickUser = bot.pickUser.bind(bot)
  if (!bot.__xunlu_raw_pickFriend && typeof bot.pickFriend === "function") bot.__xunlu_raw_pickFriend = bot.pickFriend.bind(bot)
  if (!bot.__xunlu_raw_pickGroup && typeof bot.pickGroup === "function") bot.__xunlu_raw_pickGroup = bot.pickGroup.bind(bot)
  if (!bot.__xunlu_raw_sendApi && typeof bot.sendApi === "function") bot.__xunlu_raw_sendApi = bot.sendApi.bind(bot)
  if (!bot.__xunlu_raw_isOnline && typeof bot.isOnline === "function") bot.__xunlu_raw_isOnline = bot.isOnline.bind(bot)
  if (!bot.__xunlu_raw_sendMsg && typeof bot.sendMsg === "function") bot.__xunlu_raw_sendMsg = bot.sendMsg.bind(bot)
  if (!bot.__xunlu_raw_sendPrivateMsg && typeof bot.sendPrivateMsg === "function") bot.__xunlu_raw_sendPrivateMsg = bot.sendPrivateMsg.bind(bot)
  if (!bot.__xunlu_raw_sendGroupMsg && typeof bot.sendGroupMsg === "function") bot.__xunlu_raw_sendGroupMsg = bot.sendGroupMsg.bind(bot)
  if (!bot.__xunlu_raw_makeGroupForwardMsg && typeof bot.makeGroupForwardMsg === "function") {
    bot.__xunlu_raw_makeGroupForwardMsg = bot.makeGroupForwardMsg.bind(bot)
  }
  if (!bot.__xunlu_raw_makePrivateForwardMsg && typeof bot.makePrivateForwardMsg === "function") {
    bot.__xunlu_raw_makePrivateForwardMsg = bot.makePrivateForwardMsg.bind(bot)
  }

  const uin = toInt(loginInfo?.uin)
  const nickname = loginInfo?.nickname ? String(loginInfo.nickname) : undefined
  if (uin) bot.uin = uin
  if (nickname !== undefined) bot.nickname = nickname

  if (uin) bot[String(uin)] = state.adapter || bot
  state.selfId = toInt(bot.uin) ?? state.selfId

  try {
    if (!bot.adapter || typeof bot.adapter !== "object") bot.adapter = {}
    if (!bot.adapter.name) {
      bot.adapter.name = state.protocol === "onebotv11" ? "OneBotv11" : state.protocol === "milky" ? "milky" : "icqq"
    }
  } catch {}

  if (typeof bot.sendApi !== "function") {
    bot.sendApi = async (action, params = {}) => {
      if (typeof state.adapter?.callApi === "function") return await state.adapter.callApi(action, params)
      throw new Error("[takeover] adapter.callApi not available")
    }
  }

  try {
    if (!bot.adapterType) {
      bot.adapterType =
        state.protocol === "onebotv11" ? "OneBotv11" : state.protocol === "milky" ? "milky" : "icqq"
    }
  } catch {}

  const bindAdapterMethod = (methodName, { force = true } = {}) => {
    if (!methodName) return
    if (typeof state.adapter?.[methodName] !== "function") return
    if (!force && typeof bot[methodName] === "function") return

    const raw = typeof bot[methodName] === "function" ? bot[methodName].bind(bot) : null
    const wrapped = async (...args) => {
      const st = bot?.__xunlu_takeover_state || state
      if (!st) {
        if (raw) return await raw(...args)
        throw new Error(`[takeover] ${methodName} not available`)
      }
      const fn = st.adapter?.[methodName]
      if (typeof fn !== "function") {
        if (raw) return await raw(...args)
        throw new Error(`[takeover] adapter.${methodName} not available`)
      }
      return await fn.call(st.adapter, ...args)
    }

    try {
      wrapped.__xunlu_takeover_adapter_proxy = true
      wrapped.__xunlu_raw = raw
    } catch {}

    bot[methodName] = wrapped
  }

  ;[
    "sendMsg",
    "deleteMessage",
    "getMessage",
    "getLoginInfo",
    "getFriendList",
    "getFriendInfo",
    "getGroupList",
    "getGroupInfo",
    "getGroupMemberList",
    "getGroupMemberInfo",
    "setGroupName",
    "setGroupMemberCard",
    "setGroupMemberAdmin",
    "setGroupMemberSpecialTitle",
    "setGroupMemberMute",
    "setGroupWholeMute",
    "kickGroupMember",
    "quitGroup",
    "acceptFriendRequest",
    "rejectFriendRequest",
    "acceptGroupRequest",
    "rejectGroupRequest",
    "sendGroupMessageReaction",
    "pickUser",
    "pickGroup",
  ].forEach(name => bindAdapterMethod(name, { force: false }))

  const pickGroupCompat = function pickGroupCompat(groupInput, strict) {
    if (looksLikeGroupFacade(groupInput)) {
      return groupInput
    }

    const gid = normalizeGroupArg(groupInput)
    if (!gid) {
      if (typeof bot.__xunlu_raw_pickGroup === "function") {
        return bot.__xunlu_raw_pickGroup(groupInput, strict)
      }
      return null
    }

    if (typeof state.adapter?.pickGroup === "function") {
      try {
        return state.adapter.pickGroup(gid, strict)
      } catch {}
    }

    if (typeof bot.__xunlu_raw_pickGroup === "function") {
      try {
        return bot.__xunlu_raw_pickGroup(gid, strict)
      } catch {}
    }

    return state.getGroup(gid)
  }

  const pickMemberCompat = function pickMemberCompat(groupInput, userInput, strict) {
    if (looksLikeMemberFacade(groupInput) && userInput === undefined) {
      return groupInput
    }

    if (looksLikeGroupFacade(groupInput) && typeof groupInput.pickMember === "function") {
      const uid = normalizeUserArg(userInput)
      if (uid) {
        try {
          return groupInput.pickMember(uid, strict)
        } catch {}
      }
    }

    const gid = normalizeGroupArg(groupInput)
    const uid =
      normalizeUserArg(userInput) ??
      (looksLikeMemberFacade(userInput) ? normalizeUserArg(userInput) : undefined) ??
      normalizeUserArg(groupInput?.user_id ?? groupInput?.uid ?? groupInput?.uin)
    if (!gid || !uid) {
      if (typeof bot.__xunlu_raw_pickMember === "function") {
        return bot.__xunlu_raw_pickMember(groupInput, userInput, strict)
      }
      return state.getMember(gid, uid)
    }

    let group = null
    if (typeof state.adapter?.pickGroup === "function") {
      try {
        group = state.adapter.pickGroup(gid, strict)
      } catch {}
    }
    if (!group && typeof state.getGroup === "function") {
      try {
        group = state.getGroup(gid)
      } catch {}
    }
    if (!group && typeof bot.__xunlu_raw_pickGroup === "function") {
      try {
        group = bot.__xunlu_raw_pickGroup(gid, strict)
      } catch {}
    }
    if (group && typeof group.pickMember === "function") {
      try {
        return group.pickMember(uid, strict)
      } catch {}
    }

    if (typeof bot.__xunlu_raw_pickMember === "function") {
      try {
        return bot.__xunlu_raw_pickMember(gid, uid, strict)
      } catch {}
    }

    return state.getMember(gid, uid)
  }

  const pickFriendCompat = function pickFriendCompat(userInput, strict) {
    if (looksLikeMemberFacade(userInput)) {
      return userInput
    }

    const uid = normalizeUserArg(userInput)
    if (!uid) {
      if (typeof bot.__xunlu_raw_pickFriend === "function") {
        return bot.__xunlu_raw_pickFriend(userInput, strict)
      }
      if (typeof bot.__xunlu_raw_pickUser === "function") {
        return bot.__xunlu_raw_pickUser(userInput, strict)
      }
      return null
    }

    if (typeof state.getUser === "function") {
      return state.getUser(uid)
    }

    if (typeof bot.__xunlu_raw_pickFriend === "function") {
      return bot.__xunlu_raw_pickFriend(uid, strict)
    }
    if (typeof bot.__xunlu_raw_pickUser === "function") {
      return bot.__xunlu_raw_pickUser(uid, strict)
    }
    return null
  }

  bot.__xunlu_pickGroup_compat = pickGroupCompat
  bot.__xunlu_pickMember_compat = pickMemberCompat
  bot.__xunlu_pickFriend_compat = pickFriendCompat

  const makeForwardViaTakeover = async (scene, targetId, forwardMsg, raw = null) => {
    const currentState = bot?.__xunlu_takeover_state || state
    if (!currentState) {
      if (typeof raw === "function") return await raw(forwardMsg, targetId)
      throw new Error(`[takeover] ${scene} forward API not available`)
    }

    if (typeof currentState.adapter?.makeForwardMsg === "function") {
      return await currentState.adapter.makeForwardMsg(forwardMsg)
    }

    if (typeof raw === "function") {
      return await raw(forwardMsg, targetId)
    }

    throw new Error(`[takeover] adapter.makeForwardMsg not available for ${scene}`)
  }

  if (typeof bot.sendPrivateMsg === "function" && !bot.sendPrivateMsg?.__xunlu_takeover_sendPrivateMsg) {
    const raw = bot.sendPrivateMsg
    const wrapped = async function sendPrivateMsgTakeover(user_id, message, source) {
      const state = this?.__xunlu_takeover_state
      if (!state) return await raw.call(this, user_id, message, source)

      const quoteRef = parseQuoteRefFromIcqqSource(source)
      const quote = Boolean(quoteRef)

      return await state.sendTo({
        scene: "private",
        user_id,
        message,
        quote,
        quoteRef,
      })
    }
    try {
      wrapped.__xunlu_takeover_sendPrivateMsg = true
      wrapped.__xunlu_raw = raw
    } catch {}
    bot.sendPrivateMsg = wrapped
  }

  if (typeof bot.sendGroupMsg === "function" && !bot.sendGroupMsg?.__xunlu_takeover_sendGroupMsg) {
    const raw = bot.sendGroupMsg
    const wrapped = async function sendGroupMsgTakeover(group_id, message, source, anony = false) {
      const state = this?.__xunlu_takeover_state
      if (!state) return await raw.call(this, group_id, message, source, anony)

      const quoteRef = parseQuoteRefFromIcqqSource(source)
      const quote = Boolean(quoteRef)

      return await state.sendTo({
        scene: "group",
        group_id,
        message,
        quote,
        quoteRef,
      })
    }
    try {
      wrapped.__xunlu_takeover_sendGroupMsg = true
      wrapped.__xunlu_raw = raw
    } catch {}
    bot.sendGroupMsg = wrapped
  }

  if (typeof bot.sendMsg === "function" && !bot.sendMsg?.__xunlu_takeover_sendMsg) {
    const raw = bot.sendMsg
    const wrapped = async function sendMsgTakeover(target, message, ...args) {
      const state = this?.__xunlu_takeover_state
      if (!state) return await raw.call(this, target, message, ...args)

      const groupId = toInt(target?.group_id ?? target?.groupId ?? target?.gid)
      if (groupId !== undefined) {
        return await state.sendTo({
          scene: "group",
          group_id: groupId,
          message,
        })
      }

      const userId = toInt(
        typeof target === "string" || typeof target === "number"
          ? target
          : target?.user_id ?? target?.userId ?? target?.peer_id ?? target?.peerId ?? target?.uin,
      )

      if (userId !== undefined) {
        return await state.sendTo({
          scene: "private",
          user_id: userId,
          message,
        })
      }

      return await raw.call(this, target, message, ...args)
    }
    try {
      wrapped.__xunlu_takeover_sendMsg = true
      wrapped.__xunlu_raw = raw
    } catch {}
    bot.sendMsg = wrapped
  }

  if (!bot.makeGroupForwardMsg?.__xunlu_takeover_makeGroupForwardMsg) {
    const raw = typeof bot.makeGroupForwardMsg === "function" ? bot.makeGroupForwardMsg.bind(bot) : null
    const wrapped = async function makeGroupForwardMsgTakeover(forwardMsg, group_id) {
      return await makeForwardViaTakeover("group", group_id, forwardMsg, raw)
    }
    try {
      wrapped.__xunlu_takeover_makeGroupForwardMsg = true
      wrapped.__xunlu_raw = raw
    } catch {}
    bot.makeGroupForwardMsg = wrapped
  }

  if (!bot.makePrivateForwardMsg?.__xunlu_takeover_makePrivateForwardMsg) {
    const raw = typeof bot.makePrivateForwardMsg === "function" ? bot.makePrivateForwardMsg.bind(bot) : null
    const wrapped = async function makePrivateForwardMsgTakeover(forwardMsg, user_id) {
      return await makeForwardViaTakeover("private", user_id, forwardMsg, raw)
    }
    try {
      wrapped.__xunlu_takeover_makePrivateForwardMsg = true
      wrapped.__xunlu_raw = raw
    } catch {}
    bot.makePrivateForwardMsg = wrapped
  }

  bot.isOnline = () => true
}

export {
  parseQuoteRefFromIcqqSource,
  parseMessageIdFromIcqqRecallParam,
  patchIcqqPrototypeOnce,
  patchIcqqEntitiesForTakeover,
  patchYunzaiBot,
  looksLikeGroupFacade,
  looksLikeMemberFacade,
  normalizeGroupArg,
  normalizeUserArg,
  getLockedProxyValue,
  installTakeoverBotCompatProxy,
}
