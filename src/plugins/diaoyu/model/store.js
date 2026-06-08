import fs from "node:fs"
import path from "node:path"

import env from "../../../lib/env.js"
import { getNewUserDefaults } from "./config.js"

function nowTs() {
  return Date.now()
}

function getDiaoyuDbPath() {
  return path.resolve(env.RootPath, "data", "diaoyu.json")
}

export function dateKey(d = new Date()) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function yesterdayKey(d = new Date()) {
  const t = new Date(d.getTime() - 24 * 60 * 60 * 1000)
  return dateKey(t)
}

function ensureDataDir(dbPath = getDiaoyuDbPath()) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
}

function defaultDb() {
  return {
    version: 1,
    users: {},
  }
}

export function loadDb() {
  const dbPath = getDiaoyuDbPath()
  ensureDataDir(dbPath)
  if (!fs.existsSync(dbPath)) return defaultDb()
  try {
    const raw = fs.readFileSync(dbPath, "utf8")
    const data = raw ? JSON.parse(raw) : null
    if (!data || typeof data !== "object") return defaultDb()
    if (!data.users || typeof data.users !== "object") data.users = {}
    if (!data.version) data.version = 1
    return data
  } catch {
    return defaultDb()
  }
}

export function saveDb(db) {
  const dbPath = getDiaoyuDbPath()
  ensureDataDir(dbPath)
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8")
}

export function normalizeUserId(uid) {
  if (uid === undefined || uid === null) return ""
  const s = String(uid).trim()
  return s
}

export function getOrCreateUser(db, uid) {
  const userId = normalizeUserId(uid)
  if (!userId) return null

  if (!db.users[userId]) {
    const defaults = getNewUserDefaults()
    db.users[userId] = {
      coins: defaults.coins,
      rodLevel: defaults.rodLevel,
      items: {
        bait: defaults.items.bait,
        bait_adv: defaults.items.bait_adv,
      },
      fish: {},
      sign: {
        lastDate: "",
        streak: 0,
      },
      createdAt: nowTs(),
      updatedAt: nowTs(),
    }
  }

  const user = db.users[userId]
  if (!user.items || typeof user.items !== "object") user.items = {}
  if (!user.fish || typeof user.fish !== "object") user.fish = {}
  if (!user.sign || typeof user.sign !== "object") user.sign = { lastDate: "", streak: 0 }

  if (typeof user.coins !== "number" || !Number.isFinite(user.coins)) user.coins = 0
  if (typeof user.rodLevel !== "number" || !Number.isFinite(user.rodLevel) || user.rodLevel < 1) {
    user.rodLevel = 1
  }

  // 最小新手物资
  if (user.items.bait === undefined) user.items.bait = 0
  if (user.items.bait_adv === undefined) user.items.bait_adv = 0

  return user
}

export function touchUser(user) {
  if (!user) return
  user.updatedAt = nowTs()
}
