import schedule from "node-schedule"

import cfg from "../../../lib/config.js"

const CONFIG_NAME = "yangmao"

export const DEFAULT_SOURCE_API_BASE = "https://ai-yangmao.com"

const DEFAULT_CONFIG = Object.freeze({
  source: {
    api_base: DEFAULT_SOURCE_API_BASE,
    timeout_ms: 15000,
    lookback_days: 3,
    max_items: 12,
    ending_soon_days: 3,
  },
  push: {
    enabled: true,
    cron: "0 0 12 * * *",
  },
})

function toIntInRange(value, fallback, min, max) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  const int = Math.floor(num)
  if (int < min) return min
  if (int > max) return max
  return int
}

function normalizeApiBase(value, fallback = DEFAULT_CONFIG.source.api_base) {
  const text = String(value || "").trim()
  if (!/^https?:\/\/[^\s]+$/i.test(text)) return fallback
  return text.replace(/\/+$/, "")
}

export function isValidCronExpression(expr) {
  const text = String(expr || "").trim().replace(/\s+/g, " ")
  if (!text) return false
  let job = null
  try {
    job = schedule.scheduleJob(text, () => {})
  } catch {
    return false
  }
  if (!job) return false
  job.cancel()
  return true
}

function normalizeCron(expr, fallback = DEFAULT_CONFIG.push.cron) {
  const text = String(expr || "").trim().replace(/\s+/g, " ")
  return isValidCronExpression(text) ? text : fallback
}

export function normalizeYangmaoConfig(raw = {}) {
  const config = raw && typeof raw === "object" ? raw : {}
  const source = config.source && typeof config.source === "object" ? config.source : {}
  const push = config.push && typeof config.push === "object" ? config.push : {}

  return {
    source: {
      api_base: normalizeApiBase(source.api_base, DEFAULT_CONFIG.source.api_base),
      timeout_ms: toIntInRange(source.timeout_ms, DEFAULT_CONFIG.source.timeout_ms, 3000, 60000),
      lookback_days: toIntInRange(source.lookback_days, DEFAULT_CONFIG.source.lookback_days, 1, 30),
      max_items: toIntInRange(source.max_items, DEFAULT_CONFIG.source.max_items, 1, 30),
      ending_soon_days: toIntInRange(
        source.ending_soon_days,
        DEFAULT_CONFIG.source.ending_soon_days,
        0,
        14,
      ),
    },
    push: {
      enabled: push.enabled === undefined ? DEFAULT_CONFIG.push.enabled : Boolean(push.enabled),
      cron: normalizeCron(push.cron, DEFAULT_CONFIG.push.cron),
    },
  }
}

export function getYangmaoConfig() {
  return normalizeYangmaoConfig(cfg.getConfig(CONFIG_NAME) || {})
}

export { DEFAULT_CONFIG as DEFAULT_YANGMAO_CONFIG }
