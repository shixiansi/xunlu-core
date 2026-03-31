#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")

function printHelp() {
  console.log(`xunlu --help
Usage: xunlu [OPTIONS] COMMAND [ARGS]...

XunluBot CLI Client

Options:
  --help  Show this message and exit.

Commands:
  log     获取 Bot 日志
  send    发送消息给 Bot

使用示例:
发送消息:
  xunlu 你好
  xunlu send 你好
  xunlu send /help
  xunlu send --json 浣犲ソ
  echo \"你好\" | xunlu

获取日志:
  xunlu log
  xunlu --log
  xunlu log --lines 50
  xunlu log --level ERROR
  xunlu log --pattern \"CLI\"
  xunlu log --pattern \"ERRO|WARN\" --regex
  xunlu log --socket
`)
}

function parseArgs(argv) {
  const flags = {}
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a) continue
    if (a === "--") {
      positional.push(...argv.slice(i + 1))
      break
    }
    if (a.startsWith("--")) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith("--")) {
        flags[key] = next
        i++
      } else {
        flags[key] = true
      }
      continue
    }
    positional.push(a)
  }
  return { flags, positional }
}

async function getFetch() {
  if (typeof globalThis.fetch === "function") return globalThis.fetch.bind(globalThis)
  const mod = await import("node-fetch")
  return mod.default
}

async function readCtlConfig() {
  const cfgPath = path.join(repoRoot, "config", "config", "bot.config.yaml")
  try {
    const { default: YAML } = await import("yaml")
    const raw = fs.readFileSync(cfgPath, "utf8")
    const data = YAML.parse(raw) || {}
    const port = Number(data.ctl_port || 3081)
    const token = data.ctl_token ? String(data.ctl_token) : ""
    return { port: Number.isFinite(port) ? port : 3081, token }
  } catch {
    return { port: 3081, token: "" }
  }
}

async function httpGetJson(url, { token } = {}) {
  const fetchFn = await getFetch()
  const headers = token ? { authorization: `Bearer ${token}` } : undefined
  const res = await fetchFn(url, { headers })
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return { status: res.status, text }
  }
}

async function httpPostJson(url, body, { token } = {}) {
  const fetchFn = await getFetch()
  const headers = { "content-type": "application/json" }
  if (token) headers.authorization = `Bearer ${token}`
  const res = await fetchFn(url, { method: "POST", headers, body: JSON.stringify(body ?? {}) })
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return { status: res.status, text }
  }
}

async function readStdin() {
  if (process.stdin.isTTY) return ""
  return await new Promise(resolve => {
    let data = ""
    process.stdin.setEncoding("utf8")
    process.stdin.on("data", chunk => (data += chunk))
    process.stdin.on("end", () => resolve(data))
    process.stdin.on("error", () => resolve(""))
  })
}

function resolveLatestCommandLog() {
  const logsDir = path.resolve(repoRoot, "logs")
  if (!fs.existsSync(logsDir)) return null
  const files = fs
    .readdirSync(logsDir, { withFileTypes: true })
    .filter(e => e.isFile() && /^command\.\d{4}-\d{2}-\d{2}\.log$/.test(e.name))
    .map(e => path.join(logsDir, e.name))

  if (!files.length) return null
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
  return files[0]
}

function tailLines(filePath, lines) {
  if (!filePath || !fs.existsSync(filePath)) return []
  const text = fs.readFileSync(filePath, "utf8")
  const arr = text.split(/\r?\n/)
  while (arr.length && !arr[arr.length - 1]) arr.pop()
  return arr.slice(Math.max(0, arr.length - lines))
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

function filterLines(lines, { level, pattern, regex }) {
  let out = Array.isArray(lines) ? lines : []
  const token = levelToToken(level)
  if (token) out = out.filter(l => String(l).includes(`[${token}]`))
  if (pattern) {
    if (regex) {
      const re = new RegExp(String(pattern))
      out = out.filter(l => re.test(String(l)))
    } else {
      out = out.filter(l => String(l).includes(String(pattern)))
    }
  }
  return out
}

async function cmdLog(flags) {
  const cfg = await readCtlConfig()
  const baseUrl = String(flags.url || `http://127.0.0.1:${cfg.port}`).replace(/\/+$/, "")
  const token = flags.token || cfg.token || ""

  const lines = Number(flags.lines || 100)
  const level = flags.level || ""
  const pattern = flags.pattern || ""
  const regex = Boolean(flags.regex)
  const source = flags.source || "all"

  if (flags.socket) {
    const qs = new URLSearchParams()
    qs.set("lines", String(Number.isFinite(lines) ? lines : 100))
    if (level) qs.set("level", String(level))
    if (pattern) qs.set("pattern", String(pattern))
    if (regex) qs.set("regex", "1")
    if (source) qs.set("source", String(source))

    const json = await httpGetJson(`${baseUrl}/log?${qs.toString()}`, { token })
    if (!json?.ok) {
      console.log(JSON.stringify(json, null, 2))
      return
    }
    const out = Array.isArray(json.lines) ? json.lines : []
    console.log(out.join("\n"))
    return
  }

  const commandLog = resolveLatestCommandLog()
  const errorLog = path.resolve(repoRoot, "logs", "error.log")
  let raw = []
  if (String(source).toLowerCase() === "error") raw = tailLines(errorLog, lines)
  else if (String(source).toLowerCase() === "all") {
    raw = [
      ...(commandLog ? tailLines(commandLog, lines) : []),
      ...tailLines(errorLog, lines),
    ]
  } else raw = commandLog ? tailLines(commandLog, lines) : []

  const out = filterLines(raw, { level, pattern, regex })
  console.log(out.join("\n"))
}

async function cmdSend(text, flags) {
  const cfg = await readCtlConfig()
  const baseUrl = String(flags.url || `http://127.0.0.1:${cfg.port}`).replace(/\/+$/, "")
  const token = flags.token || cfg.token || ""

  const payload = { text }
  if (flags.group) payload.group_id = Number(flags.group)
  if (flags.user) payload.user_id = Number(flags.user)
  if (flags.scene) payload.scene = String(flags.scene)
  if (flags.master === false) payload.asMaster = false

  const json = await httpPostJson(`${baseUrl}/send`, payload, { token })
  if (!json?.ok) {
    console.log(JSON.stringify(json, null, 2))
    return
  }

  const result = json.result || {}
  if (flags.json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }
  const replies = Array.isArray(result.replies) ? result.replies : []
  if (!replies.length) {
    console.log("(no reply)")
    return
  }
  for (const r of replies) {
    if (r?.text) console.log(r.text)
    else console.log(JSON.stringify(r, null, 2))
  }
}

async function main() {
  const argv = process.argv.slice(2)

  if (!argv.length && !process.stdin.isTTY) {
    const stdin = (await readStdin()).trim()
    if (stdin) {
      await cmdSend(stdin, {})
      return
    }
    printHelp()
    return
  }

  if (!argv.length || argv.includes("--help")) {
    printHelp()
    return
  }

  // 兼容：xunlu --log
  if (argv[0] === "--log") argv.splice(0, 1, "log")

  const first = argv[0]

  if (first === "log") {
    const { flags } = parseArgs(argv.slice(1))
    await cmdLog(flags)
    return
  }

  if (first === "send") {
    const { flags, positional } = parseArgs(argv.slice(1))
    let text = positional.join(" ").trim()
    if (!text && !process.stdin.isTTY) text = (await readStdin()).trim()
    if (!text) {
      console.error("xunlu send: missing message text")
      process.exitCode = 2
      return
    }
    await cmdSend(text, flags)
    return
  }

  // 默认：当作发送消息
  const { flags, positional } = parseArgs(argv)
  let text = positional.join(" ").trim()
  if (!text && !process.stdin.isTTY) text = (await readStdin()).trim()
  if (!text) {
    printHelp()
    return
  }
  await cmdSend(text, flags)
}

main().catch(err => {
  console.error("[xunlu] error:", err)
  process.exitCode = 1
})
