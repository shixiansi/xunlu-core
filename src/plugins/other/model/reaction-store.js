import fs from "node:fs"
import path from "node:path"

import env from "../../../lib/env.js"

const DATA_DIR = path.resolve(env.RootPath, "data")
const STORE_PATH = path.join(DATA_DIR, "other-reaction.json")

function defaultStore() {
  return {
    version: 1,
    updatedAt: Date.now(),
    users: {},
  }
}

function normalizeUserId(uid) {
  if (uid === undefined || uid === null) return ""
  const s = String(uid).trim()
  return s
}

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

let cache = null

export function loadReactionStore() {
  if (cache) return cache
  ensureDir()

  if (!fs.existsSync(STORE_PATH)) {
    cache = defaultStore()
    return cache
  }

  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8")
    const data = raw ? JSON.parse(raw) : null
    if (!data || typeof data !== "object") {
      cache = defaultStore()
      return cache
    }
    if (!data.users || typeof data.users !== "object") data.users = {}
    if (!data.version) data.version = 1
    if (!data.updatedAt) data.updatedAt = Date.now()
    cache = data
    return cache
  } catch {
    cache = defaultStore()
    return cache
  }
}

function saveReactionStore(store) {
  ensureDir()
  const payload = JSON.stringify(store, null, 2)
  const tmpPath = `${STORE_PATH}.tmp`
  fs.writeFileSync(tmpPath, payload, "utf8")
  fs.renameSync(tmpPath, STORE_PATH)
}

export function getUserReactionConfig(uid) {
  const store = loadReactionStore()
  const userId = normalizeUserId(uid)
  if (!userId) return null
  const cfg = store.users?.[userId]
  if (!cfg || typeof cfg !== "object") return null

  // 向后兼容：旧字段 reaction -> reactions
  if (!Array.isArray(cfg.reactions)) {
    const r = cfg.reaction
    const n = Number(r)
    cfg.reactions = Number.isFinite(n) ? [Math.floor(n)] : []
  }
  // 兼容字段：保证 reaction 永远等于第一项
  if (cfg.reactions.length && cfg.reaction !== cfg.reactions[0]) {
    cfg.reaction = cfg.reactions[0]
  }

  return cfg
}

function normalizeReactions(input) {
  const raw = Array.isArray(input) ? input : input !== undefined && input !== null ? [input] : []
  const seen = new Set()
  const out = []
  for (const v of raw) {
    const n = Number(v)
    if (!Number.isFinite(n)) continue
    const id = Math.floor(n)
    if (id <= 0) continue
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export function setUserReactionConfig(uid, { enabled, reactions, reaction } = {}) {
  const store = loadReactionStore()
  const userId = normalizeUserId(uid)
  if (!userId) return null

  const prev = getUserReactionConfig(userId) || store.users?.[userId] || null

  const prevReactions = Array.isArray(prev?.reactions) ? prev.reactions : normalizeReactions(prev?.reaction)

  const nextEnabled = enabled !== undefined ? Boolean(enabled) : Boolean(prev?.enabled)

  let nextReactions = []
  if (reactions !== undefined) {
    nextReactions = normalizeReactions(reactions)
  } else if (reaction !== undefined) {
    nextReactions = normalizeReactions(reaction)
  } else {
    nextReactions = prevReactions
  }

  if (!nextReactions.length) nextReactions = [277]

  const next = {
    enabled: nextEnabled,
    reactions: nextReactions,
    // 向后兼容：保留 reaction（旧版本读取不会挂）
    reaction: nextReactions[0],
  }

  store.users[userId] = next
  store.updatedAt = Date.now()
  saveReactionStore(store)
  return next
}

export function disableUserReaction(uid) {
  return setUserReactionConfig(uid, { enabled: false })
}
