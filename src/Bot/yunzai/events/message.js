import { UniversalMessage, UniversalSegmentType } from "../../message/universal-message.js"

function extractRawTextFromYunzaiSegments(segments = []) {
  let text = ""
  for (const seg of Array.isArray(segments) ? segments : []) {
    if (!seg || typeof seg !== "object") continue
    if (seg.type === "text") text += seg.text || ""
    else if (seg.type === "xml" || seg.type === "json") {
      const data = seg.data ?? seg
      text += typeof data === "string" ? data : JSON.stringify(data)
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

function attachSceneRefs(e, state, groupId, userId) {
  if (groupId) {
    e.group = state.getGroup(groupId)
    e.member = state.getMember(groupId, userId)
    return
  }
  e.friend = state.getUser(userId)
}

export function bindOnebotTakeoverMessage({ on, bot, state, helpers } = {}) {
  const { toInt, logError } = helpers

  on("message", payload => {
    try {
      if (!payload || typeof payload !== "object") return
      if (state.ignoreSelf && String(payload.user_id ?? "") === String(state.selfId ?? "")) return

      const rawSegments = Array.isArray(payload.message) ? payload.message : []
      const universal = UniversalMessage.from("onebotv11", rawSegments)
      const message = universalToYunzaiSegments(universal.segments)

      const message_type = payload.message_type === "group" || payload.group_id ? "group" : "private"
      const group_id = message_type === "group" ? toInt(payload.group_id) : undefined
      const user_id = toInt(payload.user_id)

      if (group_id && user_id && payload.sender) {
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
        segments: rawSegments,
        message,
        sender: payload.sender || { user_id, nickname: String(user_id || "") },
        __xunluTakeover: true,
        __commandUsageSource: "yunzai-takeover",
      }

      attachSceneRefs(e, state, group_id, user_id)

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
}

export function bindMilkyTakeoverMessage({ on, bot, state, helpers } = {}) {
  const { toInt, logError } = helpers

  on("message_receive", packet => {
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
        segments: milkySegments,
        message,
        sender: {
          user_id,
          nickname: String(senderRaw?.nickname ?? senderRaw?.name ?? user_id ?? ""),
          card: String(
            senderRaw?.card ??
              senderRaw?.member_card ??
              senderRaw?.memberCard ??
              senderRaw?.nickname ??
              "",
          ),
          role: String(senderRaw?.role ?? "member"),
        },
        __xunluTakeover: true,
        __commandUsageSource: "yunzai-takeover",
      }

      attachSceneRefs(e, state, group_id, user_id)

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
}

