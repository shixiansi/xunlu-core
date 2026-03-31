import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import { URL } from "node:url"
import cfg from "./config.js"

let server = null

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ""
    req.setEncoding("utf8")
    req.on("data", chunk => (data += chunk))
    req.on("end", () => resolve(data))
    req.on("error", reject)
  })
}

function json(res, statusCode, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  })
  res.end(body)
}

function isAuthorized(req, url, token) {
  if (!token) return true

  const header = req.headers.authorization || ""
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : ""
  const queryToken = url.searchParams.get("token") || ""
  const got = bearer || queryToken
  return got && got === token
}

function toInt(value, defaultValue) {
  const num = Number(value)
  return Number.isFinite(num) ? num : defaultValue
}

function tailLines(filePath, lines) {
  if (!filePath || !fs.existsSync(filePath)) return []
  const text = fs.readFileSync(filePath, "utf8")
  const arr = text.split(/\r?\n/)
  // 去掉末尾空行
  while (arr.length && !arr[arr.length - 1]) arr.pop()
  return arr.slice(Math.max(0, arr.length - lines))
}

function resolveLatestCommandLog() {
  const logsDir = path.resolve(process.cwd(), "logs")
  if (!fs.existsSync(logsDir)) return null
  const files = fs
    .readdirSync(logsDir, { withFileTypes: true })
    .filter(e => e.isFile() && /^command\.\d{4}-\d{2}-\d{2}\.log$/.test(e.name))
    .map(e => path.join(logsDir, e.name))

  if (!files.length) return null

  files.sort((a, b) => {
    const ta = fs.statSync(a).mtimeMs
    const tb = fs.statSync(b).mtimeMs
    return tb - ta
  })

  return files[0]
}

function levelToToken(level) {
  if (!level) return ""
  const lv = String(level).toUpperCase()
  const map = {
    TRACE: "TRAC",
    DEBUG: "DEBU",
    INFO: "INFO",
    WARN: "WARN",
    WARNING: "WARN",
    ERROR: "ERRO",
    FATAL: "FATA",
    MARK: "MARK",
  }
  return map[lv] || lv.slice(0, 4)
}

function filterLogLines(lines, { level, pattern, regex }) {
  let out = Array.isArray(lines) ? lines : []

  const token = levelToToken(level)
  if (token) {
    out = out.filter(l => typeof l === "string" && l.includes(`[${token}]`))
  }

  if (pattern) {
    if (regex) {
      const re = new RegExp(String(pattern))
      out = out.filter(l => re.test(String(l)))
    } else {
      const p = String(pattern)
      out = out.filter(l => String(l).includes(p))
    }
  }

  return out
}

export function startControlServer(handlers = {}) {
  if (server) return server

  const botCfg = cfg.getConfig("bot") || {}
  const enable = botCfg.ctl_enable !== false && process.env.XUNLU_CTL_DISABLE !== "1"
  if (!enable) return null

  const port = Number(process.env.XUNLU_CTL_PORT || botCfg.ctl_port || 3081)
  if (!Number.isFinite(port) || port <= 0) throw new Error(`invalid ctl_port: ${port}`)

  const token = process.env.XUNLU_CTL_TOKEN || botCfg.ctl_token || ""

  const getStatus =
    typeof handlers.getStatus === "function"
      ? handlers.getStatus
      : () => ({
          ok: true,
        })

  const reloadPlugins =
    typeof handlers.reloadPlugins === "function"
      ? handlers.reloadPlugins
      : async () => ({
          ok: false,
          error: "reloadPlugins not implemented",
        })

  const exitProcess =
    typeof handlers.exitProcess === "function"
      ? handlers.exitProcess
      : () => {
          setTimeout(() => process.exit(0), 50)
        }

  const sendMessage = typeof handlers.sendMessage === "function" ? handlers.sendMessage : null

  server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1")
      if (!isAuthorized(req, url, token)) {
        json(res, 401, { ok: false, error: "Unauthorized" })
        return
      }

      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
        json(res, 200, { ok: true, name: "xunlu-core", pid: process.pid })
        return
      }

      if (req.method === "GET" && url.pathname === "/status") {
        const status = await getStatus()
        json(res, 200, { ok: true, status })
        return
      }

      if (req.method === "POST" && (url.pathname === "/reload" || url.pathname === "/restart")) {
        await readBody(req).catch(() => "")
        const plugins = await reloadPlugins()
        json(res, 200, { ok: true, plugins })
        return
      }

      if (req.method === "POST" && url.pathname === "/send") {
        if (!sendMessage) {
          json(res, 501, { ok: false, error: "sendMessage not implemented" })
          return
        }

        const bodyText = await readBody(req).catch(() => "")
        let payload = {}
        try {
          payload = bodyText ? JSON.parse(bodyText) : {}
        } catch {
          json(res, 400, { ok: false, error: "Invalid JSON body" })
          return
        }

        const result = await sendMessage(payload)
        json(res, 200, { ok: true, result })
        return
      }

      if (req.method === "GET" && url.pathname === "/log") {
        const lines = toInt(url.searchParams.get("lines"), 100)
        const source = String(url.searchParams.get("source") || "all").toLowerCase()
        const level = url.searchParams.get("level") || ""
        const pattern = url.searchParams.get("pattern") || ""
        const regex = url.searchParams.get("regex") === "1" || url.searchParams.get("regex") === "true"

        const logsDir = path.resolve(process.cwd(), "logs")
        const commandLog = resolveLatestCommandLog()
        const errorLog = path.join(logsDir, "error.log")

        let raw = []
        let files = []
        if (source === "error") {
          files = [errorLog]
          raw = tailLines(errorLog, lines)
        } else if (source === "all") {
          files = [commandLog, errorLog].filter(Boolean)
          raw = [
            ...(commandLog ? tailLines(commandLog, lines) : []),
            ...tailLines(errorLog, lines),
          ]
        } else {
          // command
          files = [commandLog].filter(Boolean)
          raw = commandLog ? tailLines(commandLog, lines) : []
        }

        const filtered = filterLogLines(raw, { level, pattern, regex })
        json(res, 200, {
          ok: true,
          source,
          files: files.map(f => path.relative(process.cwd(), f)),
          lines: filtered,
        })
        return
      }

      if (req.method === "POST" && url.pathname === "/exit") {
        await readBody(req).catch(() => "")
        json(res, 200, { ok: true })
        exitProcess()
        return
      }

      json(res, 404, { ok: false, error: "Not Found", path: url.pathname })
    } catch (err) {
      json(res, 500, { ok: false, error: err?.message || String(err) })
    }
  })

  server.on("error", err => {
    console.error("[xunlu-core] control server error:", err)
  })

  server.listen(port, "127.0.0.1", () => {
    console.log(`[xunlu-core] control server listening on http://127.0.0.1:${port}`)
  })

  return server
}
