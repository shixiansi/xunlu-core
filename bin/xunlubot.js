#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")

function printHelp() {
  console.log(`
xunlubot (control cli)

This CLI talks to xunlu-core control server (default http://127.0.0.1:3081).

Usage:
  xunlubot --help
  xunlubot status   [--url <baseUrl>] [--token <token>]
  xunlubot restart  [--url <baseUrl>] [--token <token>]   # reload plugins
  xunlubot reload   [--url <baseUrl>] [--token <token>]
  xunlubot exit     [--url <baseUrl>] [--token <token>]
  xunlubot health   [--url <baseUrl>] [--token <token>]

Notes:
  - restart 用于重载插件（对应服务端 /restart）
  - token 来源：--token 或 bot.config.yaml 的 ctl_token
`)
}

function parseArgs(argv) {
  const flags = {}
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a) continue
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

async function main() {
  const argv = process.argv.slice(2)
  if (!argv.length || argv.includes("--help") || argv[0] === "help") {
    printHelp()
    return
  }

  const cmd = argv[0]
  const { flags } = parseArgs(argv.slice(1))

  const cfg = await readCtlConfig()
  const baseUrl = String(flags.url || `http://127.0.0.1:${cfg.port}`).replace(/\/+$/, "")
  const token = flags.token || cfg.token || ""

  switch (cmd) {
    case "health": {
      const json = await httpGetJson(`${baseUrl}/health`, { token })
      console.log(JSON.stringify(json, null, 2))
      return
    }
    case "status": {
      const json = await httpGetJson(`${baseUrl}/status`, { token })
      console.log(JSON.stringify(json, null, 2))
      return
    }
    case "restart":
    case "reload": {
      const json = await httpPostJson(`${baseUrl}/restart`, {}, { token })
      console.log(JSON.stringify(json, null, 2))
      return
    }
    case "exit": {
      const json = await httpPostJson(`${baseUrl}/exit`, {}, { token })
      console.log(JSON.stringify(json, null, 2))
      return
    }
    default:
      console.error(`[xunlubot] unknown command: ${cmd}`)
      printHelp()
      process.exitCode = 2
  }
}

main().catch(err => {
  console.error("[xunlubot] error:", err)
  process.exitCode = 1
})

