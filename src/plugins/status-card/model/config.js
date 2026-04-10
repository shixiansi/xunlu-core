import path from "node:path"

import cfg from "../../../lib/config.js"

export const DEFAULT_STATUS_CARD_CONFIG = Object.freeze({
  commands: {
    aliases: ["系统状态", "状态卡片", "运行状态"],
  },
  theme: {
    title: "系统状态",
    badge_mode: "adapter",
    background: "builtin:sunset",
    avatar: "bot",
    doodle: "builtin:cat",
    footer_signature: "Kawaii Status",
  },
  display: {
    show_gpu: true,
    show_network: true,
    disk_path: "auto",
    net_sample_ms: 1000,
  },
})

export const STATUS_CARD_BUILTIN_ASSETS = Object.freeze({
  background: {
    default: "img/builtin/bg-sunset.svg",
    sunset: "img/builtin/bg.jpg",
  },
  avatar: {
    default: "img/builtin/avatar-default.svg",
    avatar: "img/builtin/avatar-default.svg",
  },
  doodle: {
    default: "img/builtin/doodle-cat.svg",
    cat: "img/builtin/doodle-cat.svg",
  },
})

const BADGE_MODES = new Set(["adapter", "protocol", "title", "none"])

function normalizeString(value, fallback = "") {
  const text = String(value ?? "").trim()
  return text || fallback
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0

  const text = String(value ?? "").trim().toLowerCase()
  if (text === "true") return true
  if (text === "false") return false
  return fallback
}

function normalizeInteger(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.max(min, Math.min(max, Math.round(num)))
}

function isAbsolutePath(value) {
  return path.isAbsolute(value) || /^[a-z]:[\\/]/i.test(value)
}

function normalizeAliases(input) {
  const source = Array.isArray(input) ? input : DEFAULT_STATUS_CARD_CONFIG.commands.aliases
  const seen = new Set()
  const list = []

  for (const item of source) {
    const text = normalizeString(item)
    if (!text) continue
    if (seen.has(text)) continue
    seen.add(text)
    list.push(text)
  }

  return list.length ? list : [...DEFAULT_STATUS_CARD_CONFIG.commands.aliases]
}

function normalizeAsset(value, fallback) {
  const text = normalizeString(value, fallback)
  if (/^(bot|bot-avatar)$/i.test(text)) return "bot"
  if (/^builtin:avatar$/i.test(text)) return "bot"
  if (/^qq:\d+$/i.test(text)) return text.toLowerCase()
  if (/^builtin:/i.test(text)) {
    return `builtin:${text.slice(8).trim().toLowerCase() || "default"}`
  }
  if (/^https?:\/\//i.test(text)) return text
  if (/^file:\/\//i.test(text)) return text
  if (isAbsolutePath(text)) return path.normalize(text)
  return fallback
}

function normalizeBadgeMode(value) {
  const text = normalizeString(value, DEFAULT_STATUS_CARD_CONFIG.theme.badge_mode).toLowerCase()
  return BADGE_MODES.has(text) ? text : DEFAULT_STATUS_CARD_CONFIG.theme.badge_mode
}

function normalizeDiskPath(value) {
  const text = normalizeString(value, DEFAULT_STATUS_CARD_CONFIG.display.disk_path)
  if (!text || text.toLowerCase() === "auto") return "auto"
  if (isAbsolutePath(text)) return path.normalize(text)
  return DEFAULT_STATUS_CARD_CONFIG.display.disk_path
}

export function normalizeStatusCardConfig(raw = {}) {
  const config = raw && typeof raw === "object" ? raw : {}
  const commands = config.commands && typeof config.commands === "object" ? config.commands : {}
  const theme = config.theme && typeof config.theme === "object" ? config.theme : {}
  const display = config.display && typeof config.display === "object" ? config.display : {}

  return {
    commands: {
      aliases: normalizeAliases(commands.aliases),
    },
    theme: {
      title: normalizeString(theme.title, DEFAULT_STATUS_CARD_CONFIG.theme.title),
      badge_mode: normalizeBadgeMode(theme.badge_mode),
      background: normalizeAsset(theme.background, DEFAULT_STATUS_CARD_CONFIG.theme.background),
      avatar: normalizeAsset(theme.avatar, DEFAULT_STATUS_CARD_CONFIG.theme.avatar),
      doodle: normalizeAsset(theme.doodle, DEFAULT_STATUS_CARD_CONFIG.theme.doodle),
      footer_signature: normalizeString(
        theme.footer_signature,
        DEFAULT_STATUS_CARD_CONFIG.theme.footer_signature,
      ),
    },
    display: {
      show_gpu: normalizeBoolean(display.show_gpu, DEFAULT_STATUS_CARD_CONFIG.display.show_gpu),
      show_network: normalizeBoolean(display.show_network, DEFAULT_STATUS_CARD_CONFIG.display.show_network),
      disk_path: normalizeDiskPath(display.disk_path),
      net_sample_ms: normalizeInteger(
        display.net_sample_ms,
        DEFAULT_STATUS_CARD_CONFIG.display.net_sample_ms,
        { min: 200, max: 5000 },
      ),
    },
  }
}

export function getStatusCardConfig() {
  return normalizeStatusCardConfig(cfg.getConfig("status-card") || {})
}

export function saveStatusCardConfig(raw = {}) {
  const normalized = normalizeStatusCardConfig(raw)
  const current = cfg.getConfig("status-card") || {}
  const next = {
    ...current,
    commands: {
      ...(current?.commands || {}),
      ...normalized.commands,
    },
    theme: {
      ...(current?.theme || {}),
      ...normalized.theme,
    },
    display: {
      ...(current?.display || {}),
      ...normalized.display,
    },
  }

  cfg.getConfigReader("status-card").setData(next)
  return normalizeStatusCardConfig(next)
}

export function resolveStatusCardBuiltinAsset(kind, name = "default") {
  const bucket = STATUS_CARD_BUILTIN_ASSETS[kind] || {}
  const key = normalizeString(name, "default").toLowerCase()
  return bucket[key] || bucket.default || ""
}
