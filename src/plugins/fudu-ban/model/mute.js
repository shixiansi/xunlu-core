function toInt(value) {
  if (value === undefined || value === null) return undefined
  const v = typeof value === "string" ? value.trim() : value
  if (v === "") return undefined
  const num = Number(v)
  return Number.isFinite(num) ? num : undefined
}

function safeId(value) {
  return toInt(value) ?? value
}

function getGlobalBot() {
  try {
    // eslint-disable-next-line no-undef
    return Bot || globalThis.Bot || null
  } catch {
    return globalThis.Bot || null
  }
}

export async function setGroupMemberMute(ctx, { groupId, userId, durationSeconds }) {
  const gid = safeId(groupId)
  const uid = safeId(userId)
  const duration = Math.max(0, Math.floor(Number(durationSeconds) || 0))

  const payload = { group_id: gid, user_id: uid, duration }

  // 1) adapter-bound ctx method (if exists in future)
  if (ctx && typeof ctx.setGroupMemberMute === "function") {
    return await ctx.setGroupMemberMute(payload)
  }

  // 2) global Bot for milky/onebot adapters
  const bot = getGlobalBot()
  if (bot && typeof bot.setGroupMemberMute === "function") {
    return await bot.setGroupMemberMute(payload)
  }

  // 3) icqq/yunzai style: Bot.pickGroup(groupId).muteMember(userId, duration)
  if (bot && typeof bot.pickGroup === "function") {
    const group = bot.pickGroup(gid)
    if (group && typeof group.muteMember === "function") {
      return await group.muteMember(uid, duration)
    }
    if (group && typeof group.mute === "function") {
      return await group.mute(uid, duration)
    }
    if (group && typeof group.setMute === "function") {
      return await group.setMute(uid, duration)
    }
  }

  return { ok: false, error: "setGroupMemberMute API not found" }
}

