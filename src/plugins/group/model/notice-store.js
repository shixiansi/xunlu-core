import fs from "node:fs"
import path from "node:path"

import env from "../../../lib/env.js"

const DEFAULT_SYSTEM = {
  notify_all_masters: false,
  cache_ttl_sec: 60,
}

const DEFAULT_BOT = {
  friend_message: false,
  friend_recall: false,
  friend_request: false,
  group_invite: false,
}

const DEFAULT_GROUP = {
  group_message: false,
  group_temp_message: false,
  group_recall: false,
  group_join_request: false,
  group_member_change: false,
  group_admin_change: false,
  bot_muted: false,
  group_list_change: false,
}

const DEFAULT_GLOBAL = {
  friend_list_change: false,
}

function getNoticeStorePath() {
  return path.resolve(env.RootPath, "data", "group", "notice-settings.json")
}

function ensureDir(storePath = getNoticeStorePath()) {
  fs.mkdirSync(path.dirname(storePath), { recursive: true })
}

function defaultStore() {
  return {
    version: 1,
    updatedAt: Date.now(),
    system: { ...DEFAULT_SYSTEM },
    bots: {},
    groups: {},
    global: { ...DEFAULT_GLOBAL },
  }
}

function normalizeId(id) {
  if (id === undefined || id === null) return ""
  const s = String(id).trim()
  return s
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null
}

function readStoreFromDisk(storePath = getNoticeStorePath()) {
  ensureDir(storePath)
  if (!fs.existsSync(storePath)) return defaultStore()

  try {
    const raw = fs.readFileSync(storePath, "utf8")
    const data = raw ? JSON.parse(raw) : null
    if (!data || typeof data !== "object") return defaultStore()

    const out = defaultStore()
    out.version = Number(data.version || out.version) || out.version
    out.updatedAt = Number(data.updatedAt || out.updatedAt) || out.updatedAt

    if (safeObject(data.system)) out.system = { ...out.system, ...data.system }
    if (safeObject(data.bots)) out.bots = data.bots
    if (safeObject(data.groups)) out.groups = data.groups
    if (safeObject(data.global)) out.global = { ...out.global, ...data.global }

    return out
  } catch {
    return defaultStore()
  }
}

function saveStoreToDisk(store) {
  const storePath = getNoticeStorePath()
  ensureDir(storePath)
  const payload = JSON.stringify(store, null, 2)
  const tmpPath = `${storePath}.tmp`
  fs.writeFileSync(tmpPath, payload, "utf8")
  fs.renameSync(tmpPath, storePath)
}

let cache = null
let cachePath = ""

export function loadNoticeStore() {
  const storePath = getNoticeStorePath()
  if (cache && cachePath === storePath) return cache
  cache = readStoreFromDisk(storePath)
  cachePath = storePath
  return cache
}

export function getSystemNoticeConfig() {
  const store = loadNoticeStore()
  const sys = safeObject(store.system) || {}
  return { ...DEFAULT_SYSTEM, ...sys }
}

export function setSystemNoticeConfig(patch = {}) {
  const store = loadNoticeStore()
  if (!safeObject(store.system)) store.system = { ...DEFAULT_SYSTEM }

  if (patch.notify_all_masters !== undefined) {
    store.system.notify_all_masters = Boolean(patch.notify_all_masters)
  }
  if (patch.cache_ttl_sec !== undefined) {
    const n = Number(patch.cache_ttl_sec)
    store.system.cache_ttl_sec = Number.isFinite(n) ? Math.max(1, Math.floor(n)) : DEFAULT_SYSTEM.cache_ttl_sec
  }

  store.updatedAt = Date.now()
  saveStoreToDisk(store)
  return getSystemNoticeConfig()
}

export function getBotNoticeConfig(selfId) {
  const store = loadNoticeStore()
  const id = normalizeId(selfId)
  if (!id) return { ...DEFAULT_BOT }

  const raw = safeObject(store.bots?.[id]) || {}
  return { ...DEFAULT_BOT, ...raw }
}

export function setBotNoticeConfig(selfId, patch = {}) {
  const store = loadNoticeStore()
  const id = normalizeId(selfId)
  if (!id) return null

  if (!safeObject(store.bots)) store.bots = {}
  const prev = safeObject(store.bots[id]) || {}
  const next = { ...prev }

  for (const k of Object.keys(DEFAULT_BOT)) {
    if (patch[k] !== undefined) next[k] = Boolean(patch[k])
  }

  store.bots[id] = next
  store.updatedAt = Date.now()
  saveStoreToDisk(store)
  return getBotNoticeConfig(id)
}

export function getGroupNoticeConfig(groupId) {
  const store = loadNoticeStore()
  const id = normalizeId(groupId)
  if (!id) return { ...DEFAULT_GROUP }

  const raw = safeObject(store.groups?.[id]) || {}
  return { ...DEFAULT_GROUP, ...raw }
}

export function setGroupNoticeConfig(groupId, patch = {}) {
  const store = loadNoticeStore()
  const id = normalizeId(groupId)
  if (!id) return null

  if (!safeObject(store.groups)) store.groups = {}
  const prev = safeObject(store.groups[id]) || {}
  const next = { ...prev }

  for (const k of Object.keys(DEFAULT_GROUP)) {
    if (patch[k] !== undefined) next[k] = Boolean(patch[k])
  }

  store.groups[id] = next
  store.updatedAt = Date.now()
  saveStoreToDisk(store)
  return getGroupNoticeConfig(id)
}

export function removeGroupNoticeConfig(groupId) {
  const store = loadNoticeStore()
  const id = normalizeId(groupId)
  if (!id || !safeObject(store.groups) || !Object.prototype.hasOwnProperty.call(store.groups, id)) {
    return false
  }

  delete store.groups[id]
  store.updatedAt = Date.now()
  saveStoreToDisk(store)
  return true
}

export function listConfiguredGroupNoticeIds() {
  const store = loadNoticeStore()
  return Object.keys(safeObject(store.groups) || {}).filter(Boolean)
}

export function reconcileGroupNoticeConfigs(activeGroupIds = []) {
  const active = new Set((Array.isArray(activeGroupIds) ? activeGroupIds : []).map(id => normalizeId(id)).filter(Boolean))
  const removed = []
  for (const gid of listConfiguredGroupNoticeIds()) {
    if (active.has(gid)) continue
    if (removeGroupNoticeConfig(gid)) removed.push(gid)
  }
  return removed.sort((a, b) => a.localeCompare(b))
}

export function getGlobalNoticeConfig() {
  const store = loadNoticeStore()
  const raw = safeObject(store.global) || {}
  return { ...DEFAULT_GLOBAL, ...raw }
}

export function setGlobalNoticeConfig(patch = {}) {
  const store = loadNoticeStore()
  if (!safeObject(store.global)) store.global = { ...DEFAULT_GLOBAL }

  for (const k of Object.keys(DEFAULT_GLOBAL)) {
    if (patch[k] !== undefined) store.global[k] = Boolean(patch[k])
  }

  store.updatedAt = Date.now()
  saveStoreToDisk(store)
  return getGlobalNoticeConfig()
}
