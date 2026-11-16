import fs from "node:fs"
import path from "node:path"

import env from "../../../lib/env.js"

/**
 * 群级开关存储：默认全部关闭，只有显式开启的群才会收到每日推送。
 * 存储位置：<RootPath>/data/yangmao/groups.json
 */
const DEFAULT_GROUP_STATE = Object.freeze({
  enabled: false,
  lastSentAt: 0,
  lastDateKey: "",
})

export function getYangmaoStorePath() {
  return path.resolve(env.RootPath, "data", "yangmao", "groups.json")
}

function defaultStore() {
  return { version: 1, updatedAt: Date.now(), groups: {} }
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null
}

function normalizeGroupId(groupId) {
  if (groupId === undefined || groupId === null) return ""
  return String(groupId).trim()
}

function ensureDir(storePath = getYangmaoStorePath()) {
  fs.mkdirSync(path.dirname(storePath), { recursive: true })
}

function readStoreFromDisk(storePath = getYangmaoStorePath()) {
  ensureDir(storePath)
  if (!fs.existsSync(storePath)) return defaultStore()

  try {
    const raw = fs.readFileSync(storePath, "utf8")
    const data = raw ? JSON.parse(raw) : null
    if (!safeObject(data)) return defaultStore()

    const store = defaultStore()
    store.version = Number(data.version || store.version) || store.version
    store.updatedAt = Number(data.updatedAt || store.updatedAt) || store.updatedAt
    if (safeObject(data.groups)) store.groups = data.groups
    return store
  } catch {
    return defaultStore()
  }
}

function saveStoreToDisk(store) {
  const storePath = getYangmaoStorePath()
  ensureDir(storePath)
  const tmpPath = `${storePath}.tmp`
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), "utf8")
  fs.renameSync(tmpPath, storePath)
}

let cache = null
let cachePath = ""

function loadStore() {
  const storePath = getYangmaoStorePath()
  if (cache && cachePath === storePath) return cache
  cache = readStoreFromDisk(storePath)
  cachePath = storePath
  return cache
}

export function resetGroupStateCache() {
  cache = null
  cachePath = ""
}

function pickGroupState(raw) {
  const item = safeObject(raw) || {}
  return {
    enabled: item.enabled === true,
    lastSentAt: Number(item.lastSentAt || 0) || 0,
    lastDateKey: String(item.lastDateKey || ""),
  }
}

export function getGroupState(groupId) {
  const id = normalizeGroupId(groupId)
  if (!id) return { ...DEFAULT_GROUP_STATE }
  const store = loadStore()
  return pickGroupState(safeObject(store.groups)?.[id])
}

export function setGroupEnabled(groupId, enabled, meta = {}) {
  const id = normalizeGroupId(groupId)
  if (!id) return null

  const store = loadStore()
  if (!safeObject(store.groups)) store.groups = {}
  const prev = pickGroupState(safeObject(store.groups[id]))
  const next = {
    ...prev,
    enabled: Boolean(enabled),
    updatedAt: Date.now(),
    updatedBy: meta.by === undefined || meta.by === null ? "" : String(meta.by),
  }

  store.groups[id] = next
  store.updatedAt = Date.now()
  saveStoreToDisk(store)
  return pickGroupState(next)
}

export function markGroupSent(groupId, dateKey = "", at = Date.now()) {
  const id = normalizeGroupId(groupId)
  if (!id) return null

  const store = loadStore()
  if (!safeObject(store.groups)) store.groups = {}
  const prev = pickGroupState(safeObject(store.groups[id]))
  const next = {
    ...prev,
    lastSentAt: Number(at) || Date.now(),
    lastDateKey: String(dateKey || ""),
  }

  store.groups[id] = next
  store.updatedAt = Date.now()
  saveStoreToDisk(store)
  return pickGroupState(next)
}

export function listEnabledGroups() {
  const store = loadStore()
  const groups = safeObject(store.groups) || {}
  const out = []
  for (const [groupId, raw] of Object.entries(groups)) {
    const state = pickGroupState(raw)
    if (!state.enabled) continue
    out.push({ groupId, ...state })
  }
  out.sort((a, b) => String(a.groupId).localeCompare(String(b.groupId)))
  return out
}
