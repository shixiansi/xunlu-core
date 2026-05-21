const DEFAULT_PARSE_DEDUPE_TTL_MS = 15_000
const activeParseKeys = new Map()

function normalizeUrlForDedupe(url = "") {
  const text = String(url || "")
    .trim()
    .replace(/[)\]}>。！？!?，,;；]+$/u, "")
  if (!text) return ""

  try {
    const parsed = new URL(text)
    parsed.hash = ""
    parsed.hostname = parsed.hostname.toLowerCase()
    return parsed.toString().replace(/\/$/u, "")
  } catch {
    return text.replace(/\/$/u, "")
  }
}

function getParsePeerKey(ctx = {}) {
  const scene = ctx?.group_id ? "group" : "private"
  const peerId = ctx?.group_id ?? ctx?.peer_id ?? ctx?.target_id ?? ctx?.user_id ?? ""
  const userId = ctx?.user_id ?? ctx?.sender_id ?? ""
  return `${scene}:${peerId}:${userId}`
}

function pruneExpiredParseKeys(now) {
  for (const [key, expiresAt] of activeParseKeys.entries()) {
    if (expiresAt <= now) activeParseKeys.delete(key)
  }
}

export function isDuplicateParseRequest(ctx, url, options = {}) {
  const parser = String(options.parser || "parser").trim() || "parser"
  const normalizedUrl = normalizeUrlForDedupe(url)
  if (!normalizedUrl) return false

  const now = Date.now()
  pruneExpiredParseKeys(now)

  const ttlMs = Math.max(1, Number(options.ttlMs) || DEFAULT_PARSE_DEDUPE_TTL_MS)
  const key = `${parser}:${getParsePeerKey(ctx)}:${normalizedUrl}`
  if (activeParseKeys.has(key)) return true

  activeParseKeys.set(key, now + ttlMs)
  return false
}

export function __resetParseDedupeForTests() {
  activeParseKeys.clear()
}
