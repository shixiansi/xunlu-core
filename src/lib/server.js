import path from "path"
import express from "express"
import { fileURLToPath } from "url"
import { loadPlugins } from "./pluginLoader.js"
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let app = null
let server = null

function getLogger() {
  const lg = globalThis.logger
  if (lg && typeof lg === "object") return lg
  return {
    info: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  }
}

/**
 * 启动插件 API 服务。
 *
 * 新结构下推荐由 Runtime Kernel 显式传入已经加载好的插件列表；
 * 若仍以旧方式直接调用，则保留“自行发现插件”的兼容路径。
 */
export async function startServer(portOrOptions = process.env.PORT || 3000) {
  if (server) return { app, server }

  const options =
    portOrOptions && typeof portOrOptions === "object" && !Array.isArray(portOrOptions)
      ? portOrOptions
      : { port: portOrOptions }
  const logger = getLogger()

  app = express()
  app.use(express.json())

  // 基本健康检查
  app.get("/health", (req, res) => res.json({ status: "ok" }))

  // 优先消费 Runtime Kernel 传入的插件列表，避免二次加载和空 bot shim 分叉。
  const plugins =
    Array.isArray(options.plugins) && options.plugins.length > 0
      ? options.plugins
      : await loadPlugins(path.join(__dirname, "..", "plugins"))
  const shouldRegisterPlugins =
    typeof options.registerPlugins === "boolean"
      ? options.registerPlugins
      : !(Array.isArray(options.plugins) && options.plugins.length > 0)

  for (const p of plugins) {
    const impl = p.implementation
    // 如果插件需要注册 bot，可传入一个简单的 bot shim
    if (shouldRegisterPlugins && typeof impl.register === "function") {
      try {
        impl.register({})
      } catch (e) {
        logger.error(e)
      }
    }

    if (typeof impl.apiRoutes === "function") {
      const router = express.Router()
      console.log(router)

      impl.apiRoutes(router)
      console.log(router)

      app.use(`/plugins/${p.name}`, router)
      logger.info(`Mounted API routes for plugin: ${p.name}`)
    }
  }

  // 将 reset-qianyu 插件的 downloads 目录作为静态资源暴露（可选的 token 访问控制）
  try {
    const downloadsDir = path.join(__dirname, "plugins", "reset-qianyu-plugin", "downloads")

    const DOWNLOAD_TOKEN = process.env.PLUGIN_DOWNLOAD_TOKEN || null
    if (!DOWNLOAD_TOKEN) {
      logger.info("No PLUGIN_DOWNLOAD_TOKEN set — downloads route will be publicly accessible")
    } else {
      logger.info(`PLUGIN_DOWNLOAD_TOKEN is set — downloads will require token`)
    }

    const checkDownloadToken = (req, res, next) => {
      // 如果没有配置 token，则允许访问（兼容开发环境）
      if (!DOWNLOAD_TOKEN) return next()

      const headerToken = req.get("x-download-token")
      const auth = req.get("authorization")
      const bearerToken = auth && auth.startsWith("Bearer ") ? auth.slice(7) : null
      const queryToken = req.query && req.query.token
      const got = headerToken || bearerToken || queryToken

      if (got && got === DOWNLOAD_TOKEN) return next()
      res.status(401).json({ error: "Unauthorized" })
    }

    app.use(
      "/plugins/reset-qianyu-plugin/downloads",
      checkDownloadToken,
      express.static(downloadsDir),
    )

    logger.info(
      `Serving plugin downloads at /plugins/reset-qianyu-plugin/downloads from ${downloadsDir}`,
    )
  } catch (e) {
    logger.error("Failed to mount downloads static route", e)
  }

  app.post("/bot/event", (req, res) => {
    const event = req.body
    for (const p of plugins) {
      const onBotEvent = p.onBotEvent || p?.implementation?.onBotEvent
      if (typeof onBotEvent === "function") {
        try {
          onBotEvent(event)
        } catch (e) {
          logger.error(e)
        }
      }
    }
    res.json({ ok: true })
  })

  const listenPort = options.port || process.env.PORT || 3000
  const listenHost = String(options.host || process.env.HOST || "0.0.0.0")
  server = app.listen(listenPort, listenHost, () =>
    logger.info(`plugin-api listening on http://${listenHost}:${listenPort}`),
  )
  return { app, server }
}

export function getPluginApiServer() {
  return server ? { app, server } : null
}

export async function stopServer() {
  if (!server) return false

  const target = server
  server = null
  app = null
  await new Promise((resolve, reject) => {
    target.close(err => {
      if (err) return reject(err)
      resolve(true)
    })
  })
  return true
}
