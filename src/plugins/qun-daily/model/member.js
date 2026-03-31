function toSafeTimestamp(value) {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : 0
}

export function getMemberDisplayName(member, userId = "") {
  const card = String(
    member?.card ?? member?.member_card ?? member?.memberCard ?? member?.remark ?? "",
  ).trim()
  const nickname = String(member?.nickname ?? member?.name ?? "").trim()
  return card || nickname || String(userId || member?.user_id || member?.userId || "")
}

export function getMemberLastSentTime(member) {
  return toSafeTimestamp(
    member?.last_sent_time ?? member?.lastSentTime ?? member?.lastSpeakTime ?? member?.last_speak_time ?? 0,
  )
}

export function getMemberJoinTime(member) {
  return toSafeTimestamp(member?.join_time ?? member?.joinTime ?? 0)
}

export function normalizeMemberMap(memberMapLike) {
  if (memberMapLike instanceof Map) return memberMapLike
  if (Array.isArray(memberMapLike)) {
    return new Map(
      memberMapLike
        .filter(Boolean)
        .map(item => [String(item?.user_id ?? item?.userId ?? item?.uin ?? item?.id), item]),
    )
  }
  return new Map()
}

export function resolveDiveKing(memberMapLike) {
  const memberMap = normalizeMemberMap(memberMapLike)
  let best = null

  for (const [userId, member] of memberMap) {
    const lastSentTime = getMemberLastSentTime(member)
    if (!lastSentTime) continue
    const item = {
      userId: String(userId),
      displayName: getMemberDisplayName(member, userId),
      lastSentTime,
      joinTime: getMemberJoinTime(member),
    }

    if (!best) {
      best = item
      continue
    }

    if (item.lastSentTime < best.lastSentTime) {
      best = item
      continue
    }

    if (item.lastSentTime === best.lastSentTime) {
      if (item.joinTime && (!best.joinTime || item.joinTime < best.joinTime)) {
        best = item
        continue
      }
      if (String(item.userId) < String(best.userId)) {
        best = item
      }
    }
  }

  return best
}
