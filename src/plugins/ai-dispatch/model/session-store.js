const sessions = new Map()

function now() {
  return Date.now()
}

function totalChars(history = []) {
  return history.reduce((sum, item) => sum + String(item?.content || "").length, 0)
}

function pruneSession(session, config) {
  const maxItems = Math.max(2, Number(config?.siliconflow?.max_history || 8) * 2)
  const maxChars = Math.max(1200, Number(config?.max_prompt_chars || 6000))

  while (session.history.length > maxItems) {
    session.history.shift()
  }

  while (session.history.length > 1 && totalChars(session.history) > maxChars) {
    session.history.shift()
  }
}

export function getSessionKey(ctx) {
  if (!ctx || !ctx.user_id) return ""
  if (ctx.group_id) return `group:${ctx.group_id}:user:${ctx.user_id}`
  return `private:${ctx.user_id}`
}

export function peekSession(ctx, config) {
  const key = getSessionKey(ctx)
  if (!key) return null
  const ttlMs = Math.max(60, Number(config?.session_ttl_sec || 1800)) * 1000
  const current = now()

  for (const [sessionKey, session] of sessions) {
    if (!session || current - Number(session.updatedAt || 0) <= ttlMs) continue
    sessions.delete(sessionKey)
  }

  const session = sessions.get(key)
  if (!session) return null
  if (current - Number(session.updatedAt || 0) > ttlMs) {
    sessions.delete(key)
    return null
  }
  return session
}

export function ensureSession(ctx, config) {
  const key = getSessionKey(ctx)
  if (!key) return null
  const existing = peekSession(ctx, config)
  if (existing) return existing

  const session = {
    key,
    history: [],
    pendingClarify: false,
    lastResult: null,
    updatedAt: now(),
  }
  sessions.set(key, session)
  return session
}

export function appendSessionTurn(session, role, content, config) {
  if (!session) return
  const text = String(content || "").trim()
  if (!text) return
  session.history.push({ role: String(role || "assistant"), content: text })
  session.updatedAt = now()
  pruneSession(session, config)
}

export function updateSessionState(session, patch = {}) {
  if (!session) return
  Object.assign(session, patch, { updatedAt: now() })
}

export function resetSessions() {
  sessions.clear()
}
