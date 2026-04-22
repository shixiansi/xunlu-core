function mapOnebotNoticeSubType(noticeType, subType) {
  const type = String(noticeType || "").toLowerCase()
  const normalizedSubType = String(subType || "").toLowerCase()
  if (type === "group_increase") return "increase"
  if (type === "group_decrease") return "decrease"
  if (type === "group_admin") return "admin"
  if (type === "group_upload") return "upload"
  if (type === "group_recall") return "recall"
  if (type === "group_ban") return "ban"
  if (type === "group_whole_ban") return "allban"
  if (type === "friend_add") return "add"
  if (type === "notify") return normalizedSubType || "poke"
  return normalizedSubType || type || ""
}

function attachNoticeRefs(e, state, groupId, userId) {
  if (groupId) {
    e.group = state.getGroup(groupId)
    e.member = state.getMember(groupId, userId)
    return
  }
  e.friend = state.getUser(userId)
}

function emitMilkyNotice(bot, state, helpers, eventData, options = {}) {
  const { toInt } = helpers
  const { notice_type, sub_type, group_id, user_id, sender_id, operator_id, target_id, extra } = options
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

export function bindOnebotTakeoverNotice({ on, bot, state, helpers } = {}) {
  const { toInt, logError } = helpers

  on("notice", payload => {
    try {
      if (!payload || typeof payload !== "object") return

      const group_id = toInt(payload.group_id)
      const target_id = toInt(
        payload.target_id ?? payload.targetId ?? payload.receiver_id ?? payload.receiverId ?? payload.user_id,
      )
      const nativeNoticeType = String(payload.notice_type || "").toLowerCase()
      const isRecallNotice = nativeNoticeType === "group_recall" || nativeNoticeType === "friend_recall"
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
      const user_id = isRecallNotice ? recalledUserId : sender_id ?? toInt(payload.user_id)
      const operator_id = toInt(payload.operator_id ?? payload.operatorId ?? sender_id)

      const e = {
        self_id: state.selfId,
        time: payload.time ?? Math.floor(Date.now() / 1000),
        post_type: "notice",
        notice_type: group_id ? "group" : "friend",
        sub_type: mapOnebotNoticeSubType(payload.notice_type, payload.sub_type),
        group_id,
        user_id,
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

      attachNoticeRefs(e, state, group_id, user_id)
      bot.emit("notice", e)
    } catch (err) {
      logError("[xunlu-core][takeover] onebot notice bridge failed:", err)
    }
  })
}

export function bindMilkyTakeoverNotice({ on, bot, state, helpers } = {}) {
  const { toInt, logError } = helpers

  on("message_recall", packet => {
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

      emitMilkyNotice(bot, state, helpers, eventData, {
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
    on(eventType, packet => {
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

        emitMilkyNotice(bot, state, helpers, eventData, {
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

  on("friend_nudge", packet => {
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

      emitMilkyNotice(bot, state, helpers, eventData, {
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

  on("friend_file_upload", packet => {
    try {
      const eventData = packet?.data
      if (!eventData || typeof eventData !== "object") return

      const user_id = toInt(eventData.sender_id ?? eventData.senderId ?? eventData.user_id ?? eventData.userId)
      emitMilkyNotice(bot, state, helpers, eventData, {
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

