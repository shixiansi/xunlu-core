import fs from "node:fs"
import path from "node:path"

import { DataTypes, Op, Sequelize } from "sequelize"

import env from "../lib/env.js"

let sequelize = null
let CommandUsageLog = null
let indexesEnsured = false
let activeDbPath = ""

function getDataDir() {
  return path.resolve(env.RootPath, "data")
}

function getDbPath() {
  return activeDbPath || path.join(getDataDir(), "command_usage.sqlite")
}

function resolveDbPath() {
  return path.join(getDataDir(), "command_usage.sqlite")
}

function ensureDir() {
  fs.mkdirSync(getDataDir(), { recursive: true })
}

function pad(num) {
  return String(num).padStart(2, "0")
}

function getDateParts(ts = Date.now()) {
  const date = new Date(Number(ts || Date.now()))
  return {
    dateKey: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    hourBucket: date.getHours(),
  }
}

function normalizeCommand(text = "") {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
}

function matchesWhitelistEntry(row, whitelistRegs = []) {
  const patterns = Array.isArray(whitelistRegs) ? whitelistRegs.map(item => String(item || "").trim()).filter(Boolean) : []
  if (!patterns.length) return true

  const regText = String(row?.reg || "").trim()
  const rawCommand = String(row?.raw_command || "").trim()
  const normalized = normalizeCommand(row?.normalized_command || rawCommand)

  return patterns.some(pattern => {
    if (regText && regText === pattern) return true

    try {
      const re = new RegExp(pattern)
      return re.test(rawCommand) || re.test(normalized)
    } catch {
      return false
    }
  })
}

async function initDb() {
  if (CommandUsageLog) return { sequelize, CommandUsageLog }

  ensureDir()
  const dbPath = resolveDbPath()
  if (!sequelize) {
    sequelize = new Sequelize({
      dialect: "sqlite",
      storage: dbPath,
      logging: false,
    })
    activeDbPath = dbPath
    await sequelize.authenticate()
    await applySqlitePragmas(sequelize)
  } else if (activeDbPath && activeDbPath !== dbPath) {
    await close()
    return await initDb()
  }

  CommandUsageLog = sequelize.define(
    "cmd_usage_log",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      group_id: { type: DataTypes.STRING, allowNull: false },
      user_id: { type: DataTypes.STRING, allowNull: false },
      plugin: { type: DataTypes.STRING, allowNull: false },
      reg: { type: DataTypes.TEXT, allowNull: false },
      raw_command: { type: DataTypes.TEXT, allowNull: false },
      normalized_command: { type: DataTypes.TEXT, allowNull: false },
      protocol: { type: DataTypes.STRING, allowNull: false, defaultValue: "" },
      event: { type: DataTypes.STRING, allowNull: false, defaultValue: "message" },
      priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5000 },
      triggered_at: { type: DataTypes.BIGINT, allowNull: false },
      date_key: { type: DataTypes.STRING, allowNull: false },
      hour_bucket: { type: DataTypes.INTEGER, allowNull: false },
      source: { type: DataTypes.STRING, allowNull: false, defaultValue: "xunlu" },
      is_synthetic: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    {
      tableName: "cmd_usage_log",
      timestamps: false,
      indexes: [
        { fields: ["group_id", "date_key"] },
        { fields: ["group_id", "user_id", "date_key"] },
        { fields: ["group_id", "hour_bucket"] },
        { fields: ["group_id", "user_id", "reg"] },
      ],
    },
  )

  await sequelize.sync()
  await ensureIndexes()
  return { sequelize, CommandUsageLog }
}

async function applySqlitePragmas(target) {
  // WAL：写不再阻塞读，消除高频命令写入与统计查询互相 SQLITE_BUSY 的问题；
  // synchronous=NORMAL 在 WAL 下安全且减少 fsync；busy_timeout 兜底并发写等待。
  const pragmas = [
    "PRAGMA journal_mode=WAL",
    "PRAGMA synchronous=NORMAL",
    "PRAGMA busy_timeout=3000",
  ]
  for (const sql of pragmas) {
    try {
      await target.query(sql)
    } catch (err) {
      // WAL 在个别文件系统（如网络盘）上不可用，降级为默认 journal 继续运行
      try {
        globalThis.logger?.warn?.(`[CommandUsageDB] ${sql} 失败，使用默认设置:`, err?.message || err)
      } catch {}
    }
  }
}

async function ensureIndexes() {
  if (!sequelize || indexesEnsured) return

  const statements = [
    "CREATE INDEX IF NOT EXISTS idx_cmd_usage_group_date ON cmd_usage_log (group_id, date_key)",
    "CREATE INDEX IF NOT EXISTS idx_cmd_usage_group_user_date ON cmd_usage_log (group_id, user_id, date_key)",
    "CREATE INDEX IF NOT EXISTS idx_cmd_usage_group_hour ON cmd_usage_log (group_id, hour_bucket)",
    "CREATE INDEX IF NOT EXISTS idx_cmd_usage_group_user_reg ON cmd_usage_log (group_id, user_id, reg)",
    "CREATE INDEX IF NOT EXISTS idx_cmd_usage_hourly_favorite ON cmd_usage_log (group_id, hour_bucket, reg, triggered_at)",
    "CREATE INDEX IF NOT EXISTS idx_cmd_usage_recent_manual ON cmd_usage_log (group_id, user_id, reg, triggered_at)",
  ]

  for (const sql of statements) {
    await sequelize.query(sql)
  }

  indexesEnsured = true
}

// 命令使用量批量写入：命令触发频率高但实时性要求低（统计/排行用），
// 500ms 窗口合并 INSERT，把每命令一次写放大摊薄为一次批量事务。
// 读路径先 flushPendingUsageWrites() 冲刷，保证读回一致性。
const usageWriteQueue = []
const USAGE_FLUSH_INTERVAL_MS = Number(process.env.XUNLU_USAGE_FLUSH_MS) || 500
let usageFlushTimer = null

async function flushPendingUsageWrites() {
  if (usageFlushTimer) {
    clearTimeout(usageFlushTimer)
    usageFlushTimer = null
  }
  if (!usageWriteQueue.length) return 0
  const batch = usageWriteQueue.splice(0, usageWriteQueue.length)
  try {
    await initDb()
    await sequelize.transaction(async t => {
      for (const row of batch) {
        await CommandUsageLog.create(row, { transaction: t })
      }
    })
    return batch.length
  } catch (err) {
    // 批量失败降级为逐条补写，单条坏数据不拖垮整批
    for (const row of batch) {
      await CommandUsageLog.create(row).catch(() => {})
    }
    try {
      globalThis.logger?.warn?.(`[CommandUsageDB] 批量写入失败，已逐条降级: ${err?.message || err}`)
    } catch {}
    return 0
  }
}

function scheduleUsageFlush() {
  if (usageFlushTimer) return
  usageFlushTimer = setTimeout(async () => {
    usageFlushTimer = null
    await flushPendingUsageWrites()
  }, USAGE_FLUSH_INTERVAL_MS)
  // 不阻止进程退出：丢一批统计可接受，不能卡 shutdown
  usageFlushTimer.unref?.()
}

async function recordUsage({
  groupId,
  userId,
  plugin,
  reg,
  rawCommand,
  protocol = "",
  event = "message",
  priority = 5000,
  source = "xunlu",
  triggeredAt = Date.now(),
  isSynthetic = false,
} = {}) {
  const gid = String(groupId || "").trim()
  const uid = String(userId || "").trim()
  const pluginName = String(plugin || "").trim()
  const regText = String(reg || "").trim()
  const raw = String(rawCommand || "").trim()
  if (!gid || !uid || !pluginName || !regText || !raw) return null

  const ts = Number(triggeredAt || Date.now())
  const { dateKey, hourBucket } = getDateParts(ts)

  usageWriteQueue.push({
    group_id: gid,
    user_id: uid,
    plugin: pluginName,
    reg: regText,
    raw_command: raw,
    normalized_command: normalizeCommand(raw),
    protocol: String(protocol || ""),
    event: String(event || "message"),
    priority: Number(priority || 5000),
    triggered_at: ts,
    date_key: dateKey,
    hour_bucket: hourBucket,
    source: String(source || "xunlu"),
    is_synthetic: Boolean(isSynthetic),
  })
  scheduleUsageFlush()
  return { queued: true, queueSize: usageWriteQueue.length }
}

async function listUsage({
  groupId,
  dateKeys = [],
  userId = "",
  sourceExcludes = [],
  includeSynthetic = false,
  limit = 5000,
} = {}) {
  await flushPendingUsageWrites()
  await initDb()

  const where = {}
  if (groupId !== undefined && groupId !== null && String(groupId).trim()) {
    where.group_id = String(groupId).trim()
  }
  if (userId !== undefined && userId !== null && String(userId).trim()) {
    where.user_id = String(userId).trim()
  }
  if (Array.isArray(dateKeys) && dateKeys.length) {
    where.date_key = { [Op.in]: dateKeys.map(item => String(item)) }
  }
  if (!includeSynthetic) {
    where.is_synthetic = false
  }
  if (Array.isArray(sourceExcludes) && sourceExcludes.length) {
    where.source = { [Op.notIn]: sourceExcludes.map(item => String(item)) }
  }

  const safeLimit = Math.floor(Number(limit) || 0)
  const rows = await CommandUsageLog.findAll({
    where,
    order: [["triggered_at", "ASC"]],
    ...(safeLimit > 0 ? { limit: Math.max(1, Math.min(50000, safeLimit)) } : {}),
  })
  return rows.map(row => row.toJSON())
}

async function getHourlyFavoriteCommands({
  groupId,
  hourBucket,
  whitelistRegs = [],
  historyDays = 14,
  minCount = 2,
} = {}) {
  await flushPendingUsageWrites()
  await initDb()

  const gid = String(groupId || "").trim()
  const bucket = Number(hourBucket)
  if (!gid || !Number.isFinite(bucket)) return []

  const since = Date.now() - Math.max(1, Math.floor(Number(historyDays) || 14)) * 24 * 3600 * 1000
  const where = {
    group_id: gid,
    hour_bucket: Math.floor(bucket),
    triggered_at: { [Op.gte]: since },
    is_synthetic: false,
    source: { [Op.notIn]: ["proactive-command"] },
  }

  const rows = await CommandUsageLog.findAll({
    attributes: [
      "group_id",
      "user_id",
      "reg",
      "raw_command",
      "normalized_command",
      "plugin",
      "protocol",
      [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      [sequelize.fn("MAX", sequelize.col("triggered_at")), "last_triggered_at"],
    ],
    where,
    group: ["group_id", "user_id", "reg", "raw_command", "normalized_command", "plugin", "protocol"],
    having: sequelize.literal(`COUNT(id) >= ${Math.max(1, Math.floor(Number(minCount) || 2))}`),
    order: [[sequelize.literal("count"), "DESC"], [sequelize.literal("last_triggered_at"), "DESC"]],
    limit: 500,
  })

  return rows
    .map(row => row.toJSON())
    .filter(row => matchesWhitelistEntry(row, whitelistRegs))
}

async function hasRecentManualUsage({ groupId, userId, reg, sinceMs = 0 } = {}) {
  await flushPendingUsageWrites()
  await initDb()
  const gid = String(groupId || "").trim()
  const uid = String(userId || "").trim()
  const regText = String(reg || "").trim()
  const since = Number(sinceMs || 0)
  if (!gid || !uid || !regText || !since) return false

  const count = await CommandUsageLog.count({
    where: {
      group_id: gid,
      user_id: uid,
      reg: regText,
      triggered_at: { [Op.gte]: since },
      is_synthetic: false,
      source: { [Op.notIn]: ["proactive-command"] },
    },
  })
  return Number(count || 0) > 0
}

async function close() {
  // 关库前冲刷待写入的使用量队列，避免丢数据
  await flushPendingUsageWrites().catch(() => {})
  CommandUsageLog = null
  indexesEnsured = false
  activeDbPath = ""
  const db = sequelize
  sequelize = null
  if (db && typeof db.close === "function") {
    await db.close().catch(() => {})
  }
}

export {
  close,
  flushPendingUsageWrites,
  getDateParts,
  getDbPath,
  getHourlyFavoriteCommands,
  hasRecentManualUsage,
  initDb,
  listUsage,
  normalizeCommand,
  recordUsage,
}

export default {
  close,
  getDbPath,
  initDb,
  recordUsage,
  listUsage,
  getHourlyFavoriteCommands,
  hasRecentManualUsage,
  normalizeCommand,
  getDateParts,
}
