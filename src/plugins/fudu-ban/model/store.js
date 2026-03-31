import fs from "node:fs"
import path from "node:path"

import env from "../../../lib/env.js"

const DATA_DIR = path.resolve(env.RootPath, "data")
const DB_PATH = path.join(DATA_DIR, "fudu-ban.json")

function nowTs() {
  return Date.now()
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

function defaultDb() {
  return {
    version: 1,
    groups: {},
  }
}

export function normalizeId(value) {
  if (value === undefined || value === null) return ""
  return String(value).trim()
}

export function loadDb() {
  ensureDataDir()
  if (!fs.existsSync(DB_PATH)) return defaultDb()

  try {
    const raw = fs.readFileSync(DB_PATH, "utf8")
    const data = raw ? JSON.parse(raw) : null
    if (!data || typeof data !== "object") return defaultDb()
    if (!data.groups || typeof data.groups !== "object") data.groups = {}
    if (!data.version) data.version = 1

    // prune expired muted records
    const now = nowTs()
    for (const gid of Object.keys(data.groups)) {
      const g = data.groups[gid]
      if (!g || typeof g !== "object") continue
      if (!g.users || typeof g.users !== "object") g.users = {}
      if (!g.muted || typeof g.muted !== "object") g.muted = {}
      for (const uid of Object.keys(g.muted)) {
        const rec = g.muted[uid]
        const until = Number(rec?.until ?? 0)
        if (Number.isFinite(until) && until > 0 && until <= now) delete g.muted[uid]
      }
    }

    return data
  } catch {
    return defaultDb()
  }
}

export function saveDb(db) {
  ensureDataDir()
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8")
}

export function getOrCreateGroup(db, groupId) {
  const gid = normalizeId(groupId)
  if (!gid) return null
  if (!db.groups[gid]) {
    db.groups[gid] = {
      users: {},
      muted: {},
      createdAt: nowTs(),
      updatedAt: nowTs(),
    }
  }
  const group = db.groups[gid]
  if (!group.users || typeof group.users !== "object") group.users = {}
  if (!group.muted || typeof group.muted !== "object") group.muted = {}
  group.updatedAt = nowTs()
  return group
}

export function getOrCreateUser(group, userId) {
  const uid = normalizeId(userId)
  if (!uid) return null

  if (!group.users[uid]) {
    group.users[uid] = {
      strikes: 0,
      // per-day strikes (local day key: YYYY-MM-DD)
      strikeDay: "",
      strikesToday: 0,
      lastStrikeAt: 0,
      botRepeatDay: "",
      botRepeatToday: 0,
      lastBotRepeatAt: 0,
      createdAt: nowTs(),
      updatedAt: nowTs(),
    }
  }

  const user = group.users[uid]
  if (!Number.isFinite(Number(user.strikes))) user.strikes = 0
  if (typeof user.strikeDay !== "string") user.strikeDay = ""
  if (!Number.isFinite(Number(user.strikesToday))) user.strikesToday = 0
  if (!Number.isFinite(Number(user.lastStrikeAt))) user.lastStrikeAt = 0
  if (typeof user.botRepeatDay !== "string") user.botRepeatDay = ""
  if (!Number.isFinite(Number(user.botRepeatToday))) user.botRepeatToday = 0
  if (!Number.isFinite(Number(user.lastBotRepeatAt))) user.lastBotRepeatAt = 0
  user.updatedAt = nowTs()
  return user
}
