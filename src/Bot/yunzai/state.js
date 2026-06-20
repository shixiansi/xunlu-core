import { UniversalMessage, UniversalMessageSegment } from "../message/universal-message.js"
import { coerceToUniversalMessage } from "../message/context.js"
import { rememberRuntimeLastGroupMessage } from "../state/index.js"
import { preprocessOutboundMessage, sanitizeOutboundMessageForAdapter } from "./adapter.js"
import { logWarn, toInt, safeStringify } from "./_helpers.js"

function createIdPrimitive(value) {
  const id = toInt(value)
  return {
    valueOf() {
      return id
    },
    toString() {
      return String(id ?? "")
    },
    [Symbol.toPrimitive](hint) {
      if (hint === "number") return Number(id || 0)
      return String(id ?? "")
    },
  }
}

function createTakeoverState({ bot, protocol, adapter, ignoreSelf = true }) {
  const state = {
    bot,
    protocol,
    adapter,
    ignoreSelf,
    selfId: toInt(bot?.uin) ?? 0,

    groupInfoById: new Map(),
    friendInfoById: new Map(),
    groupFacadeById: new Map(),
    userFacadeById: new Map(),
    memberInfoByGroupId: new Map(),
  }

  state.getGroup = groupId => {
    const gid = toInt(groupId)
    if (!gid) return null
    if (state.groupFacadeById.has(gid)) return state.groupFacadeById.get(gid)

    const group = {
      group_id: gid,
      gid,
      uin: state.selfId,
      get name() {
        return String(state.groupInfoById.get(gid)?.group_name || state.groupInfoById.get(gid)?.groupName || "")
      },
      mute_left: 0,
      async makeForwardMsg(forwardMsg) {
        try {
          if (typeof adapter?.makeForwardMsg === "function") return await adapter.makeForwardMsg(forwardMsg)
        } catch (err) {
          logWarn("[xunlu-core][takeover] group.makeForwardMsg failed:", err?.message || err)
        }
        if (typeof bot?.makeGroupForwardMsg === "function") return await bot.makeGroupForwardMsg(forwardMsg, gid)
        throw new Error("[takeover] makeForwardMsg not available")
      },
      async sendMsg(message, quote = false) {
        return await state.sendTo({ scene: "group", group_id: gid, message, quote })
      },
      async recallMsg(messageId) {
        return await state.recall({ scene: "group", group_id: gid, message_id: messageId })
      },
      pickMember(userId) {
        return state.getMember(gid, userId)
      },
      async getMemberMap() {
        try {
          const res = await adapter.getGroupMemberList?.call(adapter, { group_id: gid })
          const list = Array.isArray(res) ? res : Array.isArray(res?.members) ? res.members : []
          return new Map(list.map(m => [m?.user_id ?? m?.uin ?? m?.id, m]))
        } catch (err) {
          logWarn("[xunlu-core][takeover] getMemberMap failed:", err?.message || err)
          return new Map()
        }
      },
      ...createIdPrimitive(gid),
    }

    state.groupFacadeById.set(gid, group)
    return group
  }

  state.getUser = userId => {
    const uid = toInt(userId)
    if (!uid) return null
    if (state.userFacadeById.has(uid)) return state.userFacadeById.get(uid)

    const user = {
      user_id: uid,
      uin: uid,
      get nickname() {
        return String(state.friendInfoById.get(uid)?.nickname || state.friendInfoById.get(uid)?.remark || uid)
      },
      async makeForwardMsg(forwardMsg) {
        try {
          if (typeof adapter?.makeForwardMsg === "function") return await adapter.makeForwardMsg(forwardMsg)
        } catch (err) {
          logWarn("[xunlu-core][takeover] user.makeForwardMsg failed:", err?.message || err)
        }
        if (typeof bot?.makePrivateForwardMsg === "function") return await bot.makePrivateForwardMsg(forwardMsg, uid)
        throw new Error("[takeover] makeForwardMsg not available")
      },
      async sendMsg(message, quote = false) {
        return await state.sendTo({ scene: "private", user_id: uid, message, quote })
      },
      async recallMsg(messageId) {
        return await state.recall({ scene: "private", user_id: uid, message_id: messageId })
      },
      ...createIdPrimitive(uid),
    }

    state.userFacadeById.set(uid, user)
    return user
  }

  state.getMember = (groupId, userId) => {
    const gid = toInt(groupId)
    const uid = toInt(userId)
    const infoMap = gid ? state.memberInfoByGroupId.get(gid) : null
    const info = infoMap?.get(uid) || { user_id: uid, nickname: String(uid), card: "", role: "member" }

    const role = String(info.role || info?._info?.role || "member")
    const isOwner = role === "owner"
    const isAdmin = role === "admin" || role === "owner"

    return {
      user_id: uid,
      uin: uid,
      nickname: info.nickname ?? String(uid),
      card: info.card ?? info.nickname ?? String(uid),
      role,
      is_owner: isOwner,
      is_admin: isAdmin,
      info,
      _info: info,
      ...createIdPrimitive(uid),
    }
  }

  state.upsertMember = (groupId, userId, sender = {}) => {
    const gid = toInt(groupId)
    const uid = toInt(userId)
    if (!gid || !uid) return

    if (!state.memberInfoByGroupId.has(gid)) state.memberInfoByGroupId.set(gid, new Map())
    const map = state.memberInfoByGroupId.get(gid)

    const nickname = String(sender?.nickname ?? sender?.name ?? sender?.user_name ?? sender?.userName ?? uid)
    const card = String(sender?.card ?? sender?.remark ?? sender?.member_card ?? sender?.memberCard ?? nickname ?? "")
    const role = String(sender?.role ?? sender?.permission ?? sender?.member_role ?? sender?.memberRole ?? "member")

    const memberInfo = {
      group_id: gid,
      user_id: uid,
      uin: state.selfId,
      nickname,
      card,
      role,
      update_time: Math.floor(Date.now() / 1000),
      _info: { role },
    }

    map.set(uid, memberInfo)

    try {
      const client = state.bot
      if (client?.gml instanceof Map) {
        if (!client.gml.has(gid)) client.gml.set(gid, new Map())
        const gml = client.gml.get(gid)
        if (gml instanceof Map) gml.set(uid, memberInfo)
      }
    } catch {}
  }

  state.sendTo = async ({ scene, group_id, user_id, message, quote = false, quoteRef } = {}) => {
    const proto = state.protocol
    const rememberGroupSend = sentMessage => {
      if (scene !== "group") return
      rememberRuntimeLastGroupMessage({
        group_id,
        user_id: state.selfId,
        sender_id: state.selfId,
        self_id: state.selfId,
        message: sentMessage,
        isMaster: false,
        isBot: true,
      })
    }

    const target = (() => {
      if (scene === "group") {
        const gid = toInt(group_id)
        if (!gid) throw new Error(`[takeover.sendTo] invalid group_id=${safeStringify(group_id)}`)
        return { group_id: gid }
      }
      if (scene === "private") {
        const uid = toInt(user_id)
        if (!uid) throw new Error(`[takeover.sendTo] invalid user_id=${safeStringify(user_id)}`)
        return String(uid)
      }
      throw new Error(`[takeover.sendTo] invalid scene=${safeStringify(scene)}`)
    })()

    if (proto === "onebotv11") {
      const rawList = Array.isArray(message) ? message : message ? [message] : []
      if (rawList.some(i => i && typeof i === "object" && i.type === "node")) {
        return await adapter.sendMsg(target, rawList)
      }
    }

    const preprocessed = preprocessOutboundMessage(message)
    const sanitized = sanitizeOutboundMessageForAdapter(preprocessed, {
      bot: state.bot,
      adapter: state.adapter,
    })
    const universal = coerceToUniversalMessage(sanitized)

    const segments = Array.isArray(universal?.segments) ? [...universal.segments] : []
    if (!segments.length) return null

    if (quote) {
      const ref = quoteRef || { msgId: state._lastMessageId, seq: state._lastMessageSeq }
      const replySeg = (() => {
        if (proto === "onebotv11") {
          const msgId = ref?.msgId !== undefined && ref?.msgId !== null ? String(ref.msgId) : undefined
          const seq = toInt(ref?.seq)
          if (msgId) return UniversalMessageSegment.reply({ msgId })
          if (seq !== undefined) return UniversalMessageSegment.reply({ seq })
          return null
        }
        if (proto === "milky") {
          const seq = toInt(ref?.seq) ?? toInt(ref?.msgId)
          if (seq !== undefined) return UniversalMessageSegment.reply({ seq })
          return null
        }
        return null
      })()

      if (replySeg) segments.unshift(replySeg)
    }

    if (proto === "onebotv11") {
      const msgObj = new UniversalMessage()
      msgObj.addSegments(segments)
      const onebotSegments = msgObj.convertTo("onebotv11")
      const res = await adapter.sendMsg(target, onebotSegments)
      rememberGroupSend(segments)
      return res
    }

    if (proto === "milky") {
      const res = await adapter.sendMsg(target, segments)
      rememberGroupSend(segments)
      const messageId = res?.message_id ?? res?.message_seq ?? res?.seq
      if (messageId !== undefined && messageId !== null) {
        return { ...(res && typeof res === "object" ? res : {}), message_id: messageId }
      }
      return res
    }

    throw new Error(`[takeover.sendTo] unsupported protocol=${proto}`)
  }

  state.recall = async ({ scene, group_id, user_id, message_id } = {}) => {
    const proto = state.protocol
    const mid = message_id !== undefined && message_id !== null ? String(message_id) : ""
    if (!mid) return false

    if (proto === "onebotv11") {
      return await adapter.deleteMessage?.call(adapter, { message_id: mid })
    }

    if (proto === "milky") {
      const seq = toInt(mid)
      if (seq === undefined) return false
      if (scene === "group") {
        const gid = toInt(group_id)
        if (!gid) return false
        return await adapter.recallGroupMessage?.call(adapter, { group_id: gid, message_seq: seq })
      }
      const uid = toInt(user_id)
      if (!uid) return false
      return await adapter.recallPrivateMessage?.call(adapter, { user_id: uid, message_seq: seq })
    }

    return false
  }

  return state
}

async function fillBotListsBestEffort(bot, state) {
  const adapter = state.adapter
  try {
    const groupsRes = await adapter.getGroupList?.call(adapter, {})
    const groups = Array.isArray(groupsRes) ? groupsRes : Array.isArray(groupsRes?.groups) ? groupsRes.groups : []
    for (const g of groups) {
      const gid = toInt(g?.group_id ?? g?.groupId ?? g?.id)
      if (!gid) continue
      const group_name = String(g?.group_name ?? g?.groupName ?? g?.name ?? "")
      state.groupInfoById.set(gid, { group_id: gid, group_name })
    }
  } catch (err) {
    logWarn("[xunlu-core][takeover] getGroupList failed:", err?.message || err)
  }

  try {
    const friendsRes = await adapter.getFriendList?.call(adapter, {})
    const friends = Array.isArray(friendsRes)
      ? friendsRes
      : Array.isArray(friendsRes?.friends)
        ? friendsRes.friends
        : []
    for (const f of friends) {
      const uid = toInt(f?.user_id ?? f?.userId ?? f?.uin ?? f?.id)
      if (!uid) continue
      const nickname = String(f?.nickname ?? f?.remark ?? f?.name ?? uid)
      state.friendInfoById.set(uid, { user_id: uid, nickname })
    }
  } catch (err) {
    logWarn("[xunlu-core][takeover] getFriendList failed:", err?.message || err)
  }

  const now = Math.floor(Date.now() / 1000)

  if (bot?.fl instanceof Map) {
    for (const [uid, info] of state.friendInfoById.entries()) {
      bot.fl.set(uid, { ...(info || {}), user_id: uid, uin: uid })
    }
  } else {
    logWarn("[xunlu-core][takeover] bot.fl is not a Map, skip fill")
  }

  if (bot?.gl instanceof Map) {
    for (const [gid, info] of state.groupInfoById.entries()) {
      bot.gl.set(gid, { ...(info || {}), group_id: gid, uin: state.selfId, update_time: now })
    }
  } else {
    logWarn("[xunlu-core][takeover] bot.gl is not a Map, skip fill")
  }
}

function getLoginInfoFromAdapter(protocol, loginInfoRaw) {
  const loginInfo = loginInfoRaw && typeof loginInfoRaw === "object" ? loginInfoRaw : {}

  if (protocol === "icqq") {
    const uin = toInt(
      loginInfo.uin ?? loginInfo.self_id ?? loginInfo.user_id ?? loginInfo.userId ?? loginInfo.botQQ,
    )
    const nickname = String(loginInfo.nickname ?? loginInfo.name ?? "")
    return { uin, nickname }
  }

  if (protocol === "milky") {
    const uin = toInt(loginInfo.uin ?? loginInfo.user_id ?? loginInfo.userId)
    const nickname = String(loginInfo.nickname ?? loginInfo.name ?? "")
    return { uin, nickname }
  }

  const uin = toInt(loginInfo.user_id ?? loginInfo.uin ?? loginInfo.userId)
  const nickname = String(loginInfo.nickname ?? loginInfo.name ?? "")
  return { uin, nickname }
}

export { createTakeoverState, fillBotListsBestEffort, getLoginInfoFromAdapter }
