import {
  attachStandardMessageApis,
  applyDerivedFieldsFromUniversalSegments,
} from "../message/context.js"
import { UniversalMessage, UniversalSegmentType } from "../message/universal-message.js"
import { applyUniversalBotApi } from "../api/universal-bot-api.js"
import { installTakeoverBotCompatProxy } from "../yunzai/takeover.js"
import { normalizeEventTargetFields } from "./shared.js"

/**
 * MessagePipeline 负责把“原始协议事件”整理成插件可消费的统一上下文。
 *
 * 它只做事件标准化，不负责命令分发或回复发送。
 */
export class MessagePipeline {
  constructor(baseBot, roleResolver) {
    this.baseBot = baseBot
    this.roleResolver = roleResolver
  }

  async prepareEvent(e) {
    if (!e || typeof e !== "object") return

    if (e.__xunluTakeover && globalThis.Bot) {
      globalThis.Bot = installTakeoverBotCompatProxy(globalThis.Bot)
    }

    // 统一 self_id 格式，便于 atBot 判断
    e.self_id = Array.isArray(e.self_id) ? e.self_id[0] : e?.self_id

    // 统一 rawSegments：保留转换前段数组（优先 segments，其次 message）
    if (!Array.isArray(e.rawSegments)) {
      if (Array.isArray(e.segments)) e.rawSegments = e.segments
      else if (Array.isArray(e.message)) e.rawSegments = e.message
    }

    // 兜底推断协议类型（多数情况下由各适配器事件层注入 e.protocol）
    if (!e.protocol) {
      const adapterHint = String(e.adapterType || this.baseBot.adapter || "").toLowerCase()
      if (adapterHint.includes("milky")) e.protocol = "milky"
      else if (adapterHint.includes("onebot")) e.protocol = "onebotv11"
      else if (adapterHint.includes("icqq")) e.protocol = "icqq"
    }

    const tryParseJsonPayload = payload => {
      if (!payload) return null
      if (typeof payload === "object") return payload
      if (typeof payload !== "string") return null
      const text = payload.trim()
      if (!text) return null
      try {
        return JSON.parse(text)
      } catch {
        return null
      }
    }

    const extractJsonFromSegments = segments => {
      if (!Array.isArray(segments)) return null

      const protocol = String(e.protocol || "").toLowerCase()

      if (protocol === "milky") {
        const lightApp = segments.find(seg => seg?.type === "light_app")
        const payload = lightApp?.data?.json_payload ?? lightApp?.data?.jsonPayload
        return tryParseJsonPayload(payload)
      }

      const jsonSeg = segments.find(seg => seg?.type === "json")
      if (!jsonSeg) return null
      const payload = jsonSeg?.data?.data ?? jsonSeg?.data?.json ?? jsonSeg?.data ?? jsonSeg?.json
      return tryParseJsonPayload(payload)
    }

    if (!e.json) {
      e.json = extractJsonFromSegments(e.rawSegments) || undefined
    }

    const looksLikeUniversalSegment = seg =>
      Boolean(
        (seg?.type === UniversalSegmentType.TEXT &&
          seg?.data &&
          (Object.prototype.hasOwnProperty.call(seg.data, "text") ||
            Object.prototype.hasOwnProperty.call(seg.data, "content"))) ||
          (seg?.type === UniversalSegmentType.MENTION &&
            seg?.data &&
            (Object.prototype.hasOwnProperty.call(seg.data, "qq") ||
              Object.prototype.hasOwnProperty.call(seg.data, "target"))) ||
          (seg?.type === UniversalSegmentType.MENTION_ALL &&
            seg?.data &&
            typeof seg.data === "object") ||
          (seg?.type === UniversalSegmentType.REPLY &&
            seg?.data &&
            (Object.prototype.hasOwnProperty.call(seg.data, "id") ||
              Object.prototype.hasOwnProperty.call(seg.data, "msgId") ||
              Object.prototype.hasOwnProperty.call(seg.data, "seq"))) ||
          ((seg?.type === UniversalSegmentType.IMAGE ||
            seg?.type === UniversalSegmentType.VOICE ||
            seg?.type === UniversalSegmentType.VIDEO ||
            seg?.type === UniversalSegmentType.FILE) &&
            seg?.data &&
            (Object.prototype.hasOwnProperty.call(seg.data, "file") ||
              Object.prototype.hasOwnProperty.call(seg.data, "url") ||
              Object.prototype.hasOwnProperty.call(seg.data, "fileId") ||
              Object.prototype.hasOwnProperty.call(seg.data, "path") ||
              Object.prototype.hasOwnProperty.call(seg.data, "id"))),
      )

    const looksLikeUniversalSegments = segments =>
      Array.isArray(segments) &&
      segments.length > 0 &&
      segments.every(seg => looksLikeUniversalSegment(seg))

    const rawLooksUniversal = looksLikeUniversalSegments(e.rawSegments)
    if (!e.universalMessage && Array.isArray(e.rawSegments) && e.protocol && !rawLooksUniversal) {
      try {
        e.universalMessage = UniversalMessage.from(e.protocol, e.rawSegments)
      } catch {}
    }

    if (e.universalMessage) {
      e.message = e.universalMessage.segments
    } else if (Array.isArray(e.message) && e.protocol) {
      const looksUniversal = looksLikeUniversalSegments(e.message)

      if (!looksUniversal) {
        try {
          e.universalMessage = UniversalMessage.from(e.protocol, e.message)
          e.message = e.universalMessage.segments
        } catch {}
      }
    }

    if (Array.isArray(e.message)) {
      applyDerivedFieldsFromUniversalSegments(e)

      if (!e.url && e.json && typeof e.json === "object") {
        const derivedUrl =
          e.json?.meta?.detail_1?.qqdocurl ||
          e.json?.meta?.detail_1?.url ||
          e.json?.meta?.news?.jumpUrl ||
          e.json?.meta?.news?.jump_url ||
          e.json?.meta?.news?.jumpURL ||
          ""
        if (derivedUrl) e.url = String(derivedUrl)
      }
    } else if (!e.msg) {
      e.msg = e.raw_message || ""
    }

    e.logText = ""

    e.isGroup = Boolean(e.group_id)
    e.isPrivate = !e.isGroup && (e.message_type === "private" || Boolean(e.friend))

    if (e.isPrivate) {
      if (!e.sender) {
        const nickname = e.friend?.nickname || e.sender?.nickname || ""
        e.sender = { card: nickname, nickname }
      } else if (e.sender && !e.sender.card) {
        e.sender.card = e.sender.nickname
      }
      const senderId = e.sender_id ?? e.user_id ?? ""
      e.logText = `[私聊][${e.sender.nickname}(${senderId})]`
    }

    if (e.isGroup) {
      if (!e.sender) {
        e.sender = {
          card: e.group_member?.card,
          nickname: e.group_member?.nickname,
        }
      }
      if (!e.group_name) e.group_name = e.group?.group_name || e.group_name
      const displayName = e.sender?.card || e.sender?.nickname || ""
      e.logText = `[${e.group_name || e.group_id}(${displayName})]`
    }

    const masters = await this.roleResolver.getMasterList()
    const uid = e.sender_id ?? e.user_id
    const uidNum = Number(uid)
    if (Array.isArray(masters) && (masters.includes(uidNum) || masters.includes(uid))) {
      e.isMaster = true
    }

    normalizeEventTargetFields(e)
    attachStandardMessageApis(e)

    const universalOverride = [
      "callApi",
      "sendApi",
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
      "pickUser",
      "renderImg",
    ]

    if (typeof e.sendMessage === "function" && e.sendMessage.__xunlu_legacy_sendMessage) {
      universalOverride.unshift("sendMessage")
    }

    applyUniversalBotApi(e, {
      bot: this.baseBot,
      adapterHint: this.baseBot.adapter,
      override: universalOverride,
    })

    await this.roleResolver.enrichGroupRoleFlags(e)
  }
}

export default MessagePipeline
