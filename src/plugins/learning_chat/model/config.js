import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"

import YAML from "yaml"

import env from "../../../lib/env.js"

const PBKDF2_ITERATIONS = 120_000
const PBKDF2_KEYLEN = 32
const PBKDF2_DIGEST = "sha256"

const DATA_DIR = path.resolve(env.RootPath, "data", "learning_chat")
const CONFIG_PATH = path.join(DATA_DIR, "config.yaml")

let cached = null
let saving = false
let writeQueue = Promise.resolve()

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

function base64urlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), "utf8")
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function base64urlDecodeToBuffer(str) {
  const s = String(str || "").replace(/-/g, "+").replace(/_/g, "/")
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4))
  return Buffer.from(s + pad, "base64")
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

function toNumber(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function deepClone(obj) {
  try {
    return JSON.parse(JSON.stringify(obj))
  } catch {
    return obj
  }
}

function defaultConfig() {
  const password_salt = randomBase64(16)
  const password_hash = pbkdf2Base64("admin", password_salt)

  return {
    version: 1,
    auth: {
      username: "chat",
      password_salt,
      password_hash,
      token_secret: randomBase64(32),
      token_ttl_hours: 168,
    },
    learning: {
      enabled_default: true,
      reply_threshold: 4,
      max_learn_count: 6,
      cross_group_min_groups: 3,
      reply_prob: 0.15,
      reply_cooldown_sec: 12,
      learn_max_gap_sec: 600,
      min_text_len: 2,
      block_words: [],
      block_users: [],
    },
    repeat: {
      enable: true,
      threshold: 3,
      max_window_sec: 3600,
      require_distinct_users: true,
      min_text_len: 2,
    },
    proactive: {
      enable: true,
      allow_default: false,
      min_messages_today: 30,
      silence_factor: 5,
      min_silence_sec: 300,
      min_interval_sec: 600,
      backoff_base_sec: 600,
      backoff_max_exp: 6,
      batch_min: 1,
      batch_max: 3,
      command_enable: true,
      command_history_days: 14,
      command_min_count: 2,
      command_cooldown_sec: 21600,
      command_recent_manual_sec: 3600,
      command_recent_user_hours: 72,
      command_max_daily_per_user: 1,
      command_whitelist: [
        "^帮助(\\s+.*)?$",
        "^水群统计(?:\\s*(今日|今天|1天|3天|7天|30天))?$",
        "^词频统计(?:\\s*(今日|今天|1天|3天|7天|30天))?$",
        "^指令统计(?:\\s*(今日|今天|1天|3天|7天|30天))?$",
      ],
    },
    groups: {},
  }
}

function normalizeArray(value) {
  if (!Array.isArray(value)) return []
  return value.map(v => String(v)).filter(v => v !== "")
}

function normalizeConfig(raw) {
  const d = defaultConfig()
  const out = raw && typeof raw === "object" ? deepClone(raw) : {}

  out.version = 1

  if (!out.auth || typeof out.auth !== "object") out.auth = {}
  out.auth.username = String(out.auth.username || d.auth.username)
  out.auth.password_salt = String(out.auth.password_salt || d.auth.password_salt)
  out.auth.password_hash = String(out.auth.password_hash || d.auth.password_hash)
  out.auth.token_secret = String(out.auth.token_secret || d.auth.token_secret)
  out.auth.token_ttl_hours = toNumber(out.auth.token_ttl_hours, d.auth.token_ttl_hours)

  if (!out.learning || typeof out.learning !== "object") out.learning = {}
  out.learning.enabled_default =
    out.learning.enabled_default !== undefined ? Boolean(out.learning.enabled_default) : d.learning.enabled_default
  out.learning.reply_threshold = Math.max(1, Math.floor(toNumber(out.learning.reply_threshold, d.learning.reply_threshold)))
  out.learning.max_learn_count = Math.max(1, Math.floor(toNumber(out.learning.max_learn_count, d.learning.max_learn_count)))
  out.learning.cross_group_min_groups = Math.max(
    1,
    Math.floor(toNumber(out.learning.cross_group_min_groups, d.learning.cross_group_min_groups)),
  )
  out.learning.reply_prob = Math.max(0, Math.min(1, toNumber(out.learning.reply_prob, d.learning.reply_prob)))
  out.learning.reply_cooldown_sec = Math.max(0, Math.floor(toNumber(out.learning.reply_cooldown_sec, d.learning.reply_cooldown_sec)))
  out.learning.learn_max_gap_sec = Math.max(0, Math.floor(toNumber(out.learning.learn_max_gap_sec, d.learning.learn_max_gap_sec)))
  out.learning.min_text_len = Math.max(0, Math.floor(toNumber(out.learning.min_text_len, d.learning.min_text_len)))
  out.learning.block_words = normalizeArray(out.learning.block_words ?? d.learning.block_words)
  out.learning.block_users = normalizeArray(out.learning.block_users ?? d.learning.block_users)

  if (!out.repeat || typeof out.repeat !== "object") out.repeat = {}
  out.repeat.enable = out.repeat.enable !== undefined ? Boolean(out.repeat.enable) : d.repeat.enable
  out.repeat.threshold = Math.max(2, Math.floor(toNumber(out.repeat.threshold, d.repeat.threshold)))
  out.repeat.max_window_sec = Math.max(1, Math.floor(toNumber(out.repeat.max_window_sec, d.repeat.max_window_sec)))
  out.repeat.require_distinct_users =
    out.repeat.require_distinct_users !== undefined
      ? Boolean(out.repeat.require_distinct_users)
      : d.repeat.require_distinct_users
  out.repeat.min_text_len = Math.max(0, Math.floor(toNumber(out.repeat.min_text_len, d.repeat.min_text_len)))

  if (!out.proactive || typeof out.proactive !== "object") out.proactive = {}
  out.proactive.enable = out.proactive.enable !== undefined ? Boolean(out.proactive.enable) : d.proactive.enable
  out.proactive.allow_default =
    out.proactive.allow_default !== undefined ? Boolean(out.proactive.allow_default) : d.proactive.allow_default
  out.proactive.min_messages_today = Math.max(
    0,
    Math.floor(toNumber(out.proactive.min_messages_today, d.proactive.min_messages_today)),
  )
  out.proactive.silence_factor = Math.max(1, Math.floor(toNumber(out.proactive.silence_factor, d.proactive.silence_factor)))
  out.proactive.min_silence_sec = Math.max(0, Math.floor(toNumber(out.proactive.min_silence_sec, d.proactive.min_silence_sec)))
  out.proactive.min_interval_sec = Math.max(
    0,
    Math.floor(toNumber(out.proactive.min_interval_sec, d.proactive.min_interval_sec)),
  )
  out.proactive.backoff_base_sec = Math.max(0, Math.floor(toNumber(out.proactive.backoff_base_sec, d.proactive.backoff_base_sec)))
  out.proactive.backoff_max_exp = Math.max(0, Math.floor(toNumber(out.proactive.backoff_max_exp, d.proactive.backoff_max_exp)))
  out.proactive.batch_min = Math.max(1, Math.floor(toNumber(out.proactive.batch_min, d.proactive.batch_min)))
  out.proactive.batch_max = Math.max(out.proactive.batch_min, Math.floor(toNumber(out.proactive.batch_max, d.proactive.batch_max)))
  out.proactive.command_enable =
    out.proactive.command_enable !== undefined ? Boolean(out.proactive.command_enable) : d.proactive.command_enable
  out.proactive.command_history_days = Math.max(
    1,
    Math.floor(toNumber(out.proactive.command_history_days, d.proactive.command_history_days)),
  )
  out.proactive.command_min_count = Math.max(
    1,
    Math.floor(toNumber(out.proactive.command_min_count, d.proactive.command_min_count)),
  )
  out.proactive.command_cooldown_sec = Math.max(
    0,
    Math.floor(toNumber(out.proactive.command_cooldown_sec, d.proactive.command_cooldown_sec)),
  )
  out.proactive.command_recent_manual_sec = Math.max(
    0,
    Math.floor(toNumber(out.proactive.command_recent_manual_sec, d.proactive.command_recent_manual_sec)),
  )
  out.proactive.command_recent_user_hours = Math.max(
    1,
    Math.floor(toNumber(out.proactive.command_recent_user_hours, d.proactive.command_recent_user_hours)),
  )
  out.proactive.command_max_daily_per_user = Math.max(
    1,
    Math.floor(toNumber(out.proactive.command_max_daily_per_user, d.proactive.command_max_daily_per_user)),
  )
  out.proactive.command_whitelist = normalizeArray(out.proactive.command_whitelist ?? d.proactive.command_whitelist)

  if (!out.groups || typeof out.groups !== "object") out.groups = {}
  for (const gid of Object.keys(out.groups)) {
    const g = out.groups[gid]
    if (!g || typeof g !== "object") {
      out.groups[gid] = {}
      continue
    }
    if (g.learning_enabled !== undefined) g.learning_enabled = Boolean(g.learning_enabled)
    if (g.proactive_enabled !== undefined) g.proactive_enabled = Boolean(g.proactive_enabled)
    if (g.reply_prob !== undefined) g.reply_prob = Math.max(0, Math.min(1, toNumber(g.reply_prob, d.learning.reply_prob)))
    if (g.block_words !== undefined) g.block_words = normalizeArray(g.block_words)
    if (g.block_users !== undefined) g.block_users = normalizeArray(g.block_users)
  }

  return out
}

function readConfigFromDisk() {
  ensureDir()
  if (!fs.existsSync(CONFIG_PATH)) {
    const init = defaultConfig()
    fs.writeFileSync(CONFIG_PATH, YAML.stringify(init), "utf8")
    return init
  }

  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8")
    const parsed = raw ? YAML.parse(raw) : null
    const normalized = normalizeConfig(parsed)
    return normalized
  } catch {
    // 不覆盖用户文件，使用默认值兜底
    return defaultConfig()
  }
}

async function saveConfigToDisk(nextCfg) {
  writeQueue = writeQueue.then(async () => {
    ensureDir()
    saving = true
    try {
      fs.writeFileSync(CONFIG_PATH, YAML.stringify(nextCfg), "utf8")
    } finally {
      saving = false
    }
  })
  await writeQueue
}

export function getConfigPath() {
  return CONFIG_PATH
}

export function getConfig() {
  if (!cached) cached = readConfigFromDisk()
  return cached
}

export async function reloadConfig() {
  if (saving) return cached || getConfig()
  cached = readConfigFromDisk()
  return cached
}

export function getSafeConfig() {
  const cfg = getConfig()
  return {
    ...cfg,
    auth: {
      username: cfg?.auth?.username || "chat",
      token_ttl_hours: cfg?.auth?.token_ttl_hours ?? 168,
    },
  }
}

export function verifyPassword(password) {
  const cfg = getConfig()
  const salt = String(cfg?.auth?.password_salt || "")
  const expected = Buffer.from(String(cfg?.auth?.password_hash || ""), "base64")
  const got = Buffer.from(pbkdf2Base64(password, salt), "base64")
  if (!expected.length || expected.length !== got.length) return false
  return crypto.timingSafeEqual(expected, got)
}

export function createAuthToken(username) {
  const cfg = getConfig()
  const secret = Buffer.from(String(cfg?.auth?.token_secret || ""), "base64")
  const ttlHours = toNumber(cfg?.auth?.token_ttl_hours, 168)
  const exp = Date.now() + Math.max(1, ttlHours) * 3600_000
  const payloadObj = { u: String(username || ""), exp, n: base64urlEncode(crypto.randomBytes(8)) }
  const payload = base64urlEncode(JSON.stringify(payloadObj))
  const sig = base64urlEncode(crypto.createHmac("sha256", secret).update(payload).digest())
  return `${payload}.${sig}`
}

export function verifyAuthToken(token) {
  const cfg = getConfig()
  const secret = Buffer.from(String(cfg?.auth?.token_secret || ""), "base64")
  const t = String(token || "")
  const idx = t.indexOf(".")
  if (idx <= 0) return null
  const payload = t.slice(0, idx)
  const sig = t.slice(idx + 1)
  if (!payload || !sig) return null

  const expected = base64urlEncode(crypto.createHmac("sha256", secret).update(payload).digest())
  const a = Buffer.from(expected)
  const b = Buffer.from(sig)
  if (a.length !== b.length) return null
  if (!crypto.timingSafeEqual(a, b)) return null

  try {
    const json = JSON.parse(base64urlDecodeToBuffer(payload).toString("utf8"))
    if (!json || typeof json !== "object") return null
    const exp = Number(json.exp)
    if (!Number.isFinite(exp) || exp <= Date.now()) return null
    const u = String(json.u || "")
    if (!u) return null
    return { username: u, exp }
  } catch {
    return null
  }
}

export function getEffectiveGroupConfig(groupId) {
  const cfg = getConfig()
  const gid = String(groupId || "")
  const g = (cfg.groups && typeof cfg.groups === "object" && cfg.groups[gid]) || {}

  const learningEnabled =
    g.learning_enabled !== undefined ? Boolean(g.learning_enabled) : Boolean(cfg.learning?.enabled_default)

  const proactiveEnabled =
    g.proactive_enabled !== undefined ? Boolean(g.proactive_enabled) : Boolean(cfg.proactive?.allow_default)

  const replyProb =
    g.reply_prob !== undefined ? Math.max(0, Math.min(1, toNumber(g.reply_prob, cfg.learning?.reply_prob))) : toNumber(cfg.learning?.reply_prob, 0.15)

  const blockWords = [
    ...normalizeArray(cfg.learning?.block_words),
    ...normalizeArray(g.block_words),
  ]

  const blockUsers = [
    ...normalizeArray(cfg.learning?.block_users),
    ...normalizeArray(g.block_users),
  ]

  return {
    group_id: gid,
    learning_enabled: learningEnabled,
    proactive_enabled: proactiveEnabled,
    reply_prob: replyProb,
    block_words: Array.from(new Set(blockWords)),
    block_users: Array.from(new Set(blockUsers)),
  }
}

export async function setGroupOverrides(groupId, patch = {}) {
  const cfg = getConfig()
  const gid = String(groupId || "")
  if (!gid) return cfg
  if (!cfg.groups || typeof cfg.groups !== "object") cfg.groups = {}
  if (!cfg.groups[gid] || typeof cfg.groups[gid] !== "object") cfg.groups[gid] = {}

  const g = cfg.groups[gid]

  if (patch.learning_enabled !== undefined) g.learning_enabled = Boolean(patch.learning_enabled)
  if (patch.proactive_enabled !== undefined) g.proactive_enabled = Boolean(patch.proactive_enabled)
  if (patch.reply_prob !== undefined) g.reply_prob = Math.max(0, Math.min(1, toNumber(patch.reply_prob, cfg.learning?.reply_prob ?? 0.15)))
  if (patch.block_words !== undefined) g.block_words = normalizeArray(patch.block_words)
  if (patch.block_users !== undefined) g.block_users = normalizeArray(patch.block_users)

  cached = normalizeConfig(cfg)
  await saveConfigToDisk(cached)
  return cached
}

export async function updateGlobalConfig(patch = {}) {
  const cfg = getConfig()

  if (patch.learning && typeof patch.learning === "object") {
    const p = patch.learning
    if (p.enabled_default !== undefined) cfg.learning.enabled_default = Boolean(p.enabled_default)
    if (p.reply_threshold !== undefined) cfg.learning.reply_threshold = Math.max(1, Math.floor(toNumber(p.reply_threshold, cfg.learning.reply_threshold)))
    if (p.max_learn_count !== undefined) cfg.learning.max_learn_count = Math.max(1, Math.floor(toNumber(p.max_learn_count, cfg.learning.max_learn_count)))
    if (p.cross_group_min_groups !== undefined) cfg.learning.cross_group_min_groups = Math.max(
      1,
      Math.floor(toNumber(p.cross_group_min_groups, cfg.learning.cross_group_min_groups)),
    )
    if (p.reply_prob !== undefined) cfg.learning.reply_prob = Math.max(0, Math.min(1, toNumber(p.reply_prob, cfg.learning.reply_prob)))
    if (p.reply_cooldown_sec !== undefined) cfg.learning.reply_cooldown_sec = Math.max(
      0,
      Math.floor(toNumber(p.reply_cooldown_sec, cfg.learning.reply_cooldown_sec)),
    )
    if (p.learn_max_gap_sec !== undefined) cfg.learning.learn_max_gap_sec = Math.max(
      0,
      Math.floor(toNumber(p.learn_max_gap_sec, cfg.learning.learn_max_gap_sec)),
    )
    if (p.min_text_len !== undefined) cfg.learning.min_text_len = Math.max(
      0,
      Math.floor(toNumber(p.min_text_len, cfg.learning.min_text_len)),
    )
    if (p.block_words !== undefined) cfg.learning.block_words = normalizeArray(p.block_words)
    if (p.block_users !== undefined) cfg.learning.block_users = normalizeArray(p.block_users)
  }

  if (patch.repeat && typeof patch.repeat === "object") {
    const p = patch.repeat
    if (p.enable !== undefined) cfg.repeat.enable = Boolean(p.enable)
    if (p.threshold !== undefined) cfg.repeat.threshold = Math.max(2, Math.floor(toNumber(p.threshold, cfg.repeat.threshold)))
    if (p.max_window_sec !== undefined) cfg.repeat.max_window_sec = Math.max(
      1,
      Math.floor(toNumber(p.max_window_sec, cfg.repeat.max_window_sec)),
    )
    if (p.require_distinct_users !== undefined) cfg.repeat.require_distinct_users = Boolean(p.require_distinct_users)
    if (p.min_text_len !== undefined) cfg.repeat.min_text_len = Math.max(
      0,
      Math.floor(toNumber(p.min_text_len, cfg.repeat.min_text_len)),
    )
  }

  if (patch.proactive && typeof patch.proactive === "object") {
    const p = patch.proactive
    if (p.enable !== undefined) cfg.proactive.enable = Boolean(p.enable)
    if (p.allow_default !== undefined) cfg.proactive.allow_default = Boolean(p.allow_default)
    if (p.min_messages_today !== undefined) cfg.proactive.min_messages_today = Math.max(
      0,
      Math.floor(toNumber(p.min_messages_today, cfg.proactive.min_messages_today)),
    )
    if (p.silence_factor !== undefined) cfg.proactive.silence_factor = Math.max(
      1,
      Math.floor(toNumber(p.silence_factor, cfg.proactive.silence_factor)),
    )
    if (p.min_silence_sec !== undefined) cfg.proactive.min_silence_sec = Math.max(
      0,
      Math.floor(toNumber(p.min_silence_sec, cfg.proactive.min_silence_sec)),
    )
    if (p.min_interval_sec !== undefined) cfg.proactive.min_interval_sec = Math.max(
      0,
      Math.floor(toNumber(p.min_interval_sec, cfg.proactive.min_interval_sec)),
    )
    if (p.backoff_base_sec !== undefined) cfg.proactive.backoff_base_sec = Math.max(
      0,
      Math.floor(toNumber(p.backoff_base_sec, cfg.proactive.backoff_base_sec)),
    )
    if (p.backoff_max_exp !== undefined) cfg.proactive.backoff_max_exp = Math.max(
      0,
      Math.floor(toNumber(p.backoff_max_exp, cfg.proactive.backoff_max_exp)),
    )
    if (p.batch_min !== undefined) cfg.proactive.batch_min = Math.max(1, Math.floor(toNumber(p.batch_min, cfg.proactive.batch_min)))
    if (p.batch_max !== undefined) cfg.proactive.batch_max = Math.max(
      cfg.proactive.batch_min,
      Math.floor(toNumber(p.batch_max, cfg.proactive.batch_max)),
    )
    if (p.command_enable !== undefined) cfg.proactive.command_enable = Boolean(p.command_enable)
    if (p.command_history_days !== undefined) cfg.proactive.command_history_days = Math.max(
      1,
      Math.floor(toNumber(p.command_history_days, cfg.proactive.command_history_days)),
    )
    if (p.command_min_count !== undefined) cfg.proactive.command_min_count = Math.max(
      1,
      Math.floor(toNumber(p.command_min_count, cfg.proactive.command_min_count)),
    )
    if (p.command_cooldown_sec !== undefined) cfg.proactive.command_cooldown_sec = Math.max(
      0,
      Math.floor(toNumber(p.command_cooldown_sec, cfg.proactive.command_cooldown_sec)),
    )
    if (p.command_recent_manual_sec !== undefined) cfg.proactive.command_recent_manual_sec = Math.max(
      0,
      Math.floor(toNumber(p.command_recent_manual_sec, cfg.proactive.command_recent_manual_sec)),
    )
    if (p.command_recent_user_hours !== undefined) cfg.proactive.command_recent_user_hours = Math.max(
      1,
      Math.floor(toNumber(p.command_recent_user_hours, cfg.proactive.command_recent_user_hours)),
    )
    if (p.command_max_daily_per_user !== undefined) cfg.proactive.command_max_daily_per_user = Math.max(
      1,
      Math.floor(toNumber(p.command_max_daily_per_user, cfg.proactive.command_max_daily_per_user)),
    )
    if (p.command_whitelist !== undefined) cfg.proactive.command_whitelist = normalizeArray(p.command_whitelist)
  }

  cached = normalizeConfig(cfg)
  await saveConfigToDisk(cached)
  return cached
}

export async function updateAuth({ username, password, rotate_token_secret } = {}) {
  const cfg = getConfig()
  if (username !== undefined) cfg.auth.username = String(username || "").trim() || cfg.auth.username
  if (password !== undefined) {
    const salt = randomBase64(16)
    cfg.auth.password_salt = salt
    cfg.auth.password_hash = pbkdf2Base64(password, salt)
  }
  if (rotate_token_secret) {
    cfg.auth.token_secret = randomBase64(32)
  }

  cached = normalizeConfig(cfg)
  await saveConfigToDisk(cached)
  return cached
}
