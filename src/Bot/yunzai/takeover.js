import cfg from "../../lib/config.js"
import { MilkyAdapter, OneBotV11Adapter } from "../adapter/index.js"
import {
  UniversalMessage,
  UniversalMessageSegment,
  UniversalSegmentType,
} from "../message/universal-message.js"
import { coerceToUniversalMessage } from "../message/context.js"
import { rememberRuntimeLastGroupMessage } from "../state/last-group-message-store.js"

function getLogger() {
  const l = globalThis.logger
  if (!l || typeof l !== "object") return null
  return l
}

function logInfo(...args) {
  const l = getLogger()
  if (l?.info) return l.info(...args)
  return console.log(...args)
}

function logWarn(...args) {
  const l = getLogger()
  if (l?.warn) return l.warn(...args)
  return console.warn(...args)
}

function logError(...args) {
  const l = getLogger()
  if (l?.error) return l.error(...args)
  return console.error(...args)
}

function toInt(value) {
  if (value === undefined || value === null) return undefined
  const v = typeof value === "string" ? value.trim() : value
  if (v === "") return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function safeStringify(value) {
  try {
    return JSON.stringify(value)
  } catch {
    try {
      return String(value)
    } catch {
      return "[unserializable]"
    }
  }
}

function normalizeAdapterName(name) {
  const v = String(name || "").toLowerCase()
  if (v === "auto") return "auto"
  if (v === "milky") return "milky"
  if (v === "onebotv11" || v === "onebot-v11" || v === "onebot") return "onebotv11"
  return "auto"
}

function preprocessOutboundMessage(input) {
  const fixCorruptedJpegHeader = buf => {
    if (!Buffer.isBuffer(buf) || buf.length < 12) return buf

    // 某些链路会把 JPEG 的前 4 字节(FF D8 FF E0)污染成 FD FD FD FD，导致 OneBot 端无法识别类型
    // 典型特征：00 10 + "JFIF" 出现在偏移 4（即原本 APP0 的长度与标识仍在）
    const looksLikeJfif =
      buf[0] === 0xfd &&
      buf[1] === 0xfd &&
      buf[2] === 0xfd &&
      buf[3] === 0xfd &&
      buf[4] === 0x00 &&
      buf[5] === 0x10 &&
      buf[6] === 0x4a &&
      buf[7] === 0x46 &&
      buf[8] === 0x49 &&
      buf[9] === 0x46 &&
      buf[10] === 0x00

    if (!looksLikeJfif) return buf

    const fixed = Buffer.from(buf)
    fixed[0] = 0xff
    fixed[1] = 0xd8
    fixed[2] = 0xff
    fixed[3] = 0xe0
    return fixed
  }

  const convertOne = seg => {
    if (!seg || typeof seg !== "object") return seg

    // 支持 icqq segment.image(Buffer) / segment.record(Buffer) 等：转换为 onebot 常见 base64:// 形式
    if (seg.type === "image") {
      if (Buffer.isBuffer(seg.file)) {
        const fixed = fixCorruptedJpegHeader(seg.file)
        return { ...seg, file: `base64://${fixed.toString("base64")}` }
      }
      if (Buffer.isBuffer(seg?.data?.file)) {
        const fixed = fixCorruptedJpegHeader(seg.data.file)
        return { ...seg, data: { ...(seg.data || {}), file: `base64://${fixed.toString("base64")}` } }
      }
    }

    if (seg.type === "record" || seg.type === "voice") {
      if (Buffer.isBuffer(seg.file)) {
        return { ...seg, file: `base64://${seg.file.toString("base64")}` }
      }
      if (Buffer.isBuffer(seg?.data?.file)) {
        return { ...seg, data: { ...(seg.data || {}), file: `base64://${seg.data.file.toString("base64")}` } }
      }
    }

    return seg
  }

  if (Array.isArray(input)) return input.map(convertOne)
  return convertOne(input)
}

function extractRawTextFromYunzaiSegments(segments = []) {
  let text = ""
  for (const seg of Array.isArray(segments) ? segments : []) {
    if (!seg || typeof seg !== "object") continue
    if (seg.type === "text") text += seg.text || ""
    else if (seg.type === "xml" || seg.type === "json") {
      const d = seg.data ?? seg
      text += typeof d === "string" ? d : JSON.stringify(d)
    }
  }
  return String(text || "").trim()
}

function universalToYunzaiSegments(universalSegments = []) {
  const out = []
  for (const seg of Array.isArray(universalSegments) ? universalSegments : []) {
    if (!seg || typeof seg !== "object") continue
    const type = seg.type
    const data = seg.data || {}
    switch (type) {
      case UniversalSegmentType.TEXT:
        out.push({ type: "text", text: String(data.content ?? "") })
        break
      case UniversalSegmentType.MENTION:
        out.push({ type: "at", qq: data.target })
        break
      case UniversalSegmentType.MENTION_ALL:
        out.push({ type: "at", qq: 0 })
        break
      case UniversalSegmentType.EMOJI:
        out.push({ type: "face", id: Number(data.id) })
        break
      case UniversalSegmentType.REPLY:
        out.push({ type: "reply", id: data.msgId ?? data.seq })
        break
      case UniversalSegmentType.IMAGE: {
        const url = data.url || data.fileId || data.path || ""
        out.push({
          type: "image",
          url,
          file: data.fileId || url,
          summary: data.summary,
          width: data.width,
          height: data.height,
        })
        break
      }
      case UniversalSegmentType.FILE: {
        const fid = data.fileId || data.url || data.path || ""
        out.push({ type: "file", fid, name: data.name, size: data.size })
        break
      }
      case UniversalSegmentType.VOICE: {
        const file = data.url || data.fileId || data.path || ""
        out.push({ type: "record", file })
        break
      }
      case UniversalSegmentType.VIDEO: {
        const file = data.url || data.fileId || data.path || ""
        out.push({ type: "video", file })
        break
      }
      case UniversalSegmentType.FORWARD:
        out.push({ type: "text", text: "[forward]" })
        break
      default:
        out.push({ type: "text", text: JSON.stringify(seg) })
        break
    }
  }
  return out
}

function mapOnebotNoticeSubType(noticeType, subType) {
  const t = String(noticeType || "").toLowerCase()
  const st = String(subType || "").toLowerCase()
  if (t === "group_increase") return "increase"
  if (t === "group_decrease") return "decrease"
  if (t === "group_admin") return "admin"
  if (t === "group_upload") return "upload"
  if (t === "group_recall") return "recall"
  if (t === "group_ban") return "ban"
  if (t === "group_whole_ban") return "allban"
  if (t === "friend_add") return "add"
  if (t === "notify") return st || "poke"
  return st || t || ""
}

function getLoginInfoFromAdapter(protocol, loginInfoRaw) {
  const loginInfo = loginInfoRaw && typeof loginInfoRaw === "object" ? loginInfoRaw : {}

  if (protocol === "milky") {
    const uin = toInt(loginInfo.uin ?? loginInfo.user_id ?? loginInfo.userId)
    const nickname = String(loginInfo.nickname ?? loginInfo.name ?? "")
    return { uin, nickname }
  }

  // onebotv11
  const uin = toInt(loginInfo.user_id ?? loginInfo.uin ?? loginInfo.userId)
  const nickname = String(loginInfo.nickname ?? loginInfo.name ?? "")
  return { uin, nickname }
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
    memberInfoByGroupId: new Map(), // group_id => Map(user_id => info)
  }

  state.getGroup = groupId => {
    const gid = toInt(groupId)
    if (!gid) return null
    if (state.groupFacadeById.has(gid)) return state.groupFacadeById.get(gid)

    const group = {
      group_id: gid,
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
        // best-effort fallback (may be unsupported in some envs)
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
      nickname: info.nickname ?? String(uid),
      card: info.card ?? info.nickname ?? String(uid),
      role,
      is_owner: isOwner,
      is_admin: isAdmin,
      info,
      _info: info,
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
      nickname,
      card,
      role,
      update_time: Math.floor(Date.now() / 1000),
      _info: { role },
    }

    map.set(uid, memberInfo)

    // best-effort: 同步到 icqq 的 gml 缓存，供 group.pickMember().info 使用
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

    // onebot: 透传 node 转发消息（避免被 UniversalMessage 降级为文本）
    if (proto === "onebotv11") {
      const rawList = Array.isArray(message) ? message : message ? [message] : []
      if (rawList.some(i => i && typeof i === "object" && i.type === "node")) {
        return await adapter.sendMsg(target, rawList)
      }
    }

    const preprocessed = preprocessOutboundMessage(message)
    const universal = coerceToUniversalMessage(preprocessed)

    const segments = Array.isArray(universal?.segments) ? [...universal.segments] : []

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

  // 兼容云崽：Bot.fl / Bot.gl 可能被插件直接访问（注意：icqq 会 lock 这些属性，不能替换，只能填充）
  const now = Math.floor(Date.now() / 1000)

  if (bot?.fl instanceof Map) {
    for (const [uid, info] of state.friendInfoById.entries()) {
      bot.fl.set(uid, { ...(info || {}), user_id: uid })
    }
  } else {
    logWarn("[xunlu-core][takeover] bot.fl is not a Map, skip fill")
  }

  if (bot?.gl instanceof Map) {
    for (const [gid, info] of state.groupInfoById.entries()) {
      bot.gl.set(gid, { ...(info || {}), group_id: gid, update_time: now })
    }
  } else {
    logWarn("[xunlu-core][takeover] bot.gl is not a Map, skip fill")
  }
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

        // best-effort fallback
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

  // patch icqq entity prototypes once (pickUser/pickGroup are locked, so we hook their returned objects instead)
  patchIcqqEntitiesForTakeover(bot)

  bot.__xunlu_takeover_patched = true
  bot.__xunlu_takeover_state = state

  // 保存原始方法（避免重复 patch 或后续回滚需要）
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

  // 基本身份信息
  const uin = toInt(loginInfo?.uin)
  const nickname = loginInfo?.nickname ? String(loginInfo.nickname) : undefined
  if (uin) bot.uin = uin
  if (nickname !== undefined) bot.nickname = nickname

  // 兼容：Bot[uin] 取自身
  if (uin) bot[String(uin)] = bot
  state.selfId = toInt(bot.uin) ?? state.selfId

  // 让 xunlu-core 的 icqq bridge（可选启动）能识别协议类型
  try {
    if (!bot.adapter || typeof bot.adapter !== "object") bot.adapter = {}
    if (!bot.adapter.name) {
      bot.adapter.name = state.protocol === "onebotv11" ? "OneBotv11" : state.protocol === "milky" ? "milky" : "icqq"
    }
  } catch {}

  // best-effort: 提供 sendApi(action, params)（有些生态会用 onebot 风格 sendApi）
  if (typeof bot.sendApi !== "function") {
    bot.sendApi = async (action, params = {}) => {
      if (typeof state.adapter?.callApi === "function") return await state.adapter.callApi(action, params)
      throw new Error("[takeover] adapter.callApi not available")
    }
  }

  // 标记适配器类型，便于通用 API 识别（onebotv11/milky）
  try {
    if (!bot.adapterType) {
      bot.adapterType =
        state.protocol === "onebotv11" ? "OneBotv11" : state.protocol === "milky" ? "milky" : "icqq"
    }
  } catch {}

  // best-effort: 将常用 Bot API 代理到 adapter（用于 xunlu-core 通用 API / 插件生态）
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
    // message
    "sendMsg",
    "deleteMessage",
    "getMessage",
    // bot info
    "getLoginInfo",
    // friends/groups
    "getFriendList",
    "getFriendInfo",
    "getGroupList",
    "getGroupInfo",
    "getGroupMemberList",
    "getGroupMemberInfo",
    // admin actions
    "setGroupName",
    "setGroupMemberCard",
    "setGroupMemberAdmin",
    "setGroupMemberSpecialTitle",
    "setGroupMemberMute",
    "setGroupWholeMute",
    "kickGroupMember",
    "quitGroup",
    // requests / reactions
    "acceptFriendRequest",
    "rejectFriendRequest",
    "acceptGroupRequest",
    "rejectGroupRequest",
    "sendGroupMessageReaction",
    // pickers (some ecosystems call these directly)
    "pickUser",
    "pickGroup",
  ].forEach(name => bindAdapterMethod(name, { force: false }))

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

  // 兼容：部分云崽插件直接调用 bot.sendPrivateMsg / bot.sendGroupMsg
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

  // takeover 视为在线（避免插件拒绝工作）
  bot.isOnline = () => true
}

function startBridgeOnebot(bot, state) {
  const adapter = state.adapter

  adapter.on("message", payload => {
    try {
      if (!payload || typeof payload !== "object") return
      if (state.ignoreSelf && String(payload.user_id ?? "") === String(state.selfId ?? "")) return

      const universal = UniversalMessage.from("onebotv11", Array.isArray(payload.message) ? payload.message : [])
      const message = universalToYunzaiSegments(universal.segments)

      const message_type = payload.message_type === "group" || payload.group_id ? "group" : "private"
      const group_id = message_type === "group" ? toInt(payload.group_id) : undefined
      const user_id = toInt(payload.user_id)

      if (group_id && user_id && payload?.sender) {
        state.upsertMember(group_id, user_id, payload.sender)
      }

      const e = {
        self_id: state.selfId,
        time: payload.time ?? Math.floor(Date.now() / 1000),
        post_type: "message",
        message_type,
        sub_type: payload.sub_type || "normal",
        group_id,
        user_id,
        message_id: payload.message_id !== undefined ? String(payload.message_id) : undefined,
        raw_message: String(payload.raw_message || extractRawTextFromYunzaiSegments(message)),
        protocol: "onebotv11",
        // 保留原始 onebot 段，供 xunlu-core 等需要按协议解析 reply/at 的逻辑使用
        segments: Array.isArray(payload.message) ? payload.message : [],
        message,
        sender: payload.sender || { user_id, nickname: String(user_id || "") },
        __xunluTakeover: true,
        __commandUsageSource: "yunzai-takeover",
      }

      if (group_id) {
        e.group = state.getGroup(group_id)
        e.member = state.getMember(group_id, user_id)
      } else {
        e.friend = state.getUser(user_id)
      }

      e.reply = async (msg = "", quote = false) => {
        state._lastMessageId = e.message_id
        return await state.sendTo({
          scene: group_id ? "group" : "private",
          group_id,
          user_id,
          message: msg,
          quote,
          quoteRef: { msgId: e.message_id },
        })
      }

      e.toString = () => e.raw_message

      bot.emit("message", e)
    } catch (err) {
      logError("[xunlu-core][takeover] onebot message bridge failed:", err)
    }
  })

  adapter.on("notice", payload => {
    try {
      if (!payload || typeof payload !== "object") return
      const gid = toInt(payload.group_id)
      const target_id = toInt(
        payload.target_id ?? payload.targetId ?? payload.receiver_id ?? payload.receiverId ?? payload.user_id,
      )
      const nativeNoticeType = String(payload.notice_type || "").toLowerCase()
      const isRecallNotice =
        nativeNoticeType === "group_recall" || nativeNoticeType === "friend_recall"
      const recalledUserId = toInt(payload.user_id)
      const sender_id = isRecallNotice
        ? recalledUserId
        : toInt(
            payload.sender_id ??
              payload.senderId ??
              payload.operator_id ??
              payload.operatorId ??
              payload.user_id,
          )
      const uid = isRecallNotice ? recalledUserId : sender_id ?? toInt(payload.user_id)
      const operator_id = isRecallNotice
        ? toInt(payload.operator_id ?? payload.operatorId ?? sender_id)
        : toInt(payload.operator_id ?? payload.operatorId ?? sender_id)

      const notice_type = gid ? "group" : "friend"
      const sub_type = mapOnebotNoticeSubType(payload.notice_type, payload.sub_type)

      const e = {
        self_id: state.selfId,
        time: payload.time ?? Math.floor(Date.now() / 1000),
        post_type: "notice",
        notice_type,
        sub_type,
        group_id: gid,
        user_id: uid,
        sender_id,
        operator_id,
        message_id:
          payload.message_id !== undefined && payload.message_id !== null
            ? String(payload.message_id)
            : undefined,
        target_id,
        targetId: target_id,
        receiver_id: target_id,
        receiverId: target_id,
        raw_message: "",
        message: [],
      }

      if (gid) {
        e.group = state.getGroup(gid)
        e.member = state.getMember(gid, uid)
      } else {
        e.friend = state.getUser(uid)
      }

      bot.emit("notice", e)
    } catch (err) {
      logError("[xunlu-core][takeover] onebot notice bridge failed:", err)
    }
  })

  adapter.on("request", payload => {
    try {
      if (!payload || typeof payload !== "object") return
      const gid = toInt(payload.group_id)
      const uid = toInt(payload.user_id)

      const e = {
        self_id: state.selfId,
        time: payload.time ?? Math.floor(Date.now() / 1000),
        post_type: "request",
        request_type: payload.request_type || (gid ? "group" : "friend"),
        sub_type: payload.sub_type || "",
        group_id: gid,
        user_id: uid,
        flag: payload.flag,
        comment: payload.comment,
        raw_message: "",
        message: [],
      }

      if (gid) {
        e.group = state.getGroup(gid)
      } else {
        e.friend = state.getUser(uid)
      }

      bot.emit("request", e)
    } catch (err) {
      logError("[xunlu-core][takeover] onebot request bridge failed:", err)
    }
  })
}

function startBridgeMilky(bot, state) {
  const adapter = state.adapter

  const bind = (eventType, handler) => {
    try {
      adapter.on(eventType, handler)
    } catch (err) {
      logWarn("[xunlu-core][takeover] bind milky event failed:", eventType, err?.message || err)
    }
  }

  const emitNotice = (
    eventData,
    { notice_type, sub_type, group_id, user_id, sender_id, operator_id, target_id, extra } = {},
  ) => {
    const gid = toInt(group_id)
    const uid = toInt(user_id)
    const sid = toInt(sender_id ?? operator_id ?? uid)
    const tid = toInt(target_id)

    const e = {
      self_id: state.selfId,
      time: eventData?.time ?? Math.floor(Date.now() / 1000),
      post_type: "notice",
      notice_type,
      sub_type,
      group_id: gid,
      user_id: uid,
      sender_id: sid,
      senderId: sid,
      operator_id: toInt(operator_id),
      operatorId: toInt(operator_id),
      target_id: tid,
      targetId: tid,
      receiver_id: tid,
      receiverId: tid,
      raw_message: "",
      message: [],
      ...(extra && typeof extra === "object" ? extra : {}),
    }

    if (gid) {
      e.group = state.getGroup(gid)
      if (uid) e.member = state.getMember(gid, uid)
    } else if (uid) {
      e.friend = state.getUser(uid)
    }

    bot.emit("notice", e)
  }

  const emitRequest = (eventData, { request_type, sub_type, group_id, user_id, flag, comment, extra } = {}) => {
    const gid = toInt(group_id)
    const uid = toInt(user_id)

    const e = {
      self_id: state.selfId,
      time: eventData?.time ?? Math.floor(Date.now() / 1000),
      post_type: "request",
      request_type,
      sub_type,
      group_id: gid,
      user_id: uid,
      flag,
      comment,
      raw_message: "",
      message: [],
      ...(extra && typeof extra === "object" ? extra : {}),
    }

    if (gid) e.group = state.getGroup(gid)
    else if (uid) e.friend = state.getUser(uid)

    bot.emit("request", e)
  }

  bind("message_receive", packet => {
    try {
      const eventData = packet?.data
      if (!eventData || typeof eventData !== "object") return

      const message_scene = String(eventData.message_scene || "")
      const message_type = message_scene === "group" ? "group" : "private"
      const group_id = message_type === "group" ? toInt(eventData.peer_id) : undefined
      const user_id = toInt(eventData.sender_id)
      const message_seq = toInt(eventData.message_seq)

      if (state.ignoreSelf && String(user_id ?? "") === String(state.selfId ?? "")) return

      const milkySegments = Array.isArray(eventData.segments) ? eventData.segments : []
      const universal = UniversalMessage.from("milky", milkySegments)
      const message = universalToYunzaiSegments(universal.segments)

      const senderRaw = eventData.group_member || eventData.sender || {}
      if (group_id && user_id) state.upsertMember(group_id, user_id, senderRaw)

      const e = {
        self_id: state.selfId,
        time: eventData.time ?? Math.floor(Date.now() / 1000),
        post_type: "message",
        message_type,
        sub_type: "normal",
        group_id,
        user_id,
        message_id: message_seq !== undefined ? String(message_seq) : undefined,
        seq: message_seq,
        message_seq,
        raw_message: extractRawTextFromYunzaiSegments(message),
        protocol: "milky",
        // 保留原始 milky 段，供需要按协议解析 reply/at 的逻辑使用
        segments: milkySegments,
        message,
        sender: {
          user_id,
          nickname: String(senderRaw?.nickname ?? senderRaw?.name ?? user_id ?? ""),
          card: String(senderRaw?.card ?? senderRaw?.member_card ?? senderRaw?.memberCard ?? senderRaw?.nickname ?? ""),
          role: String(senderRaw?.role ?? "member"),
        },
        __xunluTakeover: true,
        __commandUsageSource: "yunzai-takeover",
      }

      if (group_id) {
        e.group = state.getGroup(group_id)
        e.member = state.getMember(group_id, user_id)
      } else {
        e.friend = state.getUser(user_id)
      }

      e.reply = async (msg = "", quote = false) => {
        state._lastMessageSeq = message_seq
        return await state.sendTo({
          scene: group_id ? "group" : "private",
          group_id,
          user_id,
          message: msg,
          quote,
          quoteRef: { seq: message_seq },
        })
      }

      e.toString = () => e.raw_message

      bot.emit("message", e)
    } catch (err) {
      logError("[xunlu-core][takeover] milky message bridge failed:", err)
    }
  })

  // ---- best-effort: request/notice injection (milky -> 云崽事件结构) ----

  bind("friend_request", packet => {
    try {
      const eventData = packet?.data
      if (!eventData || typeof eventData !== "object") return

      const user_id = toInt(eventData.initiator_id ?? eventData.initiatorId ?? eventData.user_id ?? eventData.userId)
      if (state.ignoreSelf && String(user_id ?? "") === String(state.selfId ?? "")) return

      emitRequest(eventData, {
        request_type: "friend",
        sub_type: "add",
        user_id,
        flag: eventData.notification_seq ?? eventData.notificationSeq ?? eventData.flag,
        comment: eventData.comment ?? eventData.message ?? "",
      })
    } catch (err) {
      logError("[xunlu-core][takeover] milky friend_request bridge failed:", err)
    }
  })

  bind("group_join_request", packet => {
    try {
      const eventData = packet?.data
      if (!eventData || typeof eventData !== "object") return

      const group_id = toInt(eventData.peer_id ?? eventData.group_id ?? eventData.groupId)
      const user_id = toInt(eventData.initiator_id ?? eventData.initiatorId ?? eventData.user_id ?? eventData.userId)
      if (state.ignoreSelf && String(user_id ?? "") === String(state.selfId ?? "")) return

      emitRequest(eventData, {
        request_type: "group",
        sub_type: "add",
        group_id,
        user_id,
        flag: eventData.notification_seq ?? eventData.notificationSeq ?? eventData.flag,
        comment: eventData.comment ?? eventData.message ?? "",
      })
    } catch (err) {
      logError("[xunlu-core][takeover] milky group_join_request bridge failed:", err)
    }
  })

  bind("group_invited_join_request", packet => {
    try {
      const eventData = packet?.data
      if (!eventData || typeof eventData !== "object") return

      const group_id = toInt(eventData.peer_id ?? eventData.group_id ?? eventData.groupId)
      const user_id = toInt(eventData.initiator_id ?? eventData.initiatorId ?? eventData.user_id ?? eventData.userId)
      if (state.ignoreSelf && String(user_id ?? "") === String(state.selfId ?? "")) return

      emitRequest(eventData, {
        request_type: "group",
        sub_type: "invite",
        group_id,
        user_id,
        flag: eventData.notification_seq ?? eventData.notificationSeq ?? eventData.flag,
        comment: eventData.comment ?? eventData.message ?? "",
      })
    } catch (err) {
      logError("[xunlu-core][takeover] milky group_invited_join_request bridge failed:", err)
    }
  })

  bind("message_recall", packet => {
    try {
      const eventData = packet?.data
      if (!eventData || typeof eventData !== "object") return

      const message_scene = String(eventData.message_scene || "")
      const isGroup = message_scene === "group"
      const group_id = isGroup ? toInt(eventData.peer_id ?? eventData.group_id) : undefined
      const sender_id = toInt(
        eventData.sender_id ??
          eventData.senderId ??
          eventData.user_id ??
          eventData.userId,
      )
      const operator_id = toInt(
        eventData.operator_id ??
          eventData.operatorId ??
          eventData.initiator_id ??
          eventData.initiatorId,
      )
      const user_id = sender_id ?? operator_id

      emitNotice(eventData, {
        notice_type: isGroup ? "group" : "friend",
        sub_type: "recall",
        group_id,
        user_id,
        sender_id: sender_id ?? operator_id,
        operator_id,
        extra: {
          message_id: eventData.message_seq ?? eventData.messageSeq,
          message_seq: eventData.message_seq ?? eventData.messageSeq,
        },
      })
    } catch (err) {
      logError("[xunlu-core][takeover] milky message_recall bridge failed:", err)
    }
  })

  const bindGroupNotice = (eventType, subType) => {
    bind(eventType, packet => {
      try {
        const eventData = packet?.data
        if (!eventData || typeof eventData !== "object") return

        const group_id = toInt(eventData.peer_id ?? eventData.group_id ?? eventData.groupId)
        const user_id = toInt(
          eventData.target_id ??
            eventData.targetId ??
            eventData.user_id ??
            eventData.userId ??
            eventData.initiator_id ??
            eventData.initiatorId,
        )
        const operator_id = toInt(eventData.operator_id ?? eventData.operatorId)

        emitNotice(eventData, {
          notice_type: "group",
          sub_type: subType,
          group_id,
          user_id,
          sender_id:
            eventData.sender_id ??
            eventData.senderId ??
            eventData.initiator_id ??
            eventData.initiatorId ??
            eventData.operator_id ??
            eventData.operatorId,
          operator_id,
          target_id: eventData.target_id ?? eventData.targetId ?? eventData.receiver_id ?? eventData.receiverId,
          extra: { milky: eventData },
        })
      } catch (err) {
        logError(`[xunlu-core][takeover] milky ${eventType} bridge failed:`, err)
      }
    })
  }

  bindGroupNotice("group_member_increase", "increase")
  bindGroupNotice("group_member_decrease", "decrease")
  bindGroupNotice("group_admin_change", "admin")
  bindGroupNotice("group_mute", "ban")
  bindGroupNotice("group_whole_mute", "allban")
  bindGroupNotice("group_nudge", "poke")
  bindGroupNotice("group_file_upload", "upload")

  bind("friend_nudge", packet => {
    try {
      const eventData = packet?.data
      if (!eventData || typeof eventData !== "object") return

      const user_id = toInt(
        eventData.initiator_id ??
          eventData.initiatorId ??
          eventData.sender_id ??
          eventData.senderId ??
          eventData.user_id ??
          eventData.userId,
      )

      emitNotice(eventData, {
        notice_type: "friend",
        sub_type: "poke",
        user_id,
        sender_id:
          eventData.sender_id ??
          eventData.senderId ??
          eventData.initiator_id ??
          eventData.initiatorId ??
          user_id,
        operator_id: user_id,
        target_id: eventData.target_id ?? eventData.targetId ?? eventData.receiver_id ?? eventData.receiverId,
        extra: { milky: eventData },
      })
    } catch (err) {
      logError("[xunlu-core][takeover] milky friend_nudge bridge failed:", err)
    }
  })

  bind("friend_file_upload", packet => {
    try {
      const eventData = packet?.data
      if (!eventData || typeof eventData !== "object") return

      const user_id = toInt(eventData.sender_id ?? eventData.senderId ?? eventData.user_id ?? eventData.userId)
      emitNotice(eventData, {
        notice_type: "friend",
        sub_type: "upload",
        user_id,
        operator_id: user_id,
        extra: { milky: eventData },
      })
    } catch (err) {
      logError("[xunlu-core][takeover] milky friend_file_upload bridge failed:", err)
    }
  })
}

async function connectAdapterByName(adapterName, { botCfg = {}, onebotCfg = {} } = {}) {
  const name = normalizeAdapterName(adapterName)

  const tryMilky = async () => {
    const adapter = new MilkyAdapter({ ...(botCfg || {}) })
    const loginInfoRaw = await adapter.getLoginInfo()
    return { protocol: "milky", adapter, loginInfoRaw }
  }

  const tryOnebot = async () => {
    const wsPort = onebotCfg.wsPort || 2955
    const wsPath = onebotCfg.wsPath || "/OneBotV11"
    const adapter = new OneBotV11Adapter({ wsPort, wsPath })
    adapter.startServer()
    await adapter.waitUntilConnected({ timeoutMs: 60000 })
    const loginInfoRaw = await adapter.getLoginInfo()
    return { protocol: "onebotv11", adapter, loginInfoRaw }
  }

  if (name === "milky") return await tryMilky()
  if (name === "onebotv11") return await tryOnebot()

  // auto
  try {
    return await tryMilky()
  } catch (err) {
    logWarn("[xunlu-core][takeover] milky connect failed, fallback onebotv11:", err?.message || err)
  }
  return await tryOnebot()
}

export async function startYunzaiTakeover({ bot, ignoreSelf } = {}) {
  const runtimeBot = bot || globalThis.Bot
  if (!runtimeBot) throw new Error("[takeover] global Bot not found")

  if (runtimeBot.__xunlu_takeover_started) {
    return runtimeBot.__xunlu_takeover_started
  }

  const botCfg = cfg.getConfig("bot") || {}
  const onebotCfg = cfg.getConfig("onebot") || {}
  const adapterName = normalizeAdapterName(process.env.XUNLU_ADAPTER || botCfg.adapter || "auto")

  logInfo("[xunlu-core][takeover] starting...", { adapter: adapterName })

  const { protocol, adapter, loginInfoRaw } = await connectAdapterByName(adapterName, { botCfg, onebotCfg })
  const loginInfo = getLoginInfoFromAdapter(protocol, loginInfoRaw)

  logInfo("[xunlu-core][takeover] adapter ready:", { protocol, uin: loginInfo.uin, nickname: loginInfo.nickname })

  const state = createTakeoverState({
    bot: runtimeBot,
    protocol,
    adapter,
    ignoreSelf: ignoreSelf !== undefined ? Boolean(ignoreSelf) : true,
  })

  patchYunzaiBot(runtimeBot, state, { loginInfo })
  await fillBotListsBestEffort(runtimeBot, state)

  if (protocol === "onebotv11") startBridgeOnebot(runtimeBot, state)
  else if (protocol === "milky") startBridgeMilky(runtimeBot, state)
  else throw new Error(`[takeover] unsupported protocol=${protocol}`)

  runtimeBot.__xunlu_takeover_started = { protocol, loginInfo, adapterName }
  return runtimeBot.__xunlu_takeover_started
}
