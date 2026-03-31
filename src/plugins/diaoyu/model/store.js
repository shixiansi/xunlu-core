import fs from "node:fs"
import path from "node:path"

import env from "../../../lib/env.js"

const DATA_DIR = path.resolve(env.RootPath, "data")
const DB_PATH = path.join(DATA_DIR, "diaoyu.json")

function nowTs() {
  return Date.now()
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

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

function defaultDb() {
  return {
    version: 1,
    users: {},
  }
}

export function loadDb() {
  ensureDataDir()
  if (!fs.existsSync(DB_PATH)) return defaultDb()
  try {
    const raw = fs.readFileSync(DB_PATH, "utf8")
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
  ensureDataDir()
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8")
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
    db.users[userId] = {
      coins: 200,
      rodLevel: 1,
      items: {
        bait: 5,
        bait_adv: 0,
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

