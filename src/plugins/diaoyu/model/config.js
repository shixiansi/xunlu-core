import cfg from "../../../lib/config.js"

const DEFAULT_CONFIG = Object.freeze({
  bootstrap: {
    starting_coins: 200,
    starting_rod_level: 1,
    starting_bait: 5,
    starting_advanced_bait: 0,
  },
  sign: {
    base_coins: 120,
    streak_bonus_coins: 15,
    base_bait: 3,
    bait_bonus_every_streak: 3,
    advanced_bait_every_streak: 7,
  },
})

function normalizeInt(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.max(min, Math.min(max, Math.floor(num)))
}

export function normalizeDiaoyuConfig(raw = {}) {
  const config = raw && typeof raw === "object" ? raw : {}
  const bootstrap = config.bootstrap && typeof config.bootstrap === "object" ? config.bootstrap : {}
  const sign = config.sign && typeof config.sign === "object" ? config.sign : {}

  return {
    bootstrap: {
      starting_coins: normalizeInt(
        bootstrap.starting_coins,
        DEFAULT_CONFIG.bootstrap.starting_coins,
        { min: 0, max: 999999999 },
      ),
      starting_rod_level: normalizeInt(
        bootstrap.starting_rod_level,
        DEFAULT_CONFIG.bootstrap.starting_rod_level,
        { min: 1, max: 99 },
      ),
      starting_bait: normalizeInt(
        bootstrap.starting_bait,
        DEFAULT_CONFIG.bootstrap.starting_bait,
        { min: 0, max: 999999 },
      ),
      starting_advanced_bait: normalizeInt(
        bootstrap.starting_advanced_bait,
        DEFAULT_CONFIG.bootstrap.starting_advanced_bait,
        { min: 0, max: 999999 },
      ),
    },
    sign: {
      base_coins: normalizeInt(sign.base_coins, DEFAULT_CONFIG.sign.base_coins, {
        min: 0,
        max: 999999999,
      }),
      streak_bonus_coins: normalizeInt(
        sign.streak_bonus_coins,
        DEFAULT_CONFIG.sign.streak_bonus_coins,
        { min: 0, max: 999999999 },
      ),
      base_bait: normalizeInt(sign.base_bait, DEFAULT_CONFIG.sign.base_bait, {
        min: 0,
        max: 999999,
      }),
      bait_bonus_every_streak: normalizeInt(
        sign.bait_bonus_every_streak,
        DEFAULT_CONFIG.sign.bait_bonus_every_streak,
        { min: 1, max: 999999 },
      ),
      advanced_bait_every_streak: normalizeInt(
        sign.advanced_bait_every_streak,
        DEFAULT_CONFIG.sign.advanced_bait_every_streak,
        { min: 1, max: 999999 },
      ),
    },
  }
}

export function getDiaoyuConfig() {
  return normalizeDiaoyuConfig(cfg.getConfig("diaoyu") || {})
}

export function saveDiaoyuConfig(raw = {}) {
  const normalized = normalizeDiaoyuConfig(raw)
  const current = cfg.getConfig("diaoyu") || {}
  const next = {
    ...current,
    bootstrap: {
      ...(current?.bootstrap || {}),
      ...normalized.bootstrap,
    },
    sign: {
      ...(current?.sign || {}),
      ...normalized.sign,
    },
  }

  cfg.getConfigReader("diaoyu").setData(next)
  return normalizeDiaoyuConfig(next)
}

export function getNewUserDefaults() {
  const config = getDiaoyuConfig()
  return {
    coins: config.bootstrap.starting_coins,
    rodLevel: config.bootstrap.starting_rod_level,
    items: {
      bait: config.bootstrap.starting_bait,
      bait_adv: config.bootstrap.starting_advanced_bait,
    },
  }
}

export function getSignRewards(streak) {
  const config = getDiaoyuConfig()
  const safeStreak = normalizeInt(streak, 1, { min: 1, max: 999999 })
  const bonusSteps = Math.floor(safeStreak / config.sign.bait_bonus_every_streak)

  return {
    coins: config.sign.base_coins + safeStreak * config.sign.streak_bonus_coins,
    bait: config.sign.base_bait + bonusSteps,
    adv: safeStreak % config.sign.advanced_bait_every_streak === 0 ? 1 : 0,
  }
}
