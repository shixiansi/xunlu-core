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

export function getDbPath() {
  return DB_PATH
}

function createDefaultDb() {
  return {
    version: 2,
    settings: {
      enabled: false,
    },
    groups: {},
  }
}

export function normalizeId(value) {
  if (value === undefined || value === null) return ""
  return String(value).trim()
}

export function loadDb() {
  ensureDataDir()
  if (!fs.existsSync(DB_PATH)) return createDefaultDb()

  try {
    const raw = fs.readFileSync(DB_PATH, "utf8")
    const data = raw ? JSON.parse(raw) : null
    if (!data || typeof data !== "object") return createDefaultDb()
    if (!data.groups || typeof data.groups !== "object") data.groups = {}
    if (!data.settings || typeof data.settings !== "object") data.settings = {}
    if (data.settings.enabled === undefined) data.settings.enabled = false
    else data.settings.enabled = Boolean(data.settings.enabled)
    if (!data.version) data.version = 2

    // prune expired muted records
    const now = nowTs()
    for (const gid of Object.keys(data.groups)) {
      const g = data.groups[gid]
      if (!g || typeof g !== "object") continue
      if (!g.users || typeof g.users !== "object") g.users = {}
      if (!g.muted || typeof g.muted !== "object") g.muted = {}
      if (!g.config || typeof g.config !== "object") g.config = {}
      if (g.enabled !== undefined && g.config.enabled === undefined) {
        g.config.enabled = Boolean(g.enabled)
        delete g.enabled
      }
      for (const uid of Object.keys(g.muted)) {
        const rec = g.muted[uid]
        const until = Number(rec?.until ?? 0)
        if (Number.isFinite(until) && until > 0 && until <= now) delete g.muted[uid]
      }
    }

    return data
  } catch {
    return createDefaultDb()
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
      config: {},
      users: {},
      muted: {},
      createdAt: nowTs(),
      updatedAt: nowTs(),
    }
  }
  const group = db.groups[gid]
  if (!group.config || typeof group.config !== "object") group.config = {}
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

export function getGlobalRepeatMuteEnabled(db) {
  return Boolean(db?.settings?.enabled !== false)
}

export function getGroupRepeatMuteOverride(group) {
  const enabled = group?.config?.enabled
  return typeof enabled === "boolean" ? enabled : null
}

export function getEffectiveRepeatMuteEnabled(db, groupId) {
  const globalEnabled = getGlobalRepeatMuteEnabled(db)
  const group = getOrCreateGroup(db, groupId)
  if (!group) return globalEnabled

  const override = getGroupRepeatMuteOverride(group)
  return typeof override === "boolean" ? override : globalEnabled
}

export function setGlobalRepeatMuteEnabled(db, enabled) {
  if (!db.settings || typeof db.settings !== "object") db.settings = {}
  db.settings.enabled = Boolean(enabled)
  db.version = Math.max(2, Number(db.version) || 0)
  return getGlobalRepeatMuteEnabled(db)
}

export function setGroupRepeatMuteEnabled(group, enabled) {
  if (!group || typeof group !== "object") return null
  if (!group.config || typeof group.config !== "object") group.config = {}

  if (enabled === undefined || enabled === null) {
    delete group.config.enabled
    return null
  }

  group.config.enabled = Boolean(enabled)
  return group.config.enabled
}

export const __test = {
  createDefaultDb,
}
