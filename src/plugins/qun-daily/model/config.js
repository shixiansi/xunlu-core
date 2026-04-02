import schedule from "node-schedule"

import cfg from "../../../lib/config.js"

const DEFAULT_CONFIG = Object.freeze({
  push: {
    enabled: true,
    cron: "0 5 0 * * *",
    include_stats: true,
    include_words: true,
    include_commands: true,
  },
  command_defaults: {
    stats_days: 1,
    words_days: 1,
    command_days: 1,
  },
})

function normalizePositiveInt(value, fallback) {
  const num = Number(value)
  if (!Number.isFinite(num) || num < 1) return fallback
  return Math.floor(num)
}

function normalizeRangeDays(value, fallback) {
  return normalizePositiveInt(value, fallback)
}

function isValidCronExpression(expr) {
  const text = String(expr || "").trim().replace(/\s+/g, " ")
  if (!text) return false
  const job = schedule.scheduleJob(text, () => {})
  if (!job) return false
  job.cancel()
  return true
}

function normalizeCron(expr, fallback = DEFAULT_CONFIG.push.cron) {
  const text = String(expr || "").trim().replace(/\s+/g, " ")
  return isValidCronExpression(text) ? text : fallback
}

export function normalizeQunDailyConfig(raw = {}) {
  const config = raw && typeof raw === "object" ? raw : {}
  const push = config.push && typeof config.push === "object" ? config.push : {}
  const commandDefaults =
    config.command_defaults && typeof config.command_defaults === "object"
      ? config.command_defaults
      : {}

  return {
    push: {
      enabled:
        push.enabled === undefined ? DEFAULT_CONFIG.push.enabled : Boolean(push.enabled),
      cron: normalizeCron(push.cron, DEFAULT_CONFIG.push.cron),
      include_stats:
        push.include_stats === undefined
          ? DEFAULT_CONFIG.push.include_stats
          : Boolean(push.include_stats),
      include_words:
        push.include_words === undefined
          ? DEFAULT_CONFIG.push.include_words
          : Boolean(push.include_words),
      include_commands:
        push.include_commands === undefined
          ? DEFAULT_CONFIG.push.include_commands
          : Boolean(push.include_commands),
    },
    command_defaults: {
      stats_days: normalizeRangeDays(
        commandDefaults.stats_days,
        DEFAULT_CONFIG.command_defaults.stats_days,
      ),
      words_days: normalizeRangeDays(
        commandDefaults.words_days,
        DEFAULT_CONFIG.command_defaults.words_days,
      ),
      command_days: normalizeRangeDays(
        commandDefaults.command_days,
        DEFAULT_CONFIG.command_defaults.command_days,
      ),
    },
  }
}

export function getQunDailyConfig() {
  return normalizeQunDailyConfig(cfg.getConfig("qun-daily") || {})
}

export function saveQunDailyConfig(raw = {}) {
  const normalized = normalizeQunDailyConfig(raw)
  const current = cfg.getConfig("qun-daily") || {}
  const next = {
    ...current,
    push: {
      ...(current?.push || {}),
      ...normalized.push,
    },
    command_defaults: {
      ...(current?.command_defaults || {}),
      ...normalized.command_defaults,
    },
  }

  if (!isValidCronExpression(next.push.cron)) {
    throw new Error("qun-daily.push.cron must be a valid 6-field cron expression")
  }

  cfg.getConfigReader("qun-daily").setData(next)
  return normalizeQunDailyConfig(next)
}

export function getDefaultRangeDays(kind) {
  const config = getQunDailyConfig()
  if (kind === "stats") return config.command_defaults.stats_days
  if (kind === "words") return config.command_defaults.words_days
  if (kind === "commands") return config.command_defaults.command_days
  return 1
}
