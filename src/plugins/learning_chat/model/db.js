import fs from "node:fs"
import path from "node:path"

import { Sequelize, DataTypes, Op } from "sequelize"

import env from "../../../lib/env.js"

const DATA_DIR = path.resolve(env.RootPath, "data", "learning_chat")
const DB_PATH = path.join(DATA_DIR, "learning_chat.sqlite")

let sequelize = null
let models = null

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

export function getDbPath() {
  return DB_PATH
}

export async function initDb() {
  if (models) return models
  ensureDir()

  if (!sequelize) {
    sequelize = new Sequelize({
      dialect: "sqlite",
      storage: DB_PATH,
      logging: false,
    })
    await sequelize.authenticate()
  }

  const Signature = sequelize.define(
    "lc_signature",
    {
      hash: { type: DataTypes.STRING, primaryKey: true },
      sig: { type: DataTypes.TEXT, unique: true },
      preview: { type: DataTypes.TEXT },
      segments: { type: DataTypes.TEXT },
      updated_at: { type: DataTypes.BIGINT },
    },
    { tableName: "lc_signature", timestamps: false },
  )

  const Transition = sequelize.define(
    "lc_transition",
    {
      group_id: { type: DataTypes.STRING, primaryKey: true },
      from_hash: { type: DataTypes.STRING, primaryKey: true },
      to_hash: { type: DataTypes.STRING, primaryKey: true },
      count: { type: DataTypes.INTEGER, defaultValue: 0 },
      updated_at: { type: DataTypes.BIGINT },
    },
    {
      tableName: "lc_transition",
      timestamps: false,
      indexes: [{ fields: ["group_id", "from_hash"] }],
    },
  )

  const BanReply = sequelize.define(
    "lc_ban_reply",
    {
      group_id: { type: DataTypes.STRING, primaryKey: true },
      reply_hash: { type: DataTypes.STRING, primaryKey: true },
      created_at: { type: DataTypes.BIGINT },
    },
    { tableName: "lc_ban_reply", timestamps: false },
  )

  const GroupState = sequelize.define(
    "lc_group_state",
    {
      group_id: { type: DataTypes.STRING, primaryKey: true },
      last_auto_reply_at: { type: DataTypes.BIGINT, defaultValue: 0 },
      last_proactive_at: { type: DataTypes.BIGINT, defaultValue: 0 },
      last_repeat_at: { type: DataTypes.BIGINT, defaultValue: 0 },
    },
    { tableName: "lc_group_state", timestamps: false },
  )

  const ProactiveState = sequelize.define(
    "lc_proactive_state",
    {
      group_id: { type: DataTypes.STRING, primaryKey: true },
      attempts_no_reply: { type: DataTypes.INTEGER, defaultValue: 0 },
      last_sent_at: { type: DataTypes.BIGINT, defaultValue: 0 },
      updated_at: { type: DataTypes.BIGINT, defaultValue: 0 },
    },
    { tableName: "lc_proactive_state", timestamps: false },
  )

  const ProactiveCommandState = sequelize.define(
    "lc_proactive_command_state",
    {
      group_id: { type: DataTypes.STRING, primaryKey: true },
      user_id: { type: DataTypes.STRING, primaryKey: true },
      last_triggered_at: { type: DataTypes.BIGINT, defaultValue: 0 },
      last_triggered_reg: { type: DataTypes.TEXT, defaultValue: "" },
      last_triggered_date_key: { type: DataTypes.STRING, defaultValue: "" },
      daily_trigger_count: { type: DataTypes.INTEGER, defaultValue: 0 },
      updated_at: { type: DataTypes.BIGINT, defaultValue: 0 },
    },
    { tableName: "lc_proactive_command_state", timestamps: false },
  )

  await sequelize.sync()

  models = { sequelize, Signature, Transition, BanReply, GroupState, ProactiveState, ProactiveCommandState }
  return models
}

export async function upsertSignature({ hash, sig, preview, segments }) {
  const { Signature } = await initDb()
  const now = Date.now()
  await Signature.upsert({
    hash: String(hash),
    sig: String(sig),
    preview: String(preview || ""),
    segments: typeof segments === "string" ? segments : JSON.stringify(segments ?? []),
    updated_at: now,
  })
  return true
}

export async function getSignature(hash) {
  const { Signature } = await initDb()
  const rec = await Signature.findByPk(String(hash))
  return rec ? rec.toJSON() : null
}

export async function getSignaturesMap(hashes = []) {
  const { Signature } = await initDb()
  const list = Array.isArray(hashes) ? hashes.map(h => String(h)).filter(Boolean) : []
  if (!list.length) return new Map()

  const rows = await Signature.findAll({
    where: { hash: { [Op.in]: list } },
  })

  const map = new Map()
  for (const r of rows) {
    const j = r.toJSON()
    map.set(String(j.hash), j)
  }
  return map
}

export async function incrementTransition({ groupId, fromHash, toHash, maxCount = 6 }) {
  const { Transition } = await initDb()
  const gid = String(groupId || "")
  const from_hash = String(fromHash || "")
  const to_hash = String(toHash || "")
  if (!gid || !from_hash || !to_hash) return 0

  const now = Date.now()
  const existing = await Transition.findOne({ where: { group_id: gid, from_hash, to_hash } })
  if (!existing) {
    await Transition.create({ group_id: gid, from_hash, to_hash, count: 1, updated_at: now })
    return 1
  }

  const prev = Number(existing.count) || 0
  const next = Math.min(Math.max(1, Math.floor(Number(maxCount) || 1)), prev + 1)
  existing.count = next
  existing.updated_at = now
  await existing.save()
  return next
}

export async function listLocalCandidates({ groupId, fromHash, minCount }) {
  const { Transition } = await initDb()
  const gid = String(groupId || "")
  const from_hash = String(fromHash || "")
  const threshold = Math.max(1, Math.floor(Number(minCount) || 1))
  if (!gid || !from_hash) return []

  const list = await Transition.findAll({
    where: {
      group_id: gid,
      from_hash,
      count: { [Op.gte]: threshold },
    },
    order: [["count", "DESC"]],
    limit: 50,
  })
  return list.map(r => r.toJSON())
}

export async function listGlobalCandidates({ fromHash, minCount, minGroups }) {
  const { sequelize } = await initDb()
  const from_hash = String(fromHash || "")
  if (!from_hash) return []
  const threshold = Math.max(1, Math.floor(Number(minCount) || 1))
  const groups = Math.max(1, Math.floor(Number(minGroups) || 1))

  const [rows] = await sequelize.query(
    `
      SELECT
        to_hash as to_hash,
        COUNT(DISTINCT group_id) as groups,
        SUM(count) as totalCount
      FROM lc_transition
      WHERE from_hash = :from_hash AND count >= :threshold
      GROUP BY to_hash
      HAVING COUNT(DISTINCT group_id) >= :groups
      ORDER BY totalCount DESC
      LIMIT 50
    `,
    { replacements: { from_hash, threshold, groups } },
  )

  return Array.isArray(rows) ? rows : []
}

export async function getGroupState(groupId) {
  const { GroupState } = await initDb()
  const gid = String(groupId || "")
  if (!gid) return null
  const rec = await GroupState.findByPk(gid)
  if (rec) return rec.toJSON()
  const created = await GroupState.create({ group_id: gid, last_auto_reply_at: 0, last_proactive_at: 0, last_repeat_at: 0 })
  return created.toJSON()
}

export async function setGroupState(groupId, patch = {}) {
  const { GroupState } = await initDb()
  const gid = String(groupId || "")
  if (!gid) return null

  const rec = await GroupState.findByPk(gid)
  const data = {
    group_id: gid,
    last_auto_reply_at: Number(patch.last_auto_reply_at ?? rec?.last_auto_reply_at ?? 0) || 0,
    last_proactive_at: Number(patch.last_proactive_at ?? rec?.last_proactive_at ?? 0) || 0,
    last_repeat_at: Number(patch.last_repeat_at ?? rec?.last_repeat_at ?? 0) || 0,
  }

  await GroupState.upsert(data)
  const out = await GroupState.findByPk(gid)
  return out ? out.toJSON() : data
}

export async function getProactiveState(groupId) {
  const { ProactiveState } = await initDb()
  const gid = String(groupId || "")
  if (!gid) return null
  const rec = await ProactiveState.findByPk(gid)
  if (rec) return rec.toJSON()
  const created = await ProactiveState.create({ group_id: gid, attempts_no_reply: 0, last_sent_at: 0, updated_at: Date.now() })
  return created.toJSON()
}

export async function setProactiveState(groupId, patch = {}) {
  const { ProactiveState } = await initDb()
  const gid = String(groupId || "")
  if (!gid) return null

  const rec = await ProactiveState.findByPk(gid)
  const data = {
    group_id: gid,
    attempts_no_reply: Math.max(0, Math.floor(Number(patch.attempts_no_reply ?? rec?.attempts_no_reply ?? 0) || 0)),
    last_sent_at: Number(patch.last_sent_at ?? rec?.last_sent_at ?? 0) || 0,
    updated_at: Number(patch.updated_at ?? Date.now()) || Date.now(),
  }

  await ProactiveState.upsert(data)
  const out = await ProactiveState.findByPk(gid)
  return out ? out.toJSON() : data
}

export async function getProactiveCommandState(groupId, userId) {
  const { ProactiveCommandState } = await initDb()
  const gid = String(groupId || "")
  const uid = String(userId || "")
  if (!gid || !uid) return null
  const rec = await ProactiveCommandState.findOne({ where: { group_id: gid, user_id: uid } })
  if (rec) return rec.toJSON()
  const created = await ProactiveCommandState.create({
    group_id: gid,
    user_id: uid,
    last_triggered_at: 0,
    last_triggered_reg: "",
    last_triggered_date_key: "",
    daily_trigger_count: 0,
    updated_at: Date.now(),
  })
  return created.toJSON()
}

export async function setProactiveCommandState(groupId, userId, patch = {}) {
  const { ProactiveCommandState } = await initDb()
  const gid = String(groupId || "")
  const uid = String(userId || "")
  if (!gid || !uid) return null

  const rec = await ProactiveCommandState.findOne({ where: { group_id: gid, user_id: uid } })
  const data = {
    group_id: gid,
    user_id: uid,
    last_triggered_at: Number(patch.last_triggered_at ?? rec?.last_triggered_at ?? 0) || 0,
    last_triggered_reg: String(patch.last_triggered_reg ?? rec?.last_triggered_reg ?? ""),
    last_triggered_date_key: String(patch.last_triggered_date_key ?? rec?.last_triggered_date_key ?? ""),
    daily_trigger_count: Math.max(0, Math.floor(Number(patch.daily_trigger_count ?? rec?.daily_trigger_count ?? 0) || 0)),
    updated_at: Number(patch.updated_at ?? Date.now()) || Date.now(),
  }

  await ProactiveCommandState.upsert(data)
  const out = await ProactiveCommandState.findOne({ where: { group_id: gid, user_id: uid } })
  return out ? out.toJSON() : data
}

export async function isBannedReply(groupId, replyHash) {
  const { BanReply } = await initDb()
  const gid = String(groupId || "")
  const h = String(replyHash || "")
  if (!gid || !h) return false
  const rec = await BanReply.findOne({ where: { group_id: gid, reply_hash: h } })
  return Boolean(rec)
}

export async function banReply(groupId, replyHash) {
  const { BanReply } = await initDb()
  const gid = String(groupId || "")
  const h = String(replyHash || "")
  if (!gid || !h) return false
  await BanReply.upsert({ group_id: gid, reply_hash: h, created_at: Date.now() })
  return true
}

export async function unbanReply(groupId, replyHash) {
  const { BanReply } = await initDb()
  const gid = String(groupId || "")
  const h = String(replyHash || "")
  if (!gid || !h) return false
  await BanReply.destroy({ where: { group_id: gid, reply_hash: h } })
  return true
}

export async function listBans(groupId, { limit = 200 } = {}) {
  const { BanReply } = await initDb()
  const gid = String(groupId || "")
  if (!gid) return []
  const rows = await BanReply.findAll({
    where: { group_id: gid },
    order: [["created_at", "DESC"]],
    limit: Math.max(1, Math.min(1000, Math.floor(Number(limit) || 200))),
  })
  return rows.map(r => r.toJSON())
}

export async function listLearnedTransitions(groupId, { fromHash, limit = 50, offset = 0 } = {}) {
  const { Transition } = await initDb()
  const gid = String(groupId || "")
  if (!gid) return []

  const where = { group_id: gid }
  if (fromHash) where.from_hash = String(fromHash)

  const rows = await Transition.findAll({
    where,
    order: [["count", "DESC"]],
    limit: Math.max(1, Math.min(200, Math.floor(Number(limit) || 50))),
    offset: Math.max(0, Math.floor(Number(offset) || 0)),
  })
  return rows.map(r => r.toJSON())
}

export async function listTrackedLearningGroupIds() {
  const { Transition, BanReply, GroupState, ProactiveState, ProactiveCommandState } = await initDb()
  const ids = new Set()

  const collectIds = rows => {
    for (const row of Array.isArray(rows) ? rows : []) {
      const gid = String(row?.group_id || "").trim()
      if (gid) ids.add(gid)
    }
  }

  collectIds((await Transition.findAll({ attributes: ["group_id"], group: ["group_id"] })).map(r => r.toJSON()))
  collectIds((await BanReply.findAll({ attributes: ["group_id"], group: ["group_id"] })).map(r => r.toJSON()))
  collectIds((await GroupState.findAll({ attributes: ["group_id"] })).map(r => r.toJSON()))
  collectIds((await ProactiveState.findAll({ attributes: ["group_id"] })).map(r => r.toJSON()))
  collectIds(
    (await ProactiveCommandState.findAll({ attributes: ["group_id"], group: ["group_id"] })).map(r =>
      r.toJSON(),
    ),
  )

  return Array.from(ids).sort((a, b) => a.localeCompare(b))
}

export async function clearGroupScopedLearningData(groupId) {
  const { Transition, BanReply, GroupState, ProactiveState, ProactiveCommandState } = await initDb()
  const gid = String(groupId || "").trim()
  if (!gid) {
    return {
      group_id: "",
      transitions: 0,
      bans: 0,
      groupState: 0,
      proactiveState: 0,
      proactiveCommandState: 0,
    }
  }

  const [transitions, bans, groupState, proactiveState, proactiveCommandState] = await Promise.all([
    Transition.destroy({ where: { group_id: gid } }),
    BanReply.destroy({ where: { group_id: gid } }),
    GroupState.destroy({ where: { group_id: gid } }),
    ProactiveState.destroy({ where: { group_id: gid } }),
    ProactiveCommandState.destroy({ where: { group_id: gid } }),
  ])

  return {
    group_id: gid,
    transitions: Number(transitions || 0),
    bans: Number(bans || 0),
    groupState: Number(groupState || 0),
    proactiveState: Number(proactiveState || 0),
    proactiveCommandState: Number(proactiveCommandState || 0),
  }
}
