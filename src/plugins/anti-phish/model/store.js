import fs from "node:fs"
import path from "node:path"

import env from "../../../lib/env.js"

export function getAntiPhishStorePath() {
  return path.resolve(env.RootPath, "data", "anti-phish.json")
}

function ensureDir(storePath = getAntiPhishStorePath()) {
  fs.mkdirSync(path.dirname(storePath), { recursive: true })
}

function normalizeDomain(input) {
  const value = String(input || "").trim().toLowerCase()
  if (!value) return ""

  const withoutProtocol = value.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
  const withoutPath = withoutProtocol.split(/[/?#]/)[0] || ""
  const withoutPort = withoutPath.replace(/:\d+$/, "")
  return withoutPort.replace(/^\.+|\.+$/g, "")
}

function createDefaultStore() {
  return {
    version: 1,
    updatedAt: Date.now(),
    blacklist: {
      // "trollweb.pages.dev": {
      //   reason: "手动标记的恶意网址",
      //   addedAt: Date.now(),
      //   source: "builtin",
      // },
    },
  }
}

let cache = null
let cachePath = ""

export function loadStore() {
  const storePath = getAntiPhishStorePath()
  if (cache && cachePath === storePath) return cache
  ensureDir(storePath)

  if (!fs.existsSync(storePath)) {
    cache = createDefaultStore()
    cachePath = storePath
    return cache
  }

  try {
    const raw = fs.readFileSync(storePath, "utf8")
    const parsed = raw ? JSON.parse(raw) : null
    if (!parsed || typeof parsed !== "object") {
      cache = createDefaultStore()
      cachePath = storePath
      return cache
    }
    if (!parsed.blacklist || typeof parsed.blacklist !== "object") parsed.blacklist = {}
    if (!parsed.version) parsed.version = 1
    if (!parsed.updatedAt) parsed.updatedAt = Date.now()
    cache = parsed
    cachePath = storePath
    return cache
  } catch {
    cache = createDefaultStore()
    cachePath = storePath
    return cache
  }
}

function saveStore(store) {
  const storePath = getAntiPhishStorePath()
  ensureDir(storePath)
  const payload = JSON.stringify(store, null, 2)
  const tmpPath = `${storePath}.tmp`
  fs.writeFileSync(tmpPath, payload, "utf8")
  fs.renameSync(tmpPath, storePath)
}

export function listBlacklist() {
  const store = loadStore()
  return Object.entries(store.blacklist || {})
    .map(([domain, info]) => ({
      domain,
      reason: String(info?.reason || ""),
      source: String(info?.source || "manual"),
      addedAt: Number(info?.addedAt || 0),
    }))
    .sort((a, b) => a.domain.localeCompare(b.domain, "zh-Hans-CN"))
}

export function addBlacklistDomain(domain, reason = "手动添加") {
  const normalized = normalizeDomain(domain)
  if (!normalized) return null

  const store = loadStore()
  store.blacklist[normalized] = {
    reason: String(reason || "手动添加"),
    addedAt: Date.now(),
    source: "manual",
  }
  store.updatedAt = Date.now()
  saveStore(store)
  return normalized
}

export function removeBlacklistDomain(domain) {
  const normalized = normalizeDomain(domain)
  if (!normalized) return false

  const store = loadStore()
  if (!store.blacklist[normalized]) return false
  delete store.blacklist[normalized]
  store.updatedAt = Date.now()
  saveStore(store)
  return true
}

export function getBlacklistMeta(domain) {
  const normalized = normalizeDomain(domain)
  if (!normalized) return null
  const store = loadStore()
  return store.blacklist?.[normalized] || null
}

export function isBlacklistedDomain(domain) {
  const normalized = normalizeDomain(domain)
  if (!normalized) return null

  const store = loadStore()
  const blacklist = store.blacklist || {}
  const parts = normalized.split(".")
  for (let index = 0; index < parts.length; index += 1) {
    const current = parts.slice(index).join(".")
    if (blacklist[current]) {
      return {
        domain: normalized,
        matchedDomain: current,
        meta: blacklist[current],
      }
    }
  }
  return null
}

export { normalizeDomain }
