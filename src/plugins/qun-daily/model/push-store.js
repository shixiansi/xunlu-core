import fs from "node:fs"
import path from "node:path"

import { getRuntimePaths } from "../../../runtime/runtime-context.js"

const DATA_DIR = getRuntimePaths().getPluginDataDir("qun-daily")
const STORE_PATH = path.join(DATA_DIR, "push-settings.json")

const DEFAULT_GROUP_PUSH = Object.freeze({
  stats: false,
  words: false,
  commands: false,
})

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
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

function readStoreFromDisk() {
  ensureDir()
  if (!fs.existsSync(STORE_PATH)) return defaultStore()

  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8")
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
  ensureDir()
  const tmpPath = `${STORE_PATH}.tmp`
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), "utf8")
  fs.renameSync(tmpPath, STORE_PATH)
}

let cache = null

export function loadGroupPushStore() {
  if (cache) return cache
  cache = readStoreFromDisk()
  return cache
}

export function resetGroupPushStoreCache() {
  cache = null
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
