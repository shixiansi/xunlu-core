import fs from "node:fs"
import path from "node:path"

import env from "../../../lib/env.js"

const DEFAULT_GROUP_PUSH = Object.freeze({
  stats: false,
  words: false,
  commands: false,
})

export function getGroupPushStorePath() {
  return path.resolve(env.RootPath, "data", "qun-daily", "push-settings.json")
}

function ensureDir(storePath = getGroupPushStorePath()) {
  fs.mkdirSync(path.dirname(storePath), { recursive: true })
}

function defaultStore() {
  return {
    version: 1,
    updatedAt: Date.now(),
    groups: {},
  }
}

function normalizeGroupId(groupId) {
  if (groupId === undefined || groupId === null) return ""
  return String(groupId).trim()
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null
}

function readStoreFromDisk(storePath = getGroupPushStorePath()) {
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
  const storePath = getGroupPushStorePath()
  ensureDir(storePath)
  const tmpPath = `${storePath}.tmp`
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), "utf8")
  fs.renameSync(tmpPath, storePath)
}

let cache = null
let cachePath = ""

export function loadGroupPushStore() {
  const storePath = getGroupPushStorePath()
  if (cache && cachePath === storePath) return cache
  cache = readStoreFromDisk(storePath)
  cachePath = storePath
  return cache
}

export function resetGroupPushStoreCache() {
  cache = null
  cachePath = ""
}

export function getGroupPushConfig(groupId) {
  const store = loadGroupPushStore()
  const id = normalizeGroupId(groupId)
  if (!id) return { ...DEFAULT_GROUP_PUSH }

  const raw = safeObject(store.groups?.[id]) || {}
  return {
    stats: raw.stats === true,
    words: raw.words === true,
    commands: raw.commands === true,
  }
}

export function setGroupPushConfig(groupId, patch = {}) {
  const store = loadGroupPushStore()
  const id = normalizeGroupId(groupId)
  if (!id) return null

  if (!safeObject(store.groups)) store.groups = {}
  const prev = safeObject(store.groups[id]) || {}
  const next = { ...DEFAULT_GROUP_PUSH, ...prev }

  for (const key of Object.keys(DEFAULT_GROUP_PUSH)) {
    if (patch[key] !== undefined) next[key] = Boolean(patch[key])
  }

  store.groups[id] = next
  store.updatedAt = Date.now()
  saveStoreToDisk(store)
  return getGroupPushConfig(id)
}
