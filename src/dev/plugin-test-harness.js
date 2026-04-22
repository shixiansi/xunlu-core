import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import BaseBot from "../Bot/index.js"
import {
  renderUniversalSegments,
  simulateIncomingEvent,
  UniversalMessageSegment,
} from "../Bot/message/index.js"
import sharedPuppeteer from "../component/puppeteer/puppeteer.js"
import CommandUsageDB from "../db/CommandUsageDB.js"
import MessageDB from "../db/MessageDB.js"
import cfg from "../lib/config.js"
import { createProtocolMock } from "./protocol-mock.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..", "..")

let importNonce = 0

function snapshotValue(value) {
  try {
    return structuredClone(value)
  } catch {
    try {
      return JSON.parse(JSON.stringify(value))
    } catch {
      return value
    }
  }
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
    red: value => value,
    green: value => value,
    yellow: value => value,
    blue: value => value,
    magenta: value => value,
    cyan: value => value,
  }
}

function normalizeProtocol(protocol) {
  const text = String(protocol || "milky").trim().toLowerCase()
  if (text.includes("onebot")) return "onebotv11"
  if (text.includes("icqq")) return "icqq"
  return "milky"
}

function resolveAdapterType(mockMode) {
  return String(mockMode || "").toLowerCase() === "local" ? "Local" : "Mock"
}

function formatError(error) {
  return error?.stack || error?.message || String(error)
}

function toReplyRecord(message) {
  if (typeof message === "string") return { text: message, message }
  if (Array.isArray(message)) return { text: renderUniversalSegments(message), message }
  if (message && typeof message === "object" && Array.isArray(message.message)) {
    return { text: renderUniversalSegments(message.message), message: message.message }
  }
  return { text: renderUniversalSegments([message]), message }
}

function extractRepliesFromCalls(apiCalls) {
  const replies = []
  for (const call of Array.isArray(apiCalls) ? apiCalls : []) {
    const name = String(call?.name || "")
    const params = call?.params && typeof call.params === "object" ? call.params : {}
    if (
      params.message !== undefined &&
      /(send_|sendMsg$|sendMessage$|send_private_msg|send_group_msg|send_private_message|send_group_message)/i.test(
        name,
      )
    ) {
      replies.push(params.message)
      continue
    }
    if (Array.isArray(params.messages) && /forward/i.test(name)) {
      replies.push(params.messages)
    }
  }
  return replies.map(toReplyRecord)
}

function createFakeTimers() {
  let nextId = 1
  const queue = []

  return {
    queue,

    setTimeout(fn, delay = 0) {
      const entry = {
        id: nextId++,
        fn,
        delay: Math.max(0, Math.floor(Number(delay) || 0)),
        active: true,
      }
      queue.push(entry)
      return entry.id
    },

    clearTimeout(id) {
      const entry = queue.find(item => item.id === id || item === id)
      if (entry) entry.active = false
    },

    async flushAll({ maxRounds = 100 } = {}) {
      let executed = 0
      let rounds = 0
      while (rounds < maxRounds) {
        rounds += 1
        const next = queue.find(item => item.active)
        if (!next) break
        next.active = false
        executed += 1
        await Promise.resolve().then(() => next.fn())
      }
      return executed
    },
  }
}

function createFakeScheduler() {
  const jobs = []
  return {
    jobs,

    scheduleJob(interval, fn) {
      const job = {
        interval,
        fn,
        cancelled: false,
        cancel() {
          this.cancelled = true
          return true
        },
      }
      jobs.push(job)
      return job
    },
  }
}

function createFakeRenderer() {
  const calls = []
  return {
    calls,

    async render(name, tplPath, data = {}, options = {}) {
      const originalData = snapshotValue(data)
      let renderedData = originalData
      if (typeof options?.beforeRender === "function") {
        const next = options.beforeRender({ data: snapshotValue(data) })
        if (next !== undefined) renderedData = snapshotValue(next)
      }
      calls.push({
        name,
        tplPath,
        data: originalData,
        renderedData,
        options: snapshotValue(options),
      })
      const token = Buffer.from(`mock-render:${name}:${calls.length}`, "utf8").toString("base64")
      return UniversalMessageSegment.image({
        file: `base64://${token}`,
        url: `https://mock.render/${name}/${calls.length}.png`,
        summary: `[mock render ${name}]`,
      })
    },
  }
}

async function importPluginByName(name, { cacheBust = false } = {}) {
  const base = path.join(repoRoot, "src", "plugins")
  const asDir = path.join(base, name, "index.js")
  const asFile = path.join(base, `${name}.js`)
  let resolvedTarget = null
  if (path.isAbsolute(name)) resolvedTarget = name
  else if (name.includes("/") || name.includes("\\")) resolvedTarget = path.resolve(repoRoot, name)
  else if (fs.existsSync(asDir)) resolvedTarget = asDir
  else if (fs.existsSync(asFile)) resolvedTarget = asFile
  if (!resolvedTarget || !fs.existsSync(resolvedTarget)) {
    throw new Error(`plugin not found: ${name}`)
  }
  const baseUrl = pathToFileURL(resolvedTarget).href
  const importUrl = cacheBust ? `${baseUrl}?update=${Date.now()}-${++importNonce}` : baseUrl
  const mod = await import(importUrl)
  return normalizePlugin(mod.default || mod, name)
}

function normalizePlugin(plugin, fallbackName = "plugin") {
  if (plugin && plugin.implementation && plugin.name) return plugin
  const implementation = plugin?.default || plugin
  return {
    name: implementation?.name || fallbackName,
    implementation,
    ...(typeof implementation?.onBotEvent === "function"
      ? { onBotEvent: implementation.onBotEvent }
      : {}),
  }
}

async function resolvePlugins(plugins = [], options = {}) {
  const list = Array.isArray(plugins) ? plugins : [plugins]
  const out = []
  for (const item of list) {
    if (!item) continue
    if (typeof item === "string") {
      out.push(await importPluginByName(item, options))
      continue
    }
    out.push(normalizePlugin(item, item?.name || "plugin"))
  }
  return out
}

function captureStart(runtime, renderer) {
  return {
    warnings: runtime.warnings.length,
    errors: runtime.errors.length,
    apiCalls: runtime.calls.length,
    renderCalls: renderer?.calls?.length || 0,
  }
}

function captureDiff(start, runtime, renderer) {
  return {
    warnings: runtime.warnings.slice(start.warnings).map(snapshotValue),
    errors: runtime.errors.slice(start.errors).map(snapshotValue),
    apiCalls: runtime.calls.slice(start.apiCalls).map(snapshotValue),
    renderCalls: (renderer?.calls || []).slice(start.renderCalls).map(snapshotValue),
  }
}

function buildCaptureResult({
  start,
  runtime,
  renderer,
  result = {},
  thrown = null,
  protocol,
  adapterType,
  mockMode,
  fallbackEvent = "",
}) {
  const diff = captureDiff(start, runtime, renderer)
  const warnings = [...diff.warnings]
  for (const warning of Array.isArray(result?.warnings) ? result.warnings : []) {
    const next = snapshotValue(warning)
    if (!warnings.some(item => JSON.stringify(item) === JSON.stringify(next))) {
      warnings.push(next)
    }
  }

  const errors = [...diff.errors]
  for (const error of Array.isArray(result?.errors) ? result.errors : []) {
    const text = String(error)
    if (!errors.includes(text)) errors.push(text)
  }
  if (thrown) {
    const text = formatError(thrown)
    if (!errors.includes(text)) errors.push(text)
  }

  return {
    ok: errors.length === 0 && Boolean(result?.ok ?? !thrown),
    event: result?.event ?? fallbackEvent,
    replies: Array.isArray(result?.replies) ? result.replies : extractRepliesFromCalls(diff.apiCalls),
    apiCalls: diff.apiCalls,
    renderCalls: diff.renderCalls,
    warnings,
    errors,
    result: result?.result,
    protocol,
    adapterType,
    scene: result?.scene,
    user_id: result?.user_id,
    group_id: result?.group_id,
    input: result?.input,
    mockMode,
  }
}

export async function createPluginTestHarness({
  plugins = [],
  protocol = "milky",
  selfId = 10000,
  mockMode = "strict",
  renderMode = "fake",
  schedulerMode = "fake",
  cacheBust = false,
} = {}) {
  ensureLoggerStub()

  const normalizedProtocol = normalizeProtocol(protocol)
  const resolvedMockMode = String(mockMode || "strict").toLowerCase() === "local" ? "local" : "strict"
  const adapterType = resolveAdapterType(resolvedMockMode)
  const runtime = createProtocolMock({ protocol: normalizedProtocol, selfId })
  const scheduler = schedulerMode === "real" ? null : createFakeScheduler()
  const timers = createFakeTimers()
  const renderer = renderMode === "real" ? null : createFakeRenderer()
  const bindEvent = resolvedMockMode === "local" ? null : runtime.bot

  const previousBot = globalThis.Bot
  globalThis.Bot = runtime.bot

  const bot = new BaseBot({
    adapter: normalizedProtocol,
    ...(scheduler ? { scheduler } : {}),
    timers,
    ...(renderer ? { renderer } : {}),
  })
  if (bindEvent) bot.bindEvent = bindEvent

  const resolvedPlugins = await resolvePlugins(plugins, { cacheBust })
  for (const pluginEntry of resolvedPlugins) {
    await bot.registerPlugin(pluginEntry)
  }
  await bot.runMount()

  async function emitEvent(input = {}) {
    const start = captureStart(runtime, renderer)
    const payload = { ...(input && typeof input === "object" ? input : {}) }
    let res = null
    let thrown = null
    try {
      res = await simulateIncomingEvent({
        bot,
        protocol: normalizedProtocol,
        adapterType,
        event: input?.event,
        payload,
        selfId,
        ...(bindEvent ? { bindEvent } : {}),
      })
    } catch (error) {
      thrown = error
    }

    return buildCaptureResult({
      start,
      runtime,
      renderer,
      result: res,
      thrown,
      protocol: normalizedProtocol,
      adapterType,
      mockMode: resolvedMockMode,
      fallbackEvent: String(input?.event || payload?.event || payload?.event_name || payload?.eventName || ""),
    })
  }

  async function emitMessage(input = {}) {
    return await emitEvent({
      ...(input && typeof input === "object" ? input : {}),
      event:
        input?.event ??
        input?.event_name ??
        input?.eventName ??
        undefined,
    })
  }

  async function runTask({ index, ctxLike = {} } = {}) {
    const taskIndex = Number(index)
    if (!Number.isInteger(taskIndex) || taskIndex < 0) {
      throw new Error("invalid task index")
    }
    const task = bot.scheduledTasks[taskIndex]
    if (!task || typeof task.runner !== "function") {
      throw new Error(`task not found: ${taskIndex}`)
    }

    const start = captureStart(runtime, renderer)
    let result
    let thrown = null
    try {
      result = await task.runner(ctxLike)
    } catch (err) {
      thrown = err
    }
    const diff = captureDiff(start, runtime, renderer)
    const errors = [...diff.errors]
    if (thrown) {
      const text = formatError(thrown)
      if (!errors.includes(text)) errors.push(text)
    }

    return {
      ok: errors.length === 0,
      event: `task.${taskIndex}`,
      replies: extractRepliesFromCalls(diff.apiCalls),
      apiCalls: diff.apiCalls,
      renderCalls: diff.renderCalls,
      warnings: diff.warnings,
      errors,
      result,
      protocol: normalizedProtocol,
      adapterType,
      mockMode: resolvedMockMode,
    }
  }

  async function flushTimeouts(options = {}) {
    const start = captureStart(runtime, renderer)
    let executed = 0
    let thrown = null
    try {
      executed = await timers.flushAll(options)
    } catch (error) {
      thrown = error
    }

    const diff = captureDiff(start, runtime, renderer)
    const errors = [...diff.errors]
    if (thrown) {
      const text = formatError(thrown)
      if (!errors.includes(text)) errors.push(text)
    }

    return {
      ok: errors.length === 0,
      event: "timers.flush",
      replies: extractRepliesFromCalls(diff.apiCalls),
      apiCalls: diff.apiCalls,
      renderCalls: diff.renderCalls,
      warnings: diff.warnings,
      errors,
      result: { executed },
      protocol: normalizedProtocol,
      adapterType,
      mockMode: resolvedMockMode,
    }
  }

  function resetCaptures() {
    runtime.warnings.length = 0
    runtime.errors.length = 0
    runtime.calls.length = 0
    if (renderer?.calls) renderer.calls.length = 0
  }

  async function dispose() {
    globalThis.Bot = previousBot
    try {
      for (const task of Array.isArray(bot?.scheduledTasks) ? bot.scheduledTasks : []) {
        task?.job?.cancel?.()
      }
    } catch {}
    try {
      cfg?.cleanup?.()
    } catch {}
    try {
      await CommandUsageDB?.close?.()
    } catch {}
    try {
      await MessageDB?.close?.()
    } catch {}
    try {
      if (sharedPuppeteer?.cleanupTimer) {
        clearTimeout(sharedPuppeteer.cleanupTimer)
        sharedPuppeteer.cleanupTimer = null
      }
      if (sharedPuppeteer?.browser && typeof sharedPuppeteer.stop === "function") {
        await sharedPuppeteer.stop(sharedPuppeteer.browser)
      }
      sharedPuppeteer.browser = false
      sharedPuppeteer.lock = false
    } catch {}
  }

  return {
    bot,
    runtimeBot: runtime.bot,
    protocol: normalizedProtocol,
    mockMode: resolvedMockMode,
    emitMessage,
    emitEvent,
    runTask,
    flushTimeouts,
    resetCaptures,
    dispose,
    scheduler,
    timers,
    renderer,
  }
}
