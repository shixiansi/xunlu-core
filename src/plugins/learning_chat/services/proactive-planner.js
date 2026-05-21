function toNumber(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function toPositiveInt(value, fallback, min = 0) {
  return Math.max(min, Math.floor(toNumber(value, fallback)))
}

function normalizeTimestamp(value) {
  return Math.max(0, Number(value) || 0)
}

export function buildProactiveTimingPlan(proactiveConfig = {}) {
  const minIntervalMs = toPositiveInt(proactiveConfig.min_interval_sec, 600) * 1000
  const backoffBaseSec = proactiveConfig.backoff_base_sec ?? proactiveConfig.min_interval_sec ?? 600
  const backoffBaseMsRaw = toPositiveInt(backoffBaseSec, 600) * 1000
  const fallbackBackoffBaseMs = Math.max(60_000, minIntervalMs || 0)
  const maxBackoffExp = toPositiveInt(proactiveConfig.backoff_max_exp, 6)

  return {
    minMessagesToday: toPositiveInt(proactiveConfig.min_messages_today, 30),
    silenceFactor: toPositiveInt(proactiveConfig.silence_factor, 5, 1),
    minSilenceSec: toPositiveInt(proactiveConfig.min_silence_sec, 300),
    minIntervalMs,
    backoffBaseMs: backoffBaseMsRaw > 0 ? backoffBaseMsRaw : fallbackBackoffBaseMs,
    maxBackoffExp,
    maxAttempts: maxBackoffExp + 1,
  }
}

export function buildProactiveBatchPlan(proactiveConfig = {}) {
  const batchMin = toPositiveInt(proactiveConfig.batch_min, 1, 1)
  const batchMax = Math.max(batchMin, toPositiveInt(proactiveConfig.batch_max, 3, 1))
  return { batchMin, batchMax }
}

export function pickProactiveBatchSize(batchPlan, random = Math.random) {
  const batchMin = Math.max(1, Math.floor(Number(batchPlan?.batchMin) || 1))
  const batchMax = Math.max(batchMin, Math.floor(Number(batchPlan?.batchMax) || batchMin))
  return Math.floor(random() * (batchMax - batchMin + 1)) + batchMin
}

export function didUserReplySinceLastProactive({ lastProactiveAt, lastUserMsgAt } = {}) {
  const lastProactive = normalizeTimestamp(lastProactiveAt)
  const lastUserMsg = normalizeTimestamp(lastUserMsgAt)
  return Boolean(lastProactive && lastUserMsg && lastUserMsg > lastProactive)
}

export function buildProactiveCandidate({
  gid,
  groupCfg,
  heat,
  state,
  proactiveState,
  plan,
  now = Date.now(),
} = {}) {
  const groupId = String(gid || "")
  if (!groupId || !groupCfg?.proactive_enabled || !heat) {
    return { candidate: null, resetAttemptsNoReply: false }
  }

  const timingPlan = plan || buildProactiveTimingPlan()
  const messagesToday = Math.max(0, Math.floor(toNumber(heat.messagesToday, 0)))
  if (messagesToday < timingPlan.minMessagesToday) {
    return { candidate: null, resetAttemptsNoReply: false }
  }

  const lastProactiveAt = Math.max(
    normalizeTimestamp(state?.last_proactive_at),
    normalizeTimestamp(proactiveState?.last_sent_at),
  )
  const lastUserMsgAt = normalizeTimestamp(heat.lastUserMsgAt)
  const userRepliedSinceLast = didUserReplySinceLastProactive({
    lastProactiveAt,
    lastUserMsgAt,
  })

  let attempts = Math.max(0, Math.floor(Number(proactiveState?.attempts_no_reply) || 0))
  const resetAttemptsNoReply = Boolean(userRepliedSinceLast && attempts)
  if (resetAttemptsNoReply) attempts = 0

  let backoffDelayMs = 0
  if (attempts > 0) {
    const exp = Math.min(timingPlan.maxBackoffExp, Math.max(0, attempts - 1))
    backoffDelayMs = timingPlan.backoffBaseMs * Math.pow(2, exp)
  }

  const effectiveIntervalMs = Math.max(timingPlan.minIntervalMs, backoffDelayMs)
  if (lastProactiveAt && now - lastProactiveAt < effectiveIntervalMs) {
    return { candidate: null, resetAttemptsNoReply }
  }

  const avgIntervalSec = Math.max(1, toNumber(heat.avgIntervalSec, 120))
  const requiredSilenceSec = Math.max(timingPlan.minSilenceSec, avgIntervalSec * timingPlan.silenceFactor)
  const lastMsgAt = normalizeTimestamp(heat.lastMsgAt)
  if (!lastMsgAt) return { candidate: null, resetAttemptsNoReply }

  const silentMs = now - lastMsgAt
  if (silentMs < requiredSilenceSec * 1000) {
    return { candidate: null, resetAttemptsNoReply }
  }

  return {
    candidate: {
      gid: groupId,
      weight: messagesToday / Math.pow(2, Math.max(0, attempts - 1)),
    },
    resetAttemptsNoReply,
  }
}

export function buildProactiveSendStateUpdate({
  groupState,
  proactiveState,
  heat,
  plan,
} = {}) {
  const timingPlan = plan || buildProactiveTimingPlan()
  const lastSentAt = Math.max(
    normalizeTimestamp(groupState?.last_proactive_at),
    normalizeTimestamp(proactiveState?.last_sent_at),
  )
  const userRepliedSinceLast = didUserReplySinceLastProactive({
    lastProactiveAt: lastSentAt,
    lastUserMsgAt: heat?.lastUserMsgAt,
  })

  let attempts = Math.max(0, Math.floor(Number(proactiveState?.attempts_no_reply) || 0))
  if (userRepliedSinceLast) attempts = 0

  return {
    attemptsNoReply: Math.min(timingPlan.maxAttempts, Math.max(1, attempts + 1)),
    userRepliedSinceLast,
  }
}
