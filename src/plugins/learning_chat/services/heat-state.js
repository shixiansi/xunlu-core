import MessageDB from "../../../db/MessageDB.js"
import { BaseModel } from "../../../db/base/BaseModel.js"
import { Op } from "sequelize"
import { getCompatRuntimeBot } from "../../../runtime/platform-services.js"

const heatByGroup = new Map()
let groupIdDiscoveryCache = { ts: 0, ids: [] }

function localDayKey(ts = Date.now()) {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function toNumber(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function getBotSelfId() {
  const runtimeBot = getCompatRuntimeBot()
  const id = Number(runtimeBot?.uin ?? runtimeBot?.user_id ?? runtimeBot?.self_id ?? 0)
  return Number.isFinite(id) && id > 0 ? id : 0
}

function getTodayRangeSec(ts = Date.now()) {
  const start = new Date(ts)
  start.setHours(0, 0, 0, 0)
  const end = new Date(ts)
  end.setHours(23, 59, 59, 999)
  return { startSec: Math.floor(start.getTime() / 1000), endSec: Math.floor(end.getTime() / 1000) }
}

export async function listGroupIdsFromMessageDbTables({ ttlMs = 10 * 60 * 1000 } = {}) {
  const now = Date.now()
  if (groupIdDiscoveryCache.ids.length && now - groupIdDiscoveryCache.ts < ttlMs) {
    return groupIdDiscoveryCache.ids
  }

  try {
    const sequelize = await BaseModel.getSequelize()
    const [rows] = await sequelize.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'group_%'",
    )

    const ids = (Array.isArray(rows) ? rows : [])
      .map(row => String(row?.name || ""))
      .filter(name => name.startsWith("group_"))
      .map(name => name.slice("group_".length))
      .filter(Boolean)

    groupIdDiscoveryCache = { ts: now, ids }
    return ids
  } catch {
    return groupIdDiscoveryCache.ids || []
  }
}

export async function doesGroupTableExist(groupId) {
  const gid = String(groupId || "")
  if (!gid) return false

  try {
    const sequelize = await BaseModel.getSequelize()
    const [rows] = await sequelize.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name = :name LIMIT 1",
      { replacements: { name: `group_${gid}` } },
    )
    return Array.isArray(rows) && rows.length > 0
  } catch {
    return false
  }
}

async function fetchLatestMessageMeta(groupId) {
  const gid = String(groupId || "")
  if (!gid) return null
  if (!(await doesGroupTableExist(gid))) return null

  try {
    const table = await MessageDB.getGroupTable(gid)
    const lastAny = await table.findOne({
      attributes: ["user_id", "time"],
      order: [["time", "DESC"]],
    })

    const botId = getBotSelfId()
    const lastMsgAt = lastAny?.time ? Number(lastAny.time) * 1000 : 0
    const lastMsgFromBot =
      botId && lastAny?.user_id !== undefined && lastAny?.user_id !== null
        ? String(lastAny.user_id) === String(botId)
        : false

    const lastUser = botId
      ? await table.findOne({
          attributes: ["time"],
          where: { user_id: { [Op.ne]: botId } },
          order: [["time", "DESC"]],
        })
      : null

    const lastUserMsgAt = lastUser?.time ? Number(lastUser.time) * 1000 : 0
    return { lastMsgAt, lastMsgFromBot, lastUserMsgAt }
  } catch {
    return null
  }
}

async function fetchTodayHeatStats(groupId) {
  const gid = String(groupId || "")
  if (!gid) return null
  if (!(await doesGroupTableExist(gid))) return null

  try {
    const botId = getBotSelfId()
    const { startSec, endSec } = getTodayRangeSec()
    const whereTime = { time: { [Op.gte]: startSec, [Op.lte]: endSec } }
    const whereUser = botId ? { ...whereTime, user_id: { [Op.ne]: botId } } : whereTime

    const table = await MessageDB.getGroupTable(gid)
    const messagesToday = await table.count({ where: whereUser })
    const sample = await table.findAll({
      attributes: ["time"],
      where: whereUser,
      order: [["time", "DESC"]],
      limit: 50,
    })

    const times = (Array.isArray(sample) ? sample : [])
      .map(row => Number(row?.time))
      .filter(value => Number.isFinite(value) && value > 0)

    let avgIntervalSec = 120
    if (times.length >= 2) {
      let sum = 0
      let count = 0
      for (let index = 0; index < times.length - 1; index += 1) {
        const diff = times[index] - times[index + 1]
        if (!Number.isFinite(diff) || diff <= 0) continue
        sum += diff
        count += 1
      }
      if (count > 0) avgIntervalSec = Math.max(1, sum / count)
    }

    return { messagesToday: Number(messagesToday) || 0, avgIntervalSec }
  } catch {
    return null
  }
}

export async function ensureHeatForGroup(groupId, { forceBootstrap = false } = {}) {
  const gid = String(groupId || "")
  if (!gid) return null

  const now = Date.now()
  const day = localDayKey(now)
  const existing = heatByGroup.get(gid) || null
  const shouldBootstrap =
    forceBootstrap ||
    !existing ||
    existing.day !== day ||
    !existing.bootstrappedAt ||
    now - Number(existing.bootstrappedAt || 0) > 5 * 60 * 1000

  const next = existing
    ? { ...existing }
    : {
        day,
        messagesToday: 0,
        lastUserMsgAt: 0,
        avgIntervalSec: 120,
        lastMsgAt: 0,
        lastMsgFromBot: false,
      }
  next.day = day

  if (shouldBootstrap) {
    const latest = await fetchLatestMessageMeta(gid)
    const today = await fetchTodayHeatStats(gid)

    if (latest) {
      const dbLastMsgAt = Number(latest.lastMsgAt) || 0
      const currentLastMsgAt = Number(next.lastMsgAt) || 0
      if (dbLastMsgAt && (!currentLastMsgAt || dbLastMsgAt > currentLastMsgAt)) {
        next.lastMsgAt = dbLastMsgAt
        next.lastMsgFromBot = Boolean(latest.lastMsgFromBot)
      }

      const dbLastUserMsgAt = Number(latest.lastUserMsgAt) || 0
      if (dbLastUserMsgAt && dbLastUserMsgAt > Number(next.lastUserMsgAt || 0)) {
        next.lastUserMsgAt = dbLastUserMsgAt
      }
    }

    if (today) {
      next.messagesToday = Math.max(
        0,
        Math.floor(toNumber(today.messagesToday, next.messagesToday)),
      )
      next.avgIntervalSec = Math.max(1, toNumber(today.avgIntervalSec, next.avgIntervalSec))
    }

    next.bootstrappedAt = now
  } else {
    const refreshNeeded = !next.refreshedAt || now - Number(next.refreshedAt || 0) > 30 * 1000
    if (refreshNeeded) {
      const latest = await fetchLatestMessageMeta(gid)
      if (latest) {
        const dbLastMsgAt = Number(latest.lastMsgAt) || 0
        const currentLastMsgAt = Number(next.lastMsgAt) || 0
        if (dbLastMsgAt && (!currentLastMsgAt || dbLastMsgAt > currentLastMsgAt)) {
          next.lastMsgAt = dbLastMsgAt
          next.lastMsgFromBot = Boolean(latest.lastMsgFromBot)
        }

        const dbLastUserMsgAt = Number(latest.lastUserMsgAt) || 0
        if (dbLastUserMsgAt && dbLastUserMsgAt > Number(next.lastUserMsgAt || 0)) {
          next.lastUserMsgAt = dbLastUserMsgAt
        }
      }
      next.refreshedAt = now
    }
  }

  heatByGroup.set(gid, next)
  return next
}

export function getHeatState(groupId) {
  return heatByGroup.get(String(groupId || "")) || null
}

export function listTrackedHeatGroupIds() {
  return Array.from(heatByGroup.keys())
}

export function forgetHeatForGroup(groupId) {
  const gid = String(groupId || "").trim()
  if (!gid) return false
  return heatByGroup.delete(gid)
}

export function markBotSpoke(groupId) {
  const gid = String(groupId || "")
  if (!gid) return

  const now = Date.now()
  const day = localDayKey(now)
  const next = heatByGroup.get(gid) || {
    day,
    messagesToday: 0,
    lastUserMsgAt: 0,
    avgIntervalSec: 120,
    lastMsgAt: 0,
    lastMsgFromBot: false,
    bootstrappedAt: 0,
    refreshedAt: 0,
  }

  if (next.day !== day) {
    next.day = day
    next.messagesToday = 0
    next.lastUserMsgAt = 0
    next.avgIntervalSec = 120
    next.bootstrappedAt = 0
    next.refreshedAt = 0
  }

  next.lastMsgAt = now
  next.lastMsgFromBot = true
  next.refreshedAt = now
  heatByGroup.set(gid, next)
}

export function updateHeatFromUserMessage(groupId) {
  const gid = String(groupId || "")
  if (!gid) return

  const now = Date.now()
  const day = localDayKey(now)
  const next = heatByGroup.get(gid) || {
    day,
    messagesToday: 0,
    lastUserMsgAt: 0,
    avgIntervalSec: 120,
    lastMsgAt: 0,
    lastMsgFromBot: false,
    bootstrappedAt: 0,
    refreshedAt: 0,
  }

  if (next.day !== day) {
    next.day = day
    next.messagesToday = 0
    next.lastUserMsgAt = 0
    next.avgIntervalSec = 120
    next.bootstrappedAt = 0
    next.refreshedAt = 0
  }

  if (next.lastUserMsgAt) {
    const intervalSec = Math.max(0, (now - next.lastUserMsgAt) / 1000)
    const previous = toNumber(next.avgIntervalSec, intervalSec)
    next.avgIntervalSec = previous ? previous * 0.8 + intervalSec * 0.2 : intervalSec
  }

  next.lastUserMsgAt = now
  next.lastMsgAt = now
  next.lastMsgFromBot = false
  next.messagesToday = Math.max(0, Math.floor(toNumber(next.messagesToday, 0))) + 1
  next.refreshedAt = now
  heatByGroup.set(gid, next)
}

export function getHeatSnapshot() {
  const out = []
  for (const [groupId, heat] of heatByGroup.entries()) {
    out.push({ group_id: String(groupId), ...(heat || {}) })
  }
  return out
}

export function resetHeatStateForTests() {
  heatByGroup.clear()
  groupIdDiscoveryCache = { ts: 0, ids: [] }
}
