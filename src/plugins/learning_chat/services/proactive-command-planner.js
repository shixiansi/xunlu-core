function toNumber(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function toInt(value, fallback, min = 0) {
  return Math.max(min, Math.floor(toNumber(value, fallback)))
}

export function localDayKey(ts = Date.now()) {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function normalizeCommandWhitelist(value) {
  return Array.isArray(value) ? value.map(item => String(item || "")).filter(Boolean) : []
}

export function buildProactiveCommandPlan(proactiveConfig = {}, now = Date.now()) {
  return {
    whitelist: normalizeCommandWhitelist(proactiveConfig.command_whitelist),
    hourBucket: new Date(now).getHours(),
    today: localDayKey(now),
    minMessagesToday: Number(proactiveConfig.min_messages_today || 0),
    historyDays: proactiveConfig.command_history_days,
    minCount: proactiveConfig.command_min_count,
    cooldownMs: toInt(proactiveConfig.command_cooldown_sec, 0) * 1000,
    recentManualMs: toInt(proactiveConfig.command_recent_manual_sec, 0) * 1000,
    maxDaily: toInt(proactiveConfig.command_max_daily_per_user, 1, 1),
    maxUserMessageAgeMs: toInt(proactiveConfig.command_recent_user_hours, 72, 1) * 3600 * 1000,
  }
}

export function pickUserFavoriteCommand(rows = []) {
  const bestByUser = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    const uid = String(row?.user_id || "")
    if (!uid) continue

    const current = bestByUser.get(uid)
    if (!current) {
      bestByUser.set(uid, row)
      continue
    }

    const count = Number(row?.count || 0)
    const currentCount = Number(current?.count || 0)
    if (count > currentCount) {
      bestByUser.set(uid, row)
      continue
    }

    if (
      count === currentCount &&
      Number(row?.last_triggered_at || 0) > Number(current?.last_triggered_at || 0)
    ) {
      bestByUser.set(uid, row)
    }
  }

  return Array.from(bestByUser.values()).sort((a, b) => {
    if (Number(b?.count || 0) !== Number(a?.count || 0)) {
      return Number(b?.count || 0) - Number(a?.count || 0)
    }
    return Number(b?.last_triggered_at || 0) - Number(a?.last_triggered_at || 0)
  })
}

export function normalizeFavoriteCommand(favorite = {}) {
  return {
    uid: String(favorite?.user_id || ""),
    reg: String(favorite?.reg || ""),
    pluginName: String(favorite?.plugin || "").trim(),
    rawCommand: String(favorite?.raw_command || "").trim(),
    protocol: favorite?.protocol,
  }
}

export function evaluateProactiveCommandState({ state, plan, now = Date.now() } = {}) {
  const commandPlan = plan || buildProactiveCommandPlan()
  const dailyCount =
    String(state?.last_triggered_date_key || "") === commandPlan.today
      ? Number(state?.daily_trigger_count || 0)
      : 0

  if (dailyCount >= commandPlan.maxDaily) {
    return { allowed: false, dailyCount, reason: "daily-limit" }
  }

  const lastTriggeredAt = Number(state?.last_triggered_at || 0)
  if (lastTriggeredAt && now - lastTriggeredAt < commandPlan.cooldownMs) {
    return { allowed: false, dailyCount, reason: "cooldown" }
  }

  return { allowed: true, dailyCount, reason: "" }
}

export function isRecentUserMessageRecord(record, plan, now = Date.now()) {
  if (!record) return false
  const commandPlan = plan || buildProactiveCommandPlan()
  return Number(record?.time || 0) * 1000 >= now - commandPlan.maxUserMessageAgeMs
}

export function buildProactiveCommandStatePatch({ reg, dailyCount = 0, plan, now = Date.now() } = {}) {
  const commandPlan = plan || buildProactiveCommandPlan()
  return {
    last_triggered_at: now,
    last_triggered_reg: String(reg || ""),
    last_triggered_date_key: commandPlan.today,
    daily_trigger_count: Number(dailyCount || 0) + 1,
    updated_at: now,
  }
}
