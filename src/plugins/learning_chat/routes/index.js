import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import express from "express"
import { Op } from "sequelize"

import MessageDB from "../../../db/MessageDB.js"

import {
  createAuthToken,
  getConfig,
  getEffectiveGroupConfig,
  getSafeConfig,
  updateAuth,
  updateGlobalConfig,
  verifyAuthToken,
  verifyPassword,
  setGroupOverrides,
} from "../model/config.js"
import {
  banReply,
  getSignaturesMap,
  initDb,
  listBans,
  listLearnedTransitions,
  unbanReply,
} from "../model/db.js"
import { buildSignature } from "../utils/signature.js"
import { rawToLearningSegments } from "../utils/convert.js"
import { getHeatSnapshot, getRuntimeProtocolHint, invalidateBanCache } from "../controllers/handlers.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const WEBUI_DIR = path.join(__dirname, "..", "resources", "webui")

function exists(filePath) {
  try {
    return fs.existsSync(filePath)
  } catch {
    return false
  }
}

function toInt(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.floor(n) : fallback
}

function parseCookies(header) {
  const out = {}
  const raw = String(header || "")
  if (!raw) return out
  const parts = raw.split(";")
  for (const part of parts) {
    const idx = part.indexOf("=")
    if (idx <= 0) continue
    const k = part.slice(0, idx).trim()
    const v = part.slice(idx + 1).trim()
    if (!k) continue
    out[k] = decodeURIComponent(v)
  }
  return out
}

function setCookie(res, { name, value, maxAgeSec, httpOnly = true } = {}) {
  const parts = [`${name}=${encodeURIComponent(String(value || ""))}`, "Path=/", "SameSite=Lax"]
  if (httpOnly) parts.push("HttpOnly")
  if (typeof maxAgeSec === "number") parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSec))}`)
  res.setHeader("Set-Cookie", parts.join("; "))
}

function requireAuth(req, res, next) {
  const cookies = parseCookies(req.headers.cookie)
  const token = cookies.lc_token || ""
  const info = verifyAuthToken(token)
  const cfg = getConfig()
  if (!info || info.username !== cfg?.auth?.username) {
    res.status(401).json({ ok: false, error: "Unauthorized" })
    return
  }
  req.user = info
  next()
}

function renderPreviewFromRecord(record) {
  const rawSegments = record?.message
  if (!rawSegments) return ""

  const segments = rawToLearningSegments(rawSegments, {
    protocolHints: [getRuntimeProtocolHint()],
  })
  if (!segments.length) return ""
  const info = buildSignature(segments)
  return info.preview || ""
}

export function createRouter() {
  const router = express.Router()
  router.use(express.json({ limit: "2mb" }))

  void initDb().catch(() => {})

  router.get("/health", (req, res) => res.json({ ok: true, plugin: "learning_chat" }))

  // static files
  if (exists(WEBUI_DIR)) {
    router.use("/static", express.static(WEBUI_DIR, { index: false, fallthrough: true }))
  }

  router.get("/login", (req, res) => {
    const file = path.join(WEBUI_DIR, "login.html")
    if (!exists(file)) return res.status(500).send("login.html missing")
    return res.sendFile(file)
  })

  router.get("/admin", requireAuth, (req, res) => {
    const file = path.join(WEBUI_DIR, "admin.html")
    if (!exists(file)) return res.status(500).send("admin.html missing")
    return res.sendFile(file)
  })

  // auth
  router.post("/api/login", (req, res) => {
    const cfg = getConfig()
    const username = String(req.body?.username || "").trim()
    const password = String(req.body?.password || "")
    if (!username || !password) return res.status(400).json({ ok: false, error: "Missing username/password" })
    if (username !== String(cfg?.auth?.username || "")) return res.status(401).json({ ok: false, error: "Invalid credentials" })
    if (!verifyPassword(password)) return res.status(401).json({ ok: false, error: "Invalid credentials" })

    const token = createAuthToken(username)
    const ttlHours = Number(cfg?.auth?.token_ttl_hours || 168) || 168
    setCookie(res, { name: "lc_token", value: token, maxAgeSec: Math.max(1, ttlHours) * 3600 })
    return res.json({ ok: true })
  })

  router.post("/api/logout", (req, res) => {
    setCookie(res, { name: "lc_token", value: "", maxAgeSec: 0 })
    res.json({ ok: true })
  })

  router.get("/api/config", requireAuth, (req, res) => {
    const safe = getSafeConfig()
    const groupId = req.query?.group_id ? String(req.query.group_id) : ""
    const effective = groupId ? getEffectiveGroupConfig(groupId) : undefined
    res.json({ ok: true, config: safe, effective })
  })

  router.post("/api/config", requireAuth, async (req, res) => {
    const groupId = req.body?.group_id ? String(req.body.group_id) : ""
    const patch = req.body?.patch && typeof req.body.patch === "object" ? req.body.patch : {}

    try {
      if (groupId) {
        await setGroupOverrides(groupId, patch)
      } else {
        await updateGlobalConfig(patch)
      }
      res.json({ ok: true, config: getSafeConfig() })
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message || String(err) })
    }
  })

  router.post("/api/auth/update", requireAuth, async (req, res) => {
    const username = req.body?.username
    const password = req.body?.password
    const rotate_token_secret = Boolean(req.body?.rotate_token_secret)
    try {
      await updateAuth({ username, password, rotate_token_secret })
      // rotating secret invalidates existing cookies; client should re-login
      res.json({ ok: true, config: getSafeConfig(), rotated: rotate_token_secret })
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message || String(err) })
    }
  })

  // groups list
  router.get("/api/groups", requireAuth, async (req, res) => {
    const cfg = getConfig()
    const heats = getHeatSnapshot()
    const heatMap = new Map(heats.map(h => [String(h.group_id), h]))

    const ids = new Set([
      ...Object.keys(cfg?.groups || {}),
      ...heats.map(h => String(h.group_id)),
    ])

    const groups = []
    for (const gid of Array.from(ids)) {
      if (!gid) continue
      const effective = getEffectiveGroupConfig(gid)
      const override =
        (cfg?.groups && typeof cfg.groups === "object" && cfg.groups[gid] && typeof cfg.groups[gid] === "object")
          ? cfg.groups[gid]
          : {}
      const heat = heatMap.get(gid) || null
      groups.push({
        group_id: gid,
        effective,
        override,
        heat,
      })
    }
    groups.sort((a, b) => String(a.group_id).localeCompare(String(b.group_id)))
    res.json({ ok: true, groups })
  })

  // group messages (paged by before message_id -> before time)
  router.get("/api/groups/:gid/messages", requireAuth, async (req, res) => {
    const gid = String(req.params.gid || "")
    if (!gid) return res.status(400).json({ ok: false, error: "Missing group_id" })

    const limit = Math.max(1, Math.min(200, toInt(req.query?.limit, 50)))
    const beforeId = req.query?.before ? String(req.query.before) : ""

    try {
      let beforeTime = null
      if (beforeId) {
        const beforeRec = await MessageDB.getMessageById(gid, beforeId).catch(() => null)
        beforeTime = beforeRec?.time ?? null
      }

      const table = await MessageDB.getGroupTable(gid)
      const where = beforeTime ? { time: { [Op.lt]: beforeTime } } : {}
      const rows = await table.findAll({
        where,
        order: [["time", "DESC"]],
        limit,
      })

      const items = rows.map(r => {
        const v = r?.dataValues ?? r
        return {
          message_id: v?.message_id,
          user_id: v?.user_id,
          time: v?.time,
          preview: renderPreviewFromRecord(v),
        }
      })

      res.json({ ok: true, items })
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message || String(err) })
    }
  })

  // learned transitions
  router.get("/api/groups/:gid/learned", requireAuth, async (req, res) => {
    const gid = String(req.params.gid || "")
    if (!gid) return res.status(400).json({ ok: false, error: "Missing group_id" })

    const from_hash = req.query?.from_hash ? String(req.query.from_hash) : ""
    const limit = Math.max(1, Math.min(200, toInt(req.query?.limit, 50)))
    const offset = Math.max(0, toInt(req.query?.offset, 0))

    try {
      const rows = await listLearnedTransitions(gid, { fromHash: from_hash || undefined, limit, offset })

      const hashes = new Set()
      for (const r of rows) {
        if (r?.from_hash) hashes.add(String(r.from_hash))
        if (r?.to_hash) hashes.add(String(r.to_hash))
      }
      const sigMap = await getSignaturesMap(Array.from(hashes))

      const items = rows.map(r => {
        const fromRec = sigMap.get(String(r.from_hash))
        const toRec = sigMap.get(String(r.to_hash))
        return {
          group_id: String(r.group_id),
          from_hash: String(r.from_hash),
          to_hash: String(r.to_hash),
          count: Number(r.count) || 0,
          from_preview: fromRec?.preview || "",
          to_preview: toRec?.preview || "",
        }
      })

      res.json({ ok: true, items })
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message || String(err) })
    }
  })

  // bans
  router.get("/api/groups/:gid/bans", requireAuth, async (req, res) => {
    const gid = String(req.params.gid || "")
    if (!gid) return res.status(400).json({ ok: false, error: "Missing group_id" })
    try {
      const rows = await listBans(gid, { limit: 500 })
      const sigMap = await getSignaturesMap(rows.map(r => r.reply_hash))
      const items = rows.map(r => {
        const sig = sigMap.get(String(r.reply_hash))
        return {
          group_id: String(r.group_id),
          reply_hash: String(r.reply_hash),
          created_at: Number(r.created_at) || 0,
          preview: sig?.preview || "",
        }
      })
      res.json({ ok: true, items })
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message || String(err) })
    }
  })

  router.post("/api/groups/:gid/ban", requireAuth, async (req, res) => {
    const gid = String(req.params.gid || "")
    const reply_hash = String(req.body?.reply_hash || "").trim()
    if (!gid || !reply_hash) return res.status(400).json({ ok: false, error: "Missing group_id/reply_hash" })
    try {
      await banReply(gid, reply_hash)
      invalidateBanCache(gid)
      res.json({ ok: true })
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message || String(err) })
    }
  })

  router.post("/api/groups/:gid/unban", requireAuth, async (req, res) => {
    const gid = String(req.params.gid || "")
    const reply_hash = String(req.body?.reply_hash || "").trim()
    if (!gid || !reply_hash) return res.status(400).json({ ok: false, error: "Missing group_id/reply_hash" })
    try {
      await unbanReply(gid, reply_hash)
      invalidateBanCache(gid)
      res.json({ ok: true })
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message || String(err) })
    }
  })

  return router
}
