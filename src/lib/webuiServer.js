import fs from "node:fs"
import path from "node:path"

import express from "express"

import cfg from "./config.js"
import env from "./env.js"
import { loadPlugins } from "./pluginLoader.js"
import {
  clearWebuiCookie,
  createWebuiAuthToken,
  getSafeWebuiConfig,
  getWebuiConfig,
  getWebuiSessionFromRequest,
  requireWebuiAuth,
  setWebuiCookie,
  updateWebuiAuth,
  verifyWebuiPassword,
} from "./webui/auth.js"
import { createWebUiRegistry } from "./webui/registry.js"

const WEBUI_STATIC_DIR = path.join(env.RootPath, "src", "resources", "webui")

let app = null
let server = null

function getLogger() {
  const lg = globalThis.logger
  if (lg && typeof lg === "object") return lg
  return {
    info: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug ? console.debug.bind(console) : console.log.bind(console),
  }
}

function exists(filePath) {
  try {
    return fs.existsSync(filePath)
  } catch {
    return false
  }
}

function toPort(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

function sendPage(res, fileName) {
  const target = path.join(WEBUI_STATIC_DIR, fileName)
  if (!exists(target)) {
    res.status(500).send(`missing file: ${fileName}`)
    return
  }
  res.sendFile(target)
}

function normalizePayload(result) {
  if (!result || typeof result !== "object") return { values: {} }
  return {
    values: result.values && typeof result.values === "object" ? result.values : {},
    meta: result.meta && typeof result.meta === "object" ? result.meta : {},
    message: result.message ? String(result.message) : "",
  }
}

export async function startWebuiServer() {
  if (server) return { app, server }

  const logger = getLogger()
  const botCfg = cfg.getConfig("bot") || {}

  const enable = botCfg.webui_enable !== false && process.env.XUNLU_WEBUI_DISABLE !== "1"
  if (!enable) return null

  const host = String(process.env.XUNLU_WEBUI_HOST || botCfg.webui_host || "0.0.0.0")
  const port = toPort(process.env.XUNLU_WEBUI_PORT || botCfg.webui_port, 3000)

  const pluginsDir = path.join(env.RootPath, "src", "plugins")
  const plugins = await loadPlugins(pluginsDir)
  const registry = await createWebUiRegistry(plugins)

  app = express()
  app.disable("x-powered-by")
  app.use(express.json({ limit: "2mb" }))

  app.get("/health", (req, res) => res.json({ ok: true, name: "xunlu-webui", pid: process.pid }))
  app.get("/", (req, res) => res.redirect("/webui"))

  app.use("/webui/static", express.static(WEBUI_STATIC_DIR, { index: false, fallthrough: true }))
  registry.mount(app, { requireAuth: requireWebuiAuth })

  app.get("/webui", (req, res) => sendPage(res, "index.html"))
  app.get("/webui/login", (req, res) => sendPage(res, "login.html"))

  app.get("/webui/api/auth/session", (req, res) => {
    const safe = getSafeWebuiConfig()
    const username = String(getWebuiConfig()?.auth?.username || "admin")
    const info = getWebuiSessionFromRequest(req)
    const currentUser = info && info.username === username ? info : null
    res.json({
      ok: true,
      authenticated: Boolean(currentUser),
      user: currentUser ? { username: currentUser.username, exp: currentUser.exp } : null,
      config: safe,
    })
  })

  app.post("/webui/api/auth/login", (req, res) => {
    const cfgSafe = getSafeWebuiConfig()
    const cfgRaw = getWebuiConfig()
    const username = String(req.body?.username || "").trim()
    const password = String(req.body?.password || "")

    if (!username || !password) {
      res.status(400).json({ ok: false, error: "Missing username/password", config: cfgSafe })
      return
    }

    if (username !== String(cfgRaw?.auth?.username || "")) {
      res.status(401).json({ ok: false, error: "Invalid credentials", config: cfgSafe })
      return
    }

    if (!verifyWebuiPassword(password)) {
      res.status(401).json({ ok: false, error: "Invalid credentials", config: cfgSafe })
      return
    }

    const token = createWebuiAuthToken(username)
    const ttlHours = Number(cfgRaw?.auth?.token_ttl_hours || 168) || 168
    setWebuiCookie(res, { value: token, maxAgeSec: Math.max(1, ttlHours) * 3600 })
    res.json({ ok: true, config: cfgSafe })
  })

  app.post("/webui/api/auth/logout", (req, res) => {
    clearWebuiCookie(res)
    res.json({ ok: true })
  })

  app.post("/webui/api/auth/update", requireWebuiAuth, async (req, res) => {
    try {
      const next = await updateWebuiAuth({
        username: req.body?.username,
        password: req.body?.password,
        rotate_token_secret: Boolean(req.body?.rotate_token_secret),
        title: req.body?.title,
      })
      if (req.body?.rotate_token_secret) clearWebuiCookie(res)
      res.json({
        ok: true,
        config: next,
        rotated: Boolean(req.body?.rotate_token_secret),
      })
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message || String(err) })
    }
  })

  app.get("/webui/api/plugins", requireWebuiAuth, async (req, res) => {
    try {
      res.json({ ok: true, plugins: registry.list() })
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message || String(err) })
    }
  })

  app.get("/webui/api/plugins/:name/definition", requireWebuiAuth, async (req, res) => {
    try {
      const definition = await registry.getDefinition(req.params.name)
      if (!definition) {
        res.status(404).json({ ok: false, error: "Plugin not found" })
        return
      }
      res.json({ ok: true, definition })
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message || String(err) })
    }
  })

  app.get("/webui/api/plugins/:name/scopes", requireWebuiAuth, async (req, res) => {
    try {
      const scopes = await registry.listScopes(req.params.name, req.query?.scope, { req })
      res.json({ ok: true, scopes })
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message || String(err) })
    }
  })

  app.get("/webui/api/plugins/:name/config", requireWebuiAuth, async (req, res) => {
    try {
      const result = await registry.getValues(req.params.name, {
        scope: String(req.query?.scope || "global"),
        scopeId: req.query?.scope_id ? String(req.query.scope_id) : "",
        req,
      })
      if (!result) {
        res.status(404).json({ ok: false, error: "Plugin config provider not found" })
        return
      }
      res.json({ ok: true, ...normalizePayload(result) })
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message || String(err) })
    }
  })

  app.post("/webui/api/plugins/:name/config", requireWebuiAuth, async (req, res) => {
    try {
      const result = await registry.updateValues(req.params.name, {
        scope: String(req.body?.scope || "global"),
        scopeId: req.body?.scope_id ? String(req.body.scope_id) : "",
        values: req.body?.values && typeof req.body.values === "object" ? req.body.values : {},
        req,
        user: req.user,
      })
      if (!result) {
        res.status(404).json({ ok: false, error: "Plugin config provider not found" })
        return
      }
      res.json({ ok: true, ...normalizePayload(result) })
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message || String(err) })
    }
  })

  // keep existing plugin routes for compatibility
  try {
    for (const p of plugins) {
      const impl = p?.implementation
      if (!impl || typeof impl.apiRoutes !== "function") continue

      const router = express.Router()
      try {
        impl.apiRoutes(router)
      } catch (err) {
        logger.warn(`[webui] apiRoutes failed for plugin=${p.name}:`, err?.message || err)
        continue
      }

      app.use(`/${p.name}`, router)
      app.use(`/plugins/${p.name}`, router)
      logger.info(`[webui] mounted routes: /${p.name} and /plugins/${p.name}`)
    }
  } catch (err) {
    logger.warn("[webui] mount plugin routes failed:", err?.message || err)
  }

  server = app.listen(port, host, () => {
    logger.info(`[webui] listening on http://${host}:${port}`)
  })
  server.on("error", err => logger.error("[webui] server error:", err))

  return { app, server }
}

export function getWebuiServer() {
  return server ? { app, server } : null
}
