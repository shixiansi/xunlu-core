import fs from "node:fs"
import path from "node:path"

import { getRuntimePaths } from "../../../runtime/runtime-context.js"

const DATA_ROOT = getRuntimePaths().getPluginDataDir("qun-daily", "stats")

function pad(num) {
  return String(num).padStart(2, "0")
}

function toDate(input = new Date()) {
  if (input instanceof Date) return new Date(input.getTime())
  if (typeof input === "string" || typeof input === "number") return new Date(input)
  return new Date()
}

export function toDateKey(input = new Date()) {
  const date = toDate(input)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function shiftDateKey(dateKey, offsetDays = 0) {
  const date = new Date(`${dateKey}T00:00:00`)
  date.setDate(date.getDate() + Number(offsetDays || 0))
  return toDateKey(date)
}

export function getDateKeysForRange(endDateKey, days = 1) {
  const safeDays = Math.max(1, Math.floor(Number(days || 1)))
  const keys = []
  for (let i = safeDays - 1; i >= 0; i--) {
    keys.push(shiftDateKey(endDateKey, -i))
  }
  return keys
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function getStatsFilePath(groupId, dateKey) {
  const gid = String(groupId || "").trim()
  return path.join(DATA_ROOT, gid, `${dateKey}.json`)
}

export function readDailyStats(groupId, dateKey) {
  try {
    const file = getStatsFilePath(groupId, dateKey)
    if (!fs.existsSync(file)) return null
    return JSON.parse(fs.readFileSync(file, "utf8"))
  } catch (err) {
    console.warn("[qun-daily] readDailyStats failed:", err?.message || err)
    return null
  }
}

export function writeDailyStats(groupId, dateKey, data) {
  const file = getStatsFilePath(groupId, dateKey)
  ensureDir(path.dirname(file))
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8")
  return file
}

export function getPreviousDateKey(base = new Date()) {
  return shiftDateKey(toDateKey(base), -1)
}
