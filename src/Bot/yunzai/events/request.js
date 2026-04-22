function emitTakeoverRequest(bot, state, helpers, eventData, options = {}) {
  const { toInt } = helpers
  const { request_type, sub_type, group_id, user_id, flag, comment, extra } = options
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

export function bindOnebotTakeoverRequest({ on, bot, state, helpers } = {}) {
  const { toInt, logError } = helpers

  on("request", payload => {
    try {
      if (!payload || typeof payload !== "object") return

      emitTakeoverRequest(bot, state, helpers, payload, {
        request_type: payload.request_type || (payload.group_id ? "group" : "friend"),
        sub_type: payload.sub_type || "",
        group_id: toInt(payload.group_id),
        user_id: toInt(payload.user_id),
        flag: payload.flag,
        comment: payload.comment,
      })
    } catch (err) {
      logError("[xunlu-core][takeover] onebot request bridge failed:", err)
    }
  })
}

export function bindMilkyTakeoverRequest({ on, bot, state, helpers } = {}) {
  const { toInt, logError } = helpers

  on("friend_request", packet => {
    try {
      const eventData = packet?.data
      if (!eventData || typeof eventData !== "object") return

      const user_id = toInt(eventData.initiator_id ?? eventData.initiatorId ?? eventData.user_id ?? eventData.userId)
      if (state.ignoreSelf && String(user_id ?? "") === String(state.selfId ?? "")) return

      emitTakeoverRequest(bot, state, helpers, eventData, {
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

  on("group_join_request", packet => {
    try {
      const eventData = packet?.data
      if (!eventData || typeof eventData !== "object") return

      const group_id = toInt(eventData.peer_id ?? eventData.group_id ?? eventData.groupId)
      const user_id = toInt(eventData.initiator_id ?? eventData.initiatorId ?? eventData.user_id ?? eventData.userId)
      if (state.ignoreSelf && String(user_id ?? "") === String(state.selfId ?? "")) return

      emitTakeoverRequest(bot, state, helpers, eventData, {
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

  on("group_invited_join_request", packet => {
    try {
      const eventData = packet?.data
      if (!eventData || typeof eventData !== "object") return

      const group_id = toInt(eventData.peer_id ?? eventData.group_id ?? eventData.groupId)
      const user_id = toInt(eventData.initiator_id ?? eventData.initiatorId ?? eventData.user_id ?? eventData.userId)
      if (state.ignoreSelf && String(user_id ?? "") === String(state.selfId ?? "")) return

      emitTakeoverRequest(bot, state, helpers, eventData, {
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
}

