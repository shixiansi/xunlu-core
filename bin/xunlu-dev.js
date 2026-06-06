#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")
let importNonce = 0

function printHelp() {
  console.log(`
xunlu-dev (dev tools)

Usage:
  xunlu-dev --help
  xunlu-dev tree [--path <dir>] [--max-depth <n>] [--output <file>]
  xunlu-dev plugins [list]
  xunlu-dev simulate <text...> --plugin <name>[,<name2>] [--protocol <milky|onebotv11|icqq|icqq-local|both|all>] [--scene group|private] [--group <id>] [--user <id>] [--raw-segments <json>] [--json] [--cache-bust]
  xunlu-dev simulate-event <event> [text...] --plugin <name>[,<name2>] [--protocol <milky|onebotv11|icqq|icqq-local|both|all>] [--group <id>] [--user <id>] [--operator <id>] [--target <id>] [--flag <value>] [--comment <text>] [--protocol-payload <json>] [--extra <json>] [--json]
  xunlu-dev simulate-task <index> --plugin <name>[,<name2>] [--protocol <milky|onebotv11|icqq|icqq-local|both|all>] [--group <id>] [--user <id>] [--ctx <json>] [--json]
  xunlu-dev learning-chat proactive-test status [--group <id>] [--json]
  xunlu-dev learning-chat proactive-test prepare [--group <id>] [--whitelist <regex>] [--backup <file>] [--json] [--force]
  xunlu-dev learning-chat proactive-test restore [--backup <file>] [--json] [--keep-backup]
  xunlu-dev server health [--url <baseUrl>]
  xunlu-dev server event <jsonFile> [--url <baseUrl>]
  xunlu-dev bot status|restart|reload|exit [--url <baseUrl>] [--token <token>]
  xunlu-dev dev tree|check|report [options]

Examples:
  xunlu-dev tree --path src --max-depth 4 --output md/dir-tree.md
  xunlu-dev simulate 钓鱼测试 --plugin diaoyu
  xunlu-dev simulate 示例 --plugin example-plugin --protocol both --scene group --group 123 --user 10001
  xunlu-dev learning-chat proactive-test status --group 123456
  xunlu-dev learning-chat proactive-test prepare --group 123456
  xunlu-dev learning-chat proactive-test restore
  xunlu-dev dev check
  xunlu-dev bot restart
  xunlu-dev server health --url http://localhost:3000
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

function toInt(value) {
  if (value === undefined || value === null) return undefined
  const v = typeof value === "string" ? value.trim() : value
  if (v === "") return undefined
  const num = Number(v)
  return Number.isFinite(num) ? num : undefined
}

function ensureLoggerStub() {
  if (globalThis.logger) return
  const log = (...args) => console.log(...args)
  const warn = (...args) => console.warn(...args)
  const error = (...args) => console.error(...args)
  globalThis.logger = {
    trace: log,
    debug: log,
    info: log,
    warn,
    error,
    fatal: error,
    mark: log,
    red: v => v,
    green: v => v,
    yellow: v => v,
    blue: v => v,
    magenta: v => v,
    cyan: v => v,
  }
}

function ensureBotStub({ selfId = 10000 } = {}) {
  if (globalThis.Bot) return
  const log = (...args) => console.log("[BotStub]", ...args)
  const bot = {
    uin: selfId,
    nickname: "CLI",

    async setGroupMemberMute({ group_id, user_id, duration } = {}) {
      log(`setGroupMemberMute group=${group_id} user=${user_id} duration=${duration}`)
      return { ok: true }
    },

    async setGroupWholeMute({ group_id, enable } = {}) {
      log(`setGroupWholeMute group=${group_id} enable=${enable}`)
      return { ok: true }
    },

    pickGroup(group_id) {
      const gid = group_id
      return {
        group_id: gid,
        async muteMember(user_id, duration) {
          log(`pickGroup(${gid}).muteMember user=${user_id} duration=${duration}`)
          return true
        },
      }
    },
  }

  globalThis.Bot = bot
}

function splitCsv(raw) {
  return String(raw || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
}

async function importPluginByName(name, { cacheBust } = {}) {
  const base = path.join(repoRoot, "src", "plugins")
  const asDir = path.join(base, name, "index.js")
  const asFile = path.join(base, `${name}.js`)

  let target = null
  if (fs.existsSync(asDir)) target = asDir
  else if (fs.existsSync(asFile)) target = asFile

  if (!target) {
    throw new Error(`plugin not found: ${name}`)
  }

  const baseUrl = pathToFileURL(target).href
  const importUrl = cacheBust ? `${baseUrl}?update=${Date.now()}-${++importNonce}` : baseUrl
  const mod = await import(importUrl)
  const implementation = mod.default || mod

  const resolvedName = implementation.name || name
  const plugin = { name: resolvedName, implementation }
  if (typeof implementation.onBotEvent === "function") plugin.onBotEvent = implementation.onBotEvent
  return plugin
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function buildTree(rootPath, { maxDepth = 4, ignoreNames = new Set() } = {}) {
  const absRoot = path.resolve(repoRoot, rootPath)

  const lines = []
  const rootLabel = path.relative(repoRoot, absRoot) || "."
  lines.push(rootLabel)

  const walk = (dir, prefix, depth) => {
    if (depth >= maxDepth) return
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    entries = entries
      .filter(e => !ignoreNames.has(e.name))
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1
        if (!a.isDirectory() && b.isDirectory()) return 1
        return a.name.localeCompare(b.name)
      })

    entries.forEach((entry, idx) => {
      const isLast = idx === entries.length - 1
      const connector = isLast ? "└─ " : "├─ "
      lines.push(prefix + connector + entry.name + (entry.isDirectory() ? "/" : ""))

      if (entry.isDirectory()) {
        const nextPrefix = prefix + (isLast ? "   " : "│  ")
        walk(path.join(dir, entry.name), nextPrefix, depth + 1)
      }
    })
  }

  walk(absRoot, "", 0)
  return lines.join("\n")
}

function listPlugins() {
  const pluginsDir = path.join(repoRoot, "src", "plugins")
  if (!fs.existsSync(pluginsDir)) return []
  const entries = fs.readdirSync(pluginsDir, { withFileTypes: true })
  return entries
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .filter(name => fs.existsSync(path.join(pluginsDir, name, "index.js")))
    .sort((a, b) => a.localeCompare(b))
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

async function readBotCtlConfig() {
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

function fileExists(relPath) {
  return fs.existsSync(path.join(repoRoot, relPath))
}

function readPackageManifest() {
  try {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"))
  } catch (error) {
    return { error: error?.message || String(error) }
  }
}

function getLearningChatPaths() {
  const dataDir = path.join(repoRoot, "data")
  const learningChatDir = path.join(dataDir, "learning_chat")
  return {
    dataDir,
    learningChatDir,
    configPath: path.join(learningChatDir, "config.yaml"),
    learningChatDbPath: path.join(learningChatDir, "learning_chat.sqlite"),
    commandUsageDbPath: path.join(dataDir, "command_usage.sqlite"),
    backupPath: path.join(learningChatDir, "proactive-command-test.backup.json"),
  }
}

async function importLearningChatConfigModel({ cacheBust = false } = {}) {
  const modelPath = path.join(repoRoot, "src", "plugins", "learning_chat", "model", "config.js")
  const baseUrl = pathToFileURL(modelPath).href
  const importUrl = cacheBust ? `${baseUrl}?update=${Date.now()}-${++importNonce}` : baseUrl
  return await import(importUrl)
}

function normalizeLearningChatGroupId(value) {
  const raw = String(value || "").trim()
  return raw || ""
}

function buildLearningChatProactiveTestPatch(whitelist) {
  const pattern = String(whitelist || "^帮助$").trim() || "^帮助$"
  return {
    proactive: {
      enable: true,
      command_enable: true,
      min_messages_today: 0,
      command_min_count: 1,
      command_recent_manual_sec: 0,
      command_cooldown_sec: 0,
      command_max_daily_per_user: 5,
      command_whitelist: [pattern],
    },
  }
}

function readTextFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8")
  } catch {
    return ""
  }
}

function writeJsonFile(filePath, data) {
  ensureParentDir(filePath)
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8")
}

function printJsonOrSummary(data, { json = false } = {}) {
  if (json) {
    console.log(JSON.stringify(data, null, 2))
    return
  }

  for (const [key, value] of Object.entries(data || {})) {
    if (value === undefined || value === null || value === "") continue
    if (typeof value === "object") {
      console.log(`${key}:`)
      console.log(JSON.stringify(value, null, 2))
      continue
    }
    console.log(`${key}: ${value}`)
  }
}

async function getLearningChatStatus(flags = {}) {
  const paths = getLearningChatPaths()
  const groupId = normalizeLearningChatGroupId(flags.group || flags.group_id)
  const backupPath = flags.backup ? path.resolve(repoRoot, String(flags.backup)) : paths.backupPath
  const result = {
    ok: true,
    action: "status",
    configPath: paths.configPath,
    configExists: fs.existsSync(paths.configPath),
    learningChatDbPath: paths.learningChatDbPath,
    learningChatDbExists: fs.existsSync(paths.learningChatDbPath),
    commandUsageDbPath: paths.commandUsageDbPath,
    commandUsageDbExists: fs.existsSync(paths.commandUsageDbPath),
    backupPath,
    backupExists: fs.existsSync(backupPath),
  }

  if (!result.configExists) return result

  const model = await importLearningChatConfigModel({ cacheBust: true })
  const cfg = model.getConfig()
  result.proactive = {
    enable: Boolean(cfg?.proactive?.enable),
    allow_default: Boolean(cfg?.proactive?.allow_default),
    command_enable: Boolean(cfg?.proactive?.command_enable),
    min_messages_today: Number(cfg?.proactive?.min_messages_today ?? 0),
    command_min_count: Number(cfg?.proactive?.command_min_count ?? 0),
    command_recent_manual_sec: Number(cfg?.proactive?.command_recent_manual_sec ?? 0),
    command_cooldown_sec: Number(cfg?.proactive?.command_cooldown_sec ?? 0),
    command_recent_user_hours: Number(cfg?.proactive?.command_recent_user_hours ?? 0),
    command_max_daily_per_user: Number(cfg?.proactive?.command_max_daily_per_user ?? 0),
    command_whitelist: Array.isArray(cfg?.proactive?.command_whitelist)
      ? cfg.proactive.command_whitelist
      : [],
  }

  if (groupId) {
    const effective = model.getEffectiveGroupConfig(groupId)
    const override = cfg?.groups && typeof cfg.groups === "object" ? cfg.groups[groupId] || null : null
    result.group = {
      group_id: groupId,
      override,
      effective,
    }
  }

  return result
}

async function prepareLearningChatProactiveTest(flags = {}) {
  const paths = getLearningChatPaths()
  const groupId = normalizeLearningChatGroupId(flags.group || flags.group_id)
  const backupPath = flags.backup ? path.resolve(repoRoot, String(flags.backup)) : paths.backupPath
  const json = Boolean(flags.json)

  if (fs.existsSync(backupPath) && !flags.force) {
    console.error(
      `[xunlu-dev] backup already exists: ${backupPath}\nUse --force to overwrite it, or run restore first.`,
    )
    process.exitCode = 2
    return
  }

  const configExisted = fs.existsSync(paths.configPath)
  const configContent = configExisted ? readTextFileSafe(paths.configPath) : ""
  writeJsonFile(backupPath, {
    version: 1,
    kind: "learning-chat-proactive-test-backup",
    createdAt: new Date().toISOString(),
    configPath: paths.configPath,
    configExisted,
    configContentBase64: configExisted ? Buffer.from(configContent, "utf8").toString("base64") : "",
  })

  const model = await importLearningChatConfigModel({ cacheBust: true })
  model.getConfig()
  const patch = buildLearningChatProactiveTestPatch(flags.whitelist)
  await model.updateGlobalConfig(patch)
  if (groupId) {
    await model.setGroupOverrides(groupId, {
      proactive_enabled: true,
      proactive_command_enabled: true,
    })
  }

  const status = await getLearningChatStatus({ group: groupId, backup: backupPath })
  const result = {
    ...status,
    action: "prepare",
    backupPath,
    createdConfig: !configExisted && fs.existsSync(paths.configPath),
    appliedPatch: patch.proactive,
    restoreHint: `node ./bin/xunlu-dev.js learning-chat proactive-test restore --backup "${backupPath}"`,
  }

  printJsonOrSummary(result, { json })
}

async function restoreLearningChatProactiveTest(flags = {}) {
  const paths = getLearningChatPaths()
  const backupPath = flags.backup ? path.resolve(repoRoot, String(flags.backup)) : paths.backupPath
  const json = Boolean(flags.json)

  if (!fs.existsSync(backupPath)) {
    console.error(`[xunlu-dev] backup not found: ${backupPath}`)
    process.exitCode = 2
    return
  }

  let backup
  try {
    backup = JSON.parse(fs.readFileSync(backupPath, "utf8"))
  } catch (err) {
    console.error(`[xunlu-dev] failed to read backup: ${err?.message || String(err)}`)
    process.exitCode = 1
    return
  }

  const configPath = String(backup?.configPath || paths.configPath)
  const existed = Boolean(backup?.configExisted)
  if (existed) {
    ensureParentDir(configPath)
    const content = Buffer.from(String(backup?.configContentBase64 || ""), "base64").toString("utf8")
    fs.writeFileSync(configPath, content, "utf8")
  } else if (fs.existsSync(configPath)) {
    fs.rmSync(configPath, { force: true })
  }

  const keepBackup = Boolean(flags["keep-backup"] || flags.keepBackup)
  if (!keepBackup && fs.existsSync(backupPath)) {
    fs.rmSync(backupPath, { force: true })
  }

  const result = {
    ok: true,
    action: "restore",
    configPath,
    configExists: fs.existsSync(configPath),
    backupPath,
    backupKept: keepBackup,
  }
  printJsonOrSummary(result, { json })
}

async function devCheck() {
  const checks = []

  const requiredFiles = [
    "package.json",
    "src/index.js",
    "src/Bot/index.js",
    "src/Bot/message/context.js",
    "src/Bot/message/universal-message.js",
    "src/dev/plugin-test-harness.js",
    "src/dev/protocol-mock.js",
    "bin/xunlu.js",
    "bin/xunlu-dev.js",
    "bin/xunlubot.js",
    "test/plugin-test-harness.test.js",
    "test/protocol-api.test.js",
    "test/xunlu-dev.test.js",
  ]
  for (const f of requiredFiles) {
    checks.push({ name: `file:${f}`, ok: fileExists(f) })
  }

  const manifest = readPackageManifest()
  checks.push({
    name: "package:manifest",
    ok: !manifest?.error,
    detail: manifest?.error,
  })
  const scripts = manifest?.scripts && typeof manifest.scripts === "object" ? manifest.scripts : {}
  const requiredScripts = ["test:unit", "dev:check", "xunlu-dev"]
  for (const scriptName of requiredScripts) {
    checks.push({
      name: `package:scripts:${scriptName}`,
      ok: typeof scripts[scriptName] === "string" && scripts[scriptName].trim().length > 0,
    })
  }

  const requiredUnitTests = [
    "test/plugin-test-harness.test.js",
    "test/protocol-api.test.js",
    "test/xunlu-dev.test.js",
  ]
  for (const testFile of requiredUnitTests) {
    checks.push({
      name: `package:test:unit:${testFile}`,
      ok: typeof scripts["test:unit"] === "string" && scripts["test:unit"].includes(testFile),
    })
  }

  const cfg = await readBotCtlConfig()
  checks.push({
    name: "config:ctl_port",
    ok: Number.isFinite(cfg.port) && cfg.port > 0,
    detail: cfg.port,
  })

  try {
    await import(pathToFileURL(path.join(repoRoot, "src", "Bot", "message", "context.js")).href)
    checks.push({ name: "import:message/context", ok: true })
  } catch (e) {
    checks.push({ name: "import:message/context", ok: false, detail: e?.message || String(e) })
  }

  try {
    await import(
      pathToFileURL(path.join(repoRoot, "src", "Bot", "message", "universal-message.js")).href,
    )
    checks.push({ name: "import:message/universal-message", ok: true })
  } catch (e) {
    checks.push({
      name: "import:message/universal-message",
      ok: false,
      detail: e?.message || String(e),
    })
  }

  const ok = checks.every(c => c.ok)
  return { ok, checks }
}

function formatCheckReport(result) {
  const lines = []
  for (const c of result.checks) {
    lines.push(
      `${c.ok ? "OK " : "FAIL"} ${c.name}${c.detail !== undefined ? ` (${c.detail})` : ""}`,
    )
    if (!c.ok && c.detail) lines.push(String(c.detail))
  }
  return lines.join("\n")
}

class CliInputError extends Error {
  constructor(message) {
    super(message)
    this.name = "CliInputError"
    this.exitCode = 2
  }
}

function formatConsoleArg(value) {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function redirectConsoleToStderr(enabled = false, stderr = process.stderr) {
  if (!enabled) return () => {}
  const names = ["log", "info", "warn", "error", "debug", "trace"]
  const original = Object.fromEntries(names.map(name => [name, console[name]]))
  for (const name of names) {
    console[name] = (...args) => {
      stderr.write(`${args.map(formatConsoleArg).join(" ")}\n`)
    }
  }
  return () => {
    for (const name of names) {
      console[name] = original[name]
    }
  }
}

function parseJsonFlag(raw, label, { expectArray = false } = {}) {
  if (raw === undefined || raw === null || raw === "") return undefined
  try {
    const parsed = JSON.parse(String(raw))
    if (expectArray && !Array.isArray(parsed)) {
      throw new Error(`${label} must be a JSON array`)
    }
    return parsed
  } catch (error) {
    throw new CliInputError(`[xunlu-dev] invalid ${label}: ${error?.message || String(error)}`)
  }
}

function parseProtocolTargets(flag) {
  const raw = String(flag || "milky").trim().toLowerCase()
  const normalized = raw.includes("onebot") ? "onebotv11" : raw
  switch (normalized) {
    case "milky":
      return [{ key: "milky", protocol: "milky", mockMode: "strict" }]
    case "onebotv11":
      return [{ key: "onebotv11", protocol: "onebotv11", mockMode: "strict" }]
    case "icqq":
      return [{ key: "icqq", protocol: "icqq", mockMode: "strict" }]
    case "icqq-local":
      return [{ key: "icqq-local", protocol: "icqq", mockMode: "local" }]
    case "both":
      return [
        { key: "milky", protocol: "milky", mockMode: "strict" },
        { key: "onebotv11", protocol: "onebotv11", mockMode: "strict" },
      ]
    case "all":
      return [
        { key: "milky", protocol: "milky", mockMode: "strict" },
        { key: "onebotv11", protocol: "onebotv11", mockMode: "strict" },
        { key: "icqq", protocol: "icqq", mockMode: "strict" },
      ]
    default:
      throw new CliInputError(`[xunlu-dev] invalid --protocol: ${flag}`)
  }
}

function validateEventNameInput(eventName) {
  const normalized = String(eventName || "").trim().toLowerCase()
  const parts = normalized.split(".").filter(Boolean)
  if (parts.length < 3 || !["message", "notice", "request"].includes(parts[0])) {
    throw new CliInputError(`[xunlu-dev] invalid event name: ${eventName}`)
  }
  return normalized
}

function createEmptyResult({ protocol, mockMode, event = "" } = {}) {
  return {
    ok: false,
    event,
    replies: [],
    apiCalls: [],
    renderCalls: [],
    warnings: [],
    errors: [],
    result: undefined,
    protocol,
    adapterType: mockMode === "local" ? "Local" : "Mock",
    mockMode,
  }
}

async function cleanupRuntime() {
  try {
    const { default: cfg } = await import(
      pathToFileURL(path.join(repoRoot, "src", "lib", "config.js")).href,
    )
    cfg?.cleanup?.()
  } catch {}
}

function printSimulationResults({ targets, results, jsonOut, stdout = process.stdout }) {
  if (jsonOut) {
    if (targets.length === 1) {
      const key = targets[0]?.key
      stdout.write(`${JSON.stringify(results[key], null, 2)}\n`)
      return
    }
    stdout.write(`${JSON.stringify({ ok: Object.values(results).every(item => item?.ok), results }, null, 2)}\n`)
    return
  }

  if (targets.length === 1) {
    const key = targets[0]?.key
    console.log(JSON.stringify(results[key], null, 2))
    return
  }

  for (const target of targets) {
    console.log(`=== ${target.key} ===`)
    console.log(JSON.stringify(results[target.key], null, 2))
  }
}

function buildCommonTriggerInput(flags = {}) {
  const payload = {}
  const scene = flags.scene ? String(flags.scene) : undefined
  const groupId = toInt(flags.group || flags.group_id)
  const userId = toInt(flags.user || flags.user_id)
  const operatorId = toInt(flags.operator || flags.operator_id)
  const targetId = toInt(flags.target || flags.target_id)
  const selfId = toInt(flags.self || flags.self_id) ?? 10000

  if (scene) payload.scene = scene
  if (groupId !== undefined) payload.group_id = groupId
  if (userId !== undefined) payload.user_id = userId
  if (operatorId !== undefined) payload.operator_id = operatorId
  if (targetId !== undefined) payload.target_id = targetId
  if (flags.flag !== undefined) payload.flag = flags.flag
  if (flags.comment !== undefined) payload.comment = String(flags.comment)

  return { payload, selfId }
}

async function runHarnessCommand({
  pluginNames,
  protocolFlag,
  selfId,
  cacheBust = false,
  eventName = "",
  executor,
}) {
  const targets = parseProtocolTargets(protocolFlag)
  const { createPluginTestHarness } = await import(
    pathToFileURL(path.join(repoRoot, "src", "dev", "plugin-test-harness.js")).href,
  )

  const results = {}
  let exitCode = 0

  for (const target of targets) {
    let harness = null
    try {
      harness = await createPluginTestHarness({
        plugins: pluginNames,
        protocol: target.protocol,
        selfId,
        mockMode: target.mockMode,
        cacheBust: cacheBust || targets.length > 1,
      })
      const res = await executor(harness, target)
      results[target.key] = res
      if (!res?.ok) exitCode = 1
    } catch (error) {
      if (error?.exitCode === 2) throw error
      const res = createEmptyResult({
        protocol: target.protocol,
        mockMode: target.mockMode,
        event: eventName,
      })
      res.errors = [error?.stack || error?.message || String(error)]
      res.error = res.errors[0]
      results[target.key] = res
      exitCode = 1
    } finally {
      try {
        await harness?.dispose?.()
      } catch {}
    }
  }

  return { exitCode, results, targets }
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io?.stdout || process.stdout
  const stderr = io?.stderr || process.stderr
  if (!argv.length || argv.includes("--help") || argv[0] === "help") {
    printHelp()
    return
  }

  const cmd = argv[0]
  const rest = argv.slice(1)

  if (cmd === "simulate" || cmd === "simulate-event" || cmd === "simulate-task") {
    const { flags, positional } = parseArgs(rest)
    const jsonOut = Boolean(flags.json)
    const restoreConsole = redirectConsoleToStderr(jsonOut, stderr)

    try {
      const pluginsRaw = flags.plugin || flags.plugins
      const pluginNames = splitCsv(pluginsRaw)
      if (!pluginNames.length) {
        throw new CliInputError("[xunlu-dev] simulate commands require --plugin <name>[,<name2>]")
      }

      const protocolFlag = String(flags.protocol || "milky").toLowerCase()
      const cacheBust = Boolean(flags["cache-bust"] || flags.cacheBust)
      const { payload: commonPayload, selfId } = buildCommonTriggerInput(flags)

      ensureLoggerStub()

      if (cmd === "simulate") {
        const text = positional.join(" ").trim()
        const rawSegments = parseJsonFlag(flags["raw-segments"] || flags.rawSegments, "--raw-segments", {
          expectArray: true,
        })
        if (!text && !rawSegments) {
          throw new CliInputError(
            "[xunlu-dev] simulate requires <text...> or --raw-segments <json-array>",
          )
        }

        const payload = { ...commonPayload }
        if (text) payload.text = text
        if (rawSegments) payload.rawSegments = rawSegments

        const run = await runHarnessCommand({
          pluginNames,
          protocolFlag,
          selfId,
          cacheBust,
          executor: async harness => await harness.emitMessage(payload),
        })
        printSimulationResults({ targets: run.targets, results: run.results, jsonOut, stdout })
        process.exitCode = run.exitCode
        return
      }

      if (cmd === "simulate-event") {
        const [eventName, ...textParts] = positional
        if (!eventName) {
          throw new CliInputError("[xunlu-dev] simulate-event requires <event>")
        }
        validateEventNameInput(eventName)

        const protocolPayload = parseJsonFlag(
          flags["protocol-payload"] || flags.protocolPayload,
          "--protocol-payload",
        )
        const extra = parseJsonFlag(flags.extra, "--extra")
        const rawSegments = parseJsonFlag(flags["raw-segments"] || flags.rawSegments, "--raw-segments", {
          expectArray: true,
        })
        const text = textParts.join(" ").trim()
        const payload = {
          ...commonPayload,
          event: eventName,
          ...(protocolPayload && typeof protocolPayload === "object" ? { protocolPayload } : {}),
          ...(extra && typeof extra === "object" ? { extra } : {}),
        }
        if (text) payload.text = text
        if (rawSegments) payload.rawSegments = rawSegments

        const run = await runHarnessCommand({
          pluginNames,
          protocolFlag,
          selfId,
          cacheBust,
          eventName,
          executor: async harness => await harness.emitEvent(payload),
        })
        printSimulationResults({ targets: run.targets, results: run.results, jsonOut, stdout })
        process.exitCode = run.exitCode
        return
      }

      const indexRaw = positional[0]
      const index = toInt(indexRaw)
      if (!Number.isInteger(index) || index < 0) {
        throw new CliInputError("[xunlu-dev] simulate-task requires a valid <index>")
      }
      const ctxLike = parseJsonFlag(flags.ctx, "--ctx") || {}
      if (ctxLike !== null && typeof ctxLike !== "object") {
        throw new CliInputError("[xunlu-dev] --ctx must be a JSON object")
      }

      const mergedCtx = {
        ...commonPayload,
        ...(ctxLike && typeof ctxLike === "object" ? ctxLike : {}),
      }

      const run = await runHarnessCommand({
        pluginNames,
        protocolFlag,
        selfId,
        cacheBust,
        eventName: `task.${index}`,
        executor: async harness => {
          if (!harness?.bot?.scheduledTasks?.[index]) {
            throw new CliInputError(`[xunlu-dev] task not found: ${index}`)
          }
          return await harness.runTask({ index, ctxLike: mergedCtx })
        },
      })
      printSimulationResults({ targets: run.targets, results: run.results, jsonOut, stdout })
      process.exitCode = run.exitCode
      return
    } catch (error) {
      process.exitCode = error?.exitCode ?? 1
      console.error(error?.message || String(error))
      return
    } finally {
      await cleanupRuntime()
      restoreConsole()
    }
  }

  if (cmd === "tree") {
    const { flags } = parseArgs(rest)
    const targetPath = flags.path || "src"
    const maxDepth = Number(flags["max-depth"] ?? 4)
    const output = flags.output
    const ignore = new Set([".git", "node_modules", "logs", "temp", "data"])
    const tree = buildTree(targetPath, {
      maxDepth: Number.isFinite(maxDepth) ? maxDepth : 4,
      ignoreNames: ignore,
    })
    if (output) {
      const outAbs = path.resolve(repoRoot, output)
      ensureParentDir(outAbs)
      fs.writeFileSync(outAbs, tree, "utf8")
      console.log(`[xunlu-dev] wrote tree to ${output}`)
    } else {
      console.log(tree)
    }
    return
  }

  if (cmd === "plugins") {
    const { flags, positional } = parseArgs(rest)
    const sub = positional[0] || "list"
    if (sub !== "list") {
      console.error(`[xunlu-dev] unknown plugins subcommand: ${sub}`)
      process.exitCode = 2
      return
    }
    const list = listPlugins()
    if (flags.json) {
      stdout.write(`${JSON.stringify({ ok: true, plugins: list }, null, 2)}\n`)
      return
    }
    if (!list.length) {
      console.log("(no plugins found)")
      return
    }
    list.forEach(p => console.log(p))
    return
  }

  if (cmd === "learning-chat") {
    const section = rest[0]
    const maybeAction = rest[1]
    const maybeSubAction = rest[2]
    const commandChain = rest.slice(0, 3).filter(Boolean).join(" ")
    let flags = {}
    let resolvedAction = ""

    if (section === "proactive-test") {
      ;({ flags } = parseArgs(rest.slice(2)))
      resolvedAction = maybeAction || "help"
    } else if (section === "help" || !section) {
      resolvedAction = "help"
    } else {
      ;({ flags } = parseArgs(rest.slice(3)))
      resolvedAction = section === "proactive" && maybeAction === "test" ? maybeSubAction || "help" : ""
    }

    if (!resolvedAction) {
      console.error(`[xunlu-dev] unknown learning-chat command: ${commandChain || "(empty)"}`)
      process.exitCode = 2
      return
    }

    if (resolvedAction === "help") {
      console.log(`
xunlu-dev learning-chat proactive-test

Usage:
  xunlu-dev learning-chat proactive-test status [--group <id>] [--json]
  xunlu-dev learning-chat proactive-test prepare [--group <id>] [--whitelist <regex>] [--backup <file>] [--json] [--force]
  xunlu-dev learning-chat proactive-test restore [--backup <file>] [--json] [--keep-backup]

Examples:
  xunlu-dev learning-chat proactive-test status --group 123456
  xunlu-dev learning-chat proactive-test prepare --group 123456
  xunlu-dev learning-chat proactive-test restore
`)
      return
    }

    if (resolvedAction === "status") {
      const result = await getLearningChatStatus(flags)
      printJsonOrSummary(result, { json: Boolean(flags.json) })
      return
    }
    if (resolvedAction === "prepare") {
      await prepareLearningChatProactiveTest(flags)
      return
    }
    if (resolvedAction === "restore") {
      await restoreLearningChatProactiveTest(flags)
      return
    }

    console.error(`[xunlu-dev] unknown learning-chat proactive-test action: ${resolvedAction}`)
    process.exitCode = 2
    return
  }

  if (cmd === "server") {
    const sub = rest[0]
    const { flags, positional } = parseArgs(rest.slice(1))
    const baseUrl = String(flags.url || "http://localhost:3000").replace(/\/+$/, "")
    if (!sub || sub === "help") {
      console.log(`
xunlu-dev server

Usage:
  xunlu-dev server health [--url <baseUrl>]
  xunlu-dev server event <jsonFile> [--url <baseUrl>]
`)
      return
    }
    if (sub === "health") {
      const json = await httpGetJson(`${baseUrl}/health`)
      console.log(JSON.stringify(json, null, 2))
      return
    }
    if (sub === "event") {
      const jsonFile = positional[0]
      if (!jsonFile) {
        console.error("[xunlu-dev] server event requires <jsonFile>")
        process.exitCode = 2
        return
      }
      const abs = path.resolve(repoRoot, jsonFile)
      const payload = JSON.parse(fs.readFileSync(abs, "utf8"))
      const res = await httpPostJson(`${baseUrl}/bot/event`, payload)
      console.log(JSON.stringify(res, null, 2))
      return
    }
    console.error(`[xunlu-dev] unknown server subcommand: ${sub}`)
    process.exitCode = 2
    return
  }

  if (cmd === "bot") {
    const sub = rest[0]
    const { flags } = parseArgs(rest.slice(1))
    const cfg = await readBotCtlConfig()
    const baseUrl = String(flags.url || `http://127.0.0.1:${cfg.port}`).replace(/\/+$/, "")
    const token = flags.token || cfg.token || ""

    if (!sub || sub === "help") {
      console.log(`
xunlu-dev bot

Usage:
  xunlu-dev bot status|restart|reload|exit [--url <baseUrl>] [--token <token>]
`)
      return
    }

    if (sub === "status") {
      const json = await httpGetJson(`${baseUrl}/status`, { token })
      console.log(JSON.stringify(json, null, 2))
      return
    }
    if (sub === "restart" || sub === "reload") {
      const json = await httpPostJson(`${baseUrl}/restart`, {}, { token })
      console.log(JSON.stringify(json, null, 2))
      return
    }
    if (sub === "exit") {
      const json = await httpPostJson(`${baseUrl}/exit`, {}, { token })
      console.log(JSON.stringify(json, null, 2))
      return
    }

    console.error(`[xunlu-dev] unknown bot subcommand: ${sub}`)
    process.exitCode = 2
    return
  }

  if (cmd === "dev") {
    const sub = rest[0] || "help"
    const subArgs = rest.slice(1)
    const { flags } = parseArgs(subArgs)

    if (sub === "tree") {
      const targetPath = flags.path || "src"
      const maxDepth = Number(flags["max-depth"] ?? 4)
      const output = flags.output || "md/dir-tree.md"
      const ignore = new Set([".git", "node_modules", "logs", "temp", "data"])
      const tree = buildTree(targetPath, {
        maxDepth: Number.isFinite(maxDepth) ? maxDepth : 4,
        ignoreNames: ignore,
      })
      const outAbs = path.resolve(repoRoot, output)
      ensureParentDir(outAbs)
      fs.writeFileSync(outAbs, tree, "utf8")
      console.log(`[xunlu-dev] wrote dev tree to ${output}`)
      return
    }

    if (sub === "check") {
      const result = await devCheck()
      if (flags.json) {
        stdout.write(`${JSON.stringify(result, null, 2)}\n`)
        process.exitCode = result.ok ? 0 : 1
        return
      }
      console.log(formatCheckReport(result))
      process.exitCode = result.ok ? 0 : 1
      return
    }

    if (sub === "report") {
      const output = flags.output || "md/dev-report.md"
      const tree = buildTree("src", {
        maxDepth: 5,
        ignoreNames: new Set([".git", "node_modules", "logs", "temp", "data"]),
      })
      const check = await devCheck()

      const content = `# xunlu-core 开发汇报模板

## 目录树（自动生成）

\`\`\`
${tree}
\`\`\`

## Pipeline（建议）

- xunlu-dev dev tree
- xunlu-dev dev check
- xunlubot restart（或 xunlu-dev bot restart）重载插件
- 手工联调：群聊/私聊/图片/回复/撤回/表情回应

## 检查结果（轻量）

\`\`\`
${formatCheckReport(check)}
\`\`\`

## 实现方案

- （填写你的设计/关键模块/兼容性策略）

## 端到端测试结果

- （填写 milky / onebotv11 / icqq 的测试场景与结果）
`

      const outAbs = path.resolve(repoRoot, output)
      ensureParentDir(outAbs)
      fs.writeFileSync(outAbs, content, "utf8")
      console.log(`[xunlu-dev] wrote report template to ${output}`)
      return
    }

    console.log(`
xunlu-dev dev

Usage:
  xunlu-dev dev tree [--path <dir>] [--max-depth <n>] [--output <file>]
  xunlu-dev dev check
  xunlu-dev dev report [--output <file>]
`)
    return
  }

  console.error(`[xunlu-dev] unknown command: ${cmd}`)
  printHelp()
  process.exitCode = 2
}

function isDirectExecution() {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return pathToFileURL(path.resolve(entry)).href === import.meta.url
  } catch {
    return false
  }
}

if (isDirectExecution()) {
  main().catch(err => {
    console.error("[xunlu-dev] error:", err)
    process.exitCode = 1
  })
}
