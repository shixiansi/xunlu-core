import fs from "node:fs"
import path from "node:path"

import env from "../../../lib/env.js"

const DATA_DIR = path.resolve(env.RootPath, "data", "chuo")
const CONFIG_PATH = path.join(DATA_DIR, "config.json")

let cachedConfig = null
let cachedAt = 0

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

function normalizeConfig(raw) {
  if (!raw || typeof raw !== "object") return { enabled: true }
  return {
    enabled: raw.enabled !== false,
  }
}

function readConfigFromDisk() {
  ensureDir()

  if (!fs.existsSync(CONFIG_PATH)) {
    const init = { enabled: true }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(init, null, 2), "utf8")
    return init
  }

  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8")
    const data = raw ? JSON.parse(raw) : null
    return normalizeConfig(data)
  } catch {
    return { enabled: true }
  }
}

export function getChuoConfig({ ttlMs = 5000 } = {}) {
  const now = Date.now()
  if (cachedConfig && now - cachedAt < ttlMs) return cachedConfig
  cachedConfig = readConfigFromDisk()
  cachedAt = now
  return cachedConfig
}

export function setChuoEnabled(enabled) {
  ensureDir()
  cachedConfig = {
    enabled: Boolean(enabled),
  }
  cachedAt = Date.now()
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cachedConfig, null, 2), "utf8")
  return cachedConfig
}

export function getChuoConfigPath() {
  return CONFIG_PATH
}
