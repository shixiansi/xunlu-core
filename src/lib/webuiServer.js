import path from "node:path"
import express from "express"

import cfg from "./config.js"
import env from "./env.js"
import { loadPlugins } from "./pluginLoader.js"

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

function toPort(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

export async function startWebuiServer() {
  if (server) return { app, server }

  const logger = getLogger()
  const botCfg = cfg.getConfig("bot") || {}

  const enable = botCfg.webui_enable !== false && process.env.XUNLU_WEBUI_DISABLE !== "1"
  if (!enable) return null

  const host = String(process.env.XUNLU_WEBUI_HOST || botCfg.webui_host || "127.0.0.1")
  const port = toPort(process.env.XUNLU_WEBUI_PORT || botCfg.webui_port, 3000)

  app = express()
  app.disable("x-powered-by")
  app.use(express.json({ limit: "2mb" }))

  app.get("/health", (req, res) => res.json({ ok: true, name: "xunlu-webui", pid: process.pid }))

  // mount plugin api routes at both /<name> and /plugins/<name>
  try {
    const pluginsDir = path.join(env.RootPath, "src", "plugins")
    const plugins = await loadPlugins(pluginsDir)
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

