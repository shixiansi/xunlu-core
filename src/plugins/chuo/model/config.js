import fs from "node:fs"
import path from "node:path"

import env from "../../../lib/env.js"

let cachedConfig = null
let cachedAt = 0
let cachedPath = ""

export function getChuoConfigPath() {
  return path.resolve(env.RootPath, "data", "chuo", "config.json")
}

function ensureDir(configPath = getChuoConfigPath()) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
}

function normalizeConfig(raw) {
  if (!raw || typeof raw !== "object") return { enabled: true }
  return {
    enabled: raw.enabled !== false,
  }
}

function readConfigFromDisk(configPath = getChuoConfigPath()) {
  ensureDir(configPath)

  if (!fs.existsSync(configPath)) {
    const init = { enabled: true }
    fs.writeFileSync(configPath, JSON.stringify(init, null, 2), "utf8")
    return init
  }

  try {
    const raw = fs.readFileSync(configPath, "utf8")
    const data = raw ? JSON.parse(raw) : null
    return normalizeConfig(data)
  } catch {
    return { enabled: true }
  }
}

export function getChuoConfig({ ttlMs = 5000 } = {}) {
  const now = Date.now()
  const configPath = getChuoConfigPath()
  if (cachedConfig && cachedPath === configPath && now - cachedAt < ttlMs) return cachedConfig
  cachedConfig = readConfigFromDisk(configPath)
  cachedAt = now
  cachedPath = configPath
  return cachedConfig
}

export function setChuoEnabled(enabled) {
  const configPath = getChuoConfigPath()
  ensureDir(configPath)
  cachedConfig = {
    enabled: Boolean(enabled),
  }
  cachedAt = Date.now()
  cachedPath = configPath
  fs.writeFileSync(configPath, JSON.stringify(cachedConfig, null, 2), "utf8")
  return cachedConfig
}
