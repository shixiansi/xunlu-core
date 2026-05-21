import path from "path"
import express from "express"
import { fileURLToPath } from "url"
import { loadPlugins } from "./pluginLoader.js"
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let app = null
let server = null
let serverReady = null

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
  if (server) {
    if (serverReady) await serverReady
    return { app, server }
  }

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
      impl.apiRoutes(router)

      app.use(`/plugins/${p.name}`, router)
      logger.info(`Mounted API routes for plugin: ${p.name}`)
    }
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

  const listenPort = options.port ?? process.env.PORT ?? 3000
  const listenHost = String(options.host ?? process.env.HOST ?? "0.0.0.0")
  const currentServer = app.listen(listenPort, listenHost)
  server = currentServer
  serverReady = new Promise((resolve, reject) => {
    const cleanup = () => {
      currentServer.off("listening", onListening)
      currentServer.off("error", onError)
    }
    const onListening = () => {
      cleanup()
      logger.info(`plugin-api listening on http://${listenHost}:${listenPort}`)
      resolve(currentServer)
    }
    const onError = err => {
      cleanup()
      if (server === currentServer) {
        server = null
        app = null
        serverReady = null
      }
      reject(err)
    }
    currentServer.once("listening", onListening)
    currentServer.once("error", onError)
  })
  await serverReady
  return { app, server }
}

export function getPluginApiServer() {
  return server ? { app, server } : null
}

export async function stopServer() {
  if (!server) return false

  const target = server
  const ready = serverReady
  server = null
  app = null
  serverReady = null
  if (ready) await ready.catch(() => false)
  if (!target.listening) return false
  await new Promise((resolve, reject) => {
    target.close(err => {
      if (err?.code === "ERR_SERVER_NOT_RUNNING") return resolve(false)
      if (err) return reject(err)
      resolve(true)
    })
  })
  return true
}
