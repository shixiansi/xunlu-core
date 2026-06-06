import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import YAML from "yaml"

import env from "../env.js"

const PBKDF2_ITERATIONS = 120_000
const PBKDF2_KEYLEN = 32
const PBKDF2_DIGEST = "sha256"

export const WEBUI_COOKIE_NAME = "xunlu_webui_token"

let cached = null
let cachedConfigPath = ""
let saving = false
let writeQueue = Promise.resolve()

export function getWebuiDataDir() {
  return path.resolve(env.RootPath, "data", "webui")
}

export function getWebuiConfigPath() {
  return path.join(getWebuiDataDir(), "config.yaml")
}

function ensureDir() {
  fs.mkdirSync(getWebuiDataDir(), { recursive: true })
}

function toNumber(value, fallback) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function deepClone(value) {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return value
  }
}

function base64urlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input || ""), "utf8")
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function base64urlDecodeToBuffer(str) {
  const normalized = String(str || "").replace(/-/g, "+").replace(/_/g, "/")
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4))
  return Buffer.from(normalized + pad, "base64")
}

function randomBase64(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64")
}

function pbkdf2Base64(password, saltBase64) {
  const salt = Buffer.from(String(saltBase64 || ""), "base64")
  const out = crypto.pbkdf2Sync(
    String(password || ""),
    salt,
    PBKDF2_ITERATIONS,
    PBKDF2_KEYLEN,
    PBKDF2_DIGEST,
  )
  return out.toString("base64")
}

function defaultConfig() {
  const password_salt = randomBase64(16)
  const password_hash = pbkdf2Base64("admin", password_salt)

  return {
    version: 1,
    auth: {
      username: "admin",
      password_salt,
      password_hash,
      token_secret: randomBase64(32),
      token_ttl_hours: 168,
    },
    ui: {
      title: "xunlu-core WebUI",
    },
  }
}

function normalizeConfig(raw) {
  const fallback = defaultConfig()
  const out = raw && typeof raw === "object" ? deepClone(raw) : {}

  out.version = 1

  if (!out.auth || typeof out.auth !== "object") out.auth = {}
  out.auth.username = String(out.auth.username || fallback.auth.username)
  out.auth.password_salt = String(out.auth.password_salt || fallback.auth.password_salt)
  out.auth.password_hash = String(out.auth.password_hash || fallback.auth.password_hash)
  out.auth.token_secret = String(out.auth.token_secret || fallback.auth.token_secret)
  out.auth.token_ttl_hours = Math.max(1, Math.floor(toNumber(out.auth.token_ttl_hours, fallback.auth.token_ttl_hours)))

  if (!out.ui || typeof out.ui !== "object") out.ui = {}
  out.ui.title = String(out.ui.title || fallback.ui.title)

  return out
}

function readConfigFromDisk() {
  const configPath = getWebuiConfigPath()
  ensureDir()
  if (!fs.existsSync(configPath)) {
    const init = defaultConfig()
    fs.writeFileSync(configPath, YAML.stringify(init), "utf8")
    return init
  }

  try {
    const raw = fs.readFileSync(configPath, "utf8")
    const parsed = raw ? YAML.parse(raw) : null
    return normalizeConfig(parsed)
  } catch {
    return defaultConfig()
  }
}

async function saveConfigToDisk(nextCfg) {
  const configPath = getWebuiConfigPath()
  writeQueue = writeQueue.then(async () => {
    ensureDir()
    saving = true
    try {
      fs.writeFileSync(configPath, YAML.stringify(nextCfg), "utf8")
    } finally {
      saving = false
    }
  })

  await writeQueue
}

function getCachedConfigForCurrentPath() {
  return cached && cachedConfigPath === getWebuiConfigPath() ? cached : null
}

function setCachedConfig(nextCfg) {
  cached = nextCfg
  cachedConfigPath = getWebuiConfigPath()
  return cached
}

export function getWebuiConfig() {
  return getCachedConfigForCurrentPath() || setCachedConfig(readConfigFromDisk())
}

export async function reloadWebuiConfig() {
  if (saving) return getCachedConfigForCurrentPath() || getWebuiConfig()
  return setCachedConfig(readConfigFromDisk())
}

export function getSafeWebuiConfig() {
  const cfg = getWebuiConfig()
  return {
    version: cfg.version || 1,
    auth: {
      username: cfg?.auth?.username || "admin",
      token_ttl_hours: cfg?.auth?.token_ttl_hours ?? 168,
    },
    ui: {
      title: cfg?.ui?.title || "xunlu-core WebUI",
    },
  }
}

export function verifyWebuiPassword(password) {
  const cfg = getWebuiConfig()
  const salt = String(cfg?.auth?.password_salt || "")
  const expected = Buffer.from(String(cfg?.auth?.password_hash || ""), "base64")
  const got = Buffer.from(pbkdf2Base64(password, salt), "base64")
  if (!expected.length || expected.length !== got.length) return false
  return crypto.timingSafeEqual(expected, got)
}

export function createWebuiAuthToken(username) {
  const cfg = getWebuiConfig()
  const secret = Buffer.from(String(cfg?.auth?.token_secret || ""), "base64")
  const ttlHours = Math.max(1, toNumber(cfg?.auth?.token_ttl_hours, 168))
  const exp = Date.now() + ttlHours * 3600_000
  const payloadObj = {
    u: String(username || ""),
    exp,
    n: base64urlEncode(crypto.randomBytes(8)),
  }
  const payload = base64urlEncode(JSON.stringify(payloadObj))
  const sig = base64urlEncode(crypto.createHmac("sha256", secret).update(payload).digest())
  return `${payload}.${sig}`
}

export function verifyWebuiAuthToken(token) {
  const cfg = getWebuiConfig()
  const secret = Buffer.from(String(cfg?.auth?.token_secret || ""), "base64")
  const raw = String(token || "")
  const dotIndex = raw.indexOf(".")
  if (dotIndex <= 0) return null

  const payload = raw.slice(0, dotIndex)
  const sig = raw.slice(dotIndex + 1)
  if (!payload || !sig) return null

  const expected = base64urlEncode(crypto.createHmac("sha256", secret).update(payload).digest())
  const a = Buffer.from(expected)
  const b = Buffer.from(sig)
  if (a.length !== b.length) return null
  if (!crypto.timingSafeEqual(a, b)) return null

  try {
    const parsed = JSON.parse(base64urlDecodeToBuffer(payload).toString("utf8"))
    const exp = Number(parsed?.exp)
    const username = String(parsed?.u || "")
    if (!username || !Number.isFinite(exp) || exp <= Date.now()) return null
    return { username, exp }
  } catch {
    return null
  }
}

export async function updateWebuiAuth({ username, password, rotate_token_secret, title } = {}) {
  const cfg = getWebuiConfig()

  if (username !== undefined) {
    cfg.auth.username = String(username || "").trim() || cfg.auth.username
  }

  if (password !== undefined) {
    const salt = randomBase64(16)
    cfg.auth.password_salt = salt
    cfg.auth.password_hash = pbkdf2Base64(password, salt)
  }

  if (rotate_token_secret) {
    cfg.auth.token_secret = randomBase64(32)
  }

  if (title !== undefined) {
    cfg.ui.title = String(title || "").trim() || cfg.ui.title
  }

  cached = setCachedConfig(normalizeConfig(cfg))
  await saveConfigToDisk(cached)
  return getSafeWebuiConfig()
}

export function parseCookies(header) {
  const out = {}
  const raw = String(header || "")
  if (!raw) return out

  for (const item of raw.split(";")) {
    const index = item.indexOf("=")
    if (index <= 0) continue
    const key = item.slice(0, index).trim()
    const value = item.slice(index + 1).trim()
    if (!key) continue
    out[key] = decodeURIComponent(value)
  }

  return out
}

export function setWebuiCookie(res, { name = WEBUI_COOKIE_NAME, value = "", maxAgeSec = 0, httpOnly = true } = {}) {
  const parts = [
    `${name}=${encodeURIComponent(String(value || ""))}`,
    "Path=/",
    "SameSite=Lax",
  ]

  if (httpOnly) parts.push("HttpOnly")
  if (typeof maxAgeSec === "number") parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSec))}`)

  res.setHeader("Set-Cookie", parts.join("; "))
}

export function clearWebuiCookie(res) {
  setWebuiCookie(res, { value: "", maxAgeSec: 0 })
}

export function getWebuiSessionFromRequest(req) {
  const cookies = parseCookies(req?.headers?.cookie)
  const token = cookies[WEBUI_COOKIE_NAME] || ""
  return verifyWebuiAuthToken(token)
}

export function requireWebuiAuth(req, res, next) {
  const session = getWebuiSessionFromRequest(req)
  const cfg = getWebuiConfig()
  if (!session || session.username !== String(cfg?.auth?.username || "")) {
    res.status(401).json({ ok: false, error: "Unauthorized" })
    return
  }

  req.user = session
  next()
}
