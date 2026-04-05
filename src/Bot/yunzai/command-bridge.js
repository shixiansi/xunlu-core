import path from "node:path"
import { pathToFileURL } from "node:url"

import CommandUsageDB from "../../db/CommandUsageDB.js"
import env from "../../lib/env.js"

let modulesPromise = null
const bridgeState = {
  loaderRef: null,
  loaderInitAttempted: false,
  aiCatalogSignature: "",
  aiCatalogCommands: null,
}

function getBridgeLogger() {
  return globalThis.logger || console
}

function shouldLogMissingBridge() {
  return Boolean(globalThis.__xunluYunzaiCommandBridge) || env?.CurEnv === "QQBot-YunZai"
}

function refreshBridgeStateForLoader(loader) {
  if (bridgeState.loaderRef === loader) return bridgeState
  bridgeState.loaderRef = loader
  bridgeState.loaderInitAttempted = false
  bridgeState.aiCatalogSignature = ""
  bridgeState.aiCatalogCommands = null
  return bridgeState
}

function cloneAiCatalogCommands(commands = []) {
  return (Array.isArray(commands) ? commands : []).map(item => ({ ...item }))
}

function getRuntimeBot() {
  return globalThis.Bot || null
}

function normalizeString(value) {
  return String(value || "").trim()
}

function normalizeProtocol(event = {}) {
  const runtimeBot = getRuntimeBot()
  const runtimeProtocol = normalizeString(runtimeBot?.__xunlu_takeover_state?.protocol).toLowerCase()
  const eventProtocol = normalizeString(event?.protocol).toLowerCase()
  if (eventProtocol) return eventProtocol
  if (runtimeProtocol) return runtimeProtocol

  try {
    if (typeof runtimeBot?.isOnline === "function" && runtimeBot.isOnline()) return "icqq"
  } catch {}
  return ""
}

function getCommandUsageSource(event = {}) {
  if (event?.__commandUsageSource) return String(event.__commandUsageSource)
  if (event?.__proactiveCommand) return "proactive-command"
  if (event?.__xunluTakeover || event?.__isTakeover || event?.__takeover) return "yunzai-takeover"

  const runtimeProtocol = normalizeString(getRuntimeBot()?.__xunlu_takeover_state?.protocol).toLowerCase()
  const eventProtocol = normalizeProtocol(event)
  if (runtimeProtocol && eventProtocol && runtimeProtocol === eventProtocol) {
    return "yunzai-takeover"
  }

  return "yunzai"
}

function canTrackRule(rule = {}, event = {}) {
  if (rule?.trackUsage === false || event?.__skipCommandUsageLog) return false
  const reg = normalizeString(rule?.reg)
  if (!reg) return false

  const eventName = normalizeString(rule?.event || event?.post_type || "message").toLowerCase()
  return eventName.startsWith("message")
}

async function getBridgeModules() {
  if (globalThis.__xunluYunzaiCommandBridge) {
    return globalThis.__xunluYunzaiCommandBridge
  }
  if (env?.CurEnv !== "QQBot-YunZai") return null

  if (!modulesPromise) {
    modulesPromise = (async () => {
      const loaderPath = path.resolve(env.RootPath, "../../lib/plugins/loader.js")
      const runtimePath = path.resolve(env.RootPath, "../../lib/plugins/runtime.js")
      const [loaderMod, runtimeMod] = await Promise.all([
        import(pathToFileURL(loaderPath).href),
        import(pathToFileURL(runtimePath).href),
      ])
      return {
        PluginsLoader: loaderMod?.default,
        Runtime: runtimeMod?.default,
      }
    })().catch(() => null)
  }

  return await modulesPromise
}

async function ensureLoaderReady(loader, { reason = "unknown", allowInit = true } = {}) {
  if (!loader || typeof loader !== "object") return false

  const state = refreshBridgeStateForLoader(loader)
  const priorityList = Array.isArray(loader.priority) ? loader.priority : []
  if (priorityList.length > 0) return true
  if (!allowInit || typeof loader.load !== "function") {
    getBridgeLogger().warn?.(`[yunzai-bridge] loader priority is empty for ${reason}`)
    return false
  }
  if (state.loaderInitAttempted) {
    getBridgeLogger().warn?.(`[yunzai-bridge] loader priority is still empty after init attempt for ${reason}`)
    return false
  }

  state.loaderInitAttempted = true
  getBridgeLogger().info?.(`[yunzai-bridge] initializing yunzai loader for ${reason}`)

  try {
    await loader.load()
  } catch (error) {
    getBridgeLogger().warn?.(
      `[yunzai-bridge] loader initialization failed for ${reason}:`,
      error?.stack || error?.message || error,
    )
    return false
  }

  const nextPriority = Array.isArray(loader.priority) ? loader.priority : []
  if (!nextPriority.length) {
    getBridgeLogger().warn?.(`[yunzai-bridge] loader finished init but priority is empty for ${reason}`)
    return false
  }

  getBridgeLogger().info?.(`[yunzai-bridge] loader ready with ${nextPriority.length} plugin entries for ${reason}`)
  return true
}

function buildYunzaiTextMessage(rawCommand) {
  return [{ type: "text", text: String(rawCommand || "") }]
}

function pickRuleExample(rule = {}) {
  const example = rule?.example ?? rule?.examples
  if (Array.isArray(example)) return example.map(item => normalizeString(item)).find(Boolean) || ""
  return normalizeString(example)
}

function autoExampleFromReg(reg) {
  let source = normalizeString(reg)
  if (!source) return ""
  if (source.startsWith("^")) source = source.slice(1)
  if (source.endsWith("$")) source = source.slice(0, -1)

  source = source
    .replace(/\\s\*|\\s\+/g, " ")
    .replace(/\\d\+/g, "<数字>")
    .replace(/\\w\+/g, "<参数>")
    .replace(/\\S\+/g, "<参数>")
    .replace(/\.\+/g, "<参数>")
    .replace(/\.\*/g, "<参数>")
    .replace(/\(\?:/g, "")
    .replace(/[()[\]{}]/g, "")
    .replace(/\|.+$/g, "")
    .replace(/\\+/g, "")
    .replace(/[+*?]/g, "")
    .replace(/\s+/g, " ")
    .trim()

  return /[^\s]/.test(source) ? source : ""
}

function isObviousAiCatchAllReg(reg) {
  const normalized = normalizeString(reg)
  if (!normalized) return true

  const compact = normalized
    .replace(/^\^/, "")
    .replace(/\$$/, "")
    .replace(/\s+/g, "")

  return [
    ".*",
    ".+",
    "(.*)",
    "(.+)",
    "(?:.*)",
    "(?:.+)",
    "(.+)?",
    "(.*)?",
  ].includes(compact)
}

function getAiCatalogSignature(priorityList = []) {
  return (Array.isArray(priorityList) ? priorityList : [])
    .map(item => `${normalizeString(item?.name)}::${Number(item?.priority ?? 5000)}::${normalizeString(item?.class?.name)}`)
    .join("|")
}

function buildAiCatalogEvent(ctx = {}) {
  const runtimeBot = getRuntimeBot()
  const userId = ctx?.user_id ?? ctx?.sender_id ?? 10000
  const groupId = ctx?.group_id ?? 10000
  const selfId =
    ctx?.self_id ??
    runtimeBot?.self_id ??
    runtimeBot?.uin ??
    runtimeBot?.user_id

  return {
    self_id: selfId,
    time: Math.floor(Date.now() / 1000),
    post_type: "message",
    message_type: "group",
    sub_type: String(ctx?.sub_type || "normal"),
    group_id: groupId,
    peer_id: groupId,
    user_id: userId,
    raw_message: "",
    msg: "",
    sender:
      ctx?.sender && typeof ctx.sender === "object"
        ? { ...ctx.sender }
        : {
            user_id: userId,
            nickname: String(userId || ""),
            card: String(userId || ""),
          },
    group_name: String(ctx?.group_name || groupId || ""),
    protocol: normalizeProtocol(ctx),
    reply: async () => false,
  }
}

function normalizeYunzaiRuleEvent(rule = {}, plugin = {}) {
  return normalizeString(rule?.event || plugin?.event || "message").toLowerCase() || "message"
}

function normalizeYunzaiRulePriority(rule = {}, plugin = {}, loaderItem = {}) {
  return Number(rule?.priority ?? plugin?.priority ?? loaderItem?.priority ?? 5000) || 5000
}

export async function listYunzaiCommandsForAi({ ctx, plugin } = {}) {
  const modules = await getBridgeModules()
  const loader = modules?.PluginsLoader
  if (!loader) {
    if (shouldLogMissingBridge()) {
      getBridgeLogger().warn?.("[yunzai-bridge] yunzai loader is unavailable while building AI catalog")
    }
    return []
  }
  if (!(await ensureLoaderReady(loader, { reason: "ai-catalog" }))) return []

  const state = refreshBridgeStateForLoader(loader)
  const targetPluginName = normalizeString(plugin)
  const priorityList = Array.isArray(loader?.priority) ? loader.priority : []
  const signature = getAiCatalogSignature(priorityList)

  if (state.aiCatalogCommands && state.aiCatalogSignature === signature) {
    const cached = cloneAiCatalogCommands(state.aiCatalogCommands)
    if (!targetPluginName) return cached
    return cached.filter(item => normalizeString(item?.plugin) === targetPluginName)
  }

  const event = buildAiCatalogEvent(ctx)
  const commands = []
  let instantiationFailures = 0

  for (const item of priorityList) {
    if (targetPluginName && normalizeString(item?.name) !== targetPluginName) continue

    const PluginClass = item?.class
    if (typeof PluginClass !== "function") continue

    let pluginInstance = null
    try {
      pluginInstance = new PluginClass(event)
      pluginInstance.e = event
    } catch (error) {
      instantiationFailures += 1
      if (targetPluginName || priorityList.length <= 5) {
        getBridgeLogger().warn?.(
          `[yunzai-bridge] failed to instantiate plugin while building AI catalog: ${normalizeString(item?.name) || "unknown"}`,
          error?.stack || error?.message || error,
        )
      }
      continue
    }

    for (const rule of Array.isArray(pluginInstance?.rule) ? pluginInstance.rule : []) {
      const reg = normalizeString(rule?.reg)
      const eventName = normalizeYunzaiRuleEvent(rule, pluginInstance)
      if (!reg || !eventName.startsWith("message") || isObviousAiCatchAllReg(reg)) continue

      commands.push({
        source: "yunzai",
        plugin: normalizeString(pluginInstance?.name || item?.name),
        reg,
        event: eventName,
        example: pickRuleExample(rule) || autoExampleFromReg(reg),
        desc: normalizeString(rule?.desc || pluginInstance?.dsc || pickRuleExample(rule) || autoExampleFromReg(reg)),
        priority: normalizeYunzaiRulePriority(rule, pluginInstance, item),
      })
    }
  }

  commands.sort(
    (a, b) =>
      normalizeYunzaiRulePriority(a) - normalizeYunzaiRulePriority(b) ||
      normalizeString(a?.plugin).localeCompare(normalizeString(b?.plugin)) ||
      normalizeString(a?.reg).localeCompare(normalizeString(b?.reg)),
  )

  if (!targetPluginName) {
    state.aiCatalogSignature = signature
    state.aiCatalogCommands = cloneAiCatalogCommands(commands)
  }

  if (!commands.length) {
    getBridgeLogger().warn?.(
      `[yunzai-bridge] AI catalog is empty after scanning ${priorityList.length} plugins` +
        (instantiationFailures ? ` (${instantiationFailures} instantiation failures)` : ""),
    )
  } else {
    getBridgeLogger().info?.(
      `[yunzai-bridge] AI catalog ready with ${commands.length} commands from ${priorityList.length} plugins`,
    )
  }

  return commands
}

function buildSyntheticYunzaiEvent(ctx = {}, { reg = "", pluginName = "", preferParentReply = false } = {}) {
  const runtimeBot = getRuntimeBot()
  const rawCommand = normalizeString(ctx?.raw_message || ctx?.msg)
  const groupId = ctx?.group_id
  const peerId = ctx?.peer_id ?? ctx?.user_id ?? ctx?.sender_id
  const userId = ctx?.user_id ?? ctx?.sender_id
  const isGroup = groupId !== undefined && groupId !== null && String(groupId).trim() !== ""
  const selfId =
    ctx?.self_id ??
    runtimeBot?.self_id ??
    runtimeBot?.uin ??
    runtimeBot?.user_id

  const sender = ctx?.sender && typeof ctx.sender === "object"
    ? { ...ctx.sender }
    : {
        user_id: userId,
        nickname: String(userId || ""),
        card: String(userId || ""),
      }

  const group = ctx?.group || (isGroup && typeof runtimeBot?.pickGroup === "function"
    ? runtimeBot.pickGroup(Number(groupId) || groupId)
    : undefined)
  const friend = ctx?.friend || (!isGroup && typeof runtimeBot?.pickUser === "function"
    ? runtimeBot.pickUser(Number(peerId) || peerId)
    : undefined)

  const event = {
    self_id: selfId,
    time: Number(ctx?.time) > 0 ? Number(ctx.time) : Math.floor(Date.now() / 1000),
    post_type: "message",
    message_type: isGroup ? "group" : "private",
    sub_type: String(ctx?.sub_type || "normal"),
    group_id: isGroup ? groupId : undefined,
    peer_id: isGroup ? groupId : peerId,
    user_id: userId,
    message_id: ctx?.message_id,
    seq: ctx?.seq ?? ctx?.message_seq,
    message_seq: ctx?.message_seq ?? ctx?.seq,
    raw_message: rawCommand,
    message: buildYunzaiTextMessage(rawCommand),
    sender,
    group,
    friend,
    member: ctx?.member,
    group_name: String(ctx?.group_name || group?.name || groupId || ""),
    protocol: normalizeProtocol(ctx),
    __synthetic: true,
    __skipLearning: true,
    __proactiveCommand: Boolean(ctx?.__proactiveCommand),
    __commandUsageSource:
      normalizeString(ctx?.__commandUsageSource) || (ctx?.__proactiveCommand ? "proactive-command" : ""),
    __xunluYunzaiTargetPlugin: normalizeString(pluginName),
    __xunluYunzaiTargetReg: normalizeString(reg),
    __commandTriggeredAt: Number(ctx?.__commandTriggeredAt || 0) || Date.now(),
  }

  event.reply = async (msg = "", quote = false) => {
    void quote
    if (!msg) return false
    if (preferParentReply && typeof ctx?.reply === "function") return await ctx.reply(msg, quote)
    if (event.group && typeof event.group.sendMsg === "function") return await event.group.sendMsg(msg)
    if (event.friend && typeof event.friend.sendMsg === "function") return await event.friend.sendMsg(msg)
    if (typeof ctx?.reply === "function") return await ctx.reply(msg, quote)
    return false
  }
  event.toString = () => event.raw_message
  return event
}

function attachBotIfMissing(event) {
  if (!event || typeof event !== "object") return
  if ("bot" in event) return

  const runtimeBot = getRuntimeBot()
  const botRef = runtimeBot?.[event?.self_id || runtimeBot?.uin] || runtimeBot
  Object.defineProperty(event, "bot", { value: botRef })
}

function applyGameAliasNormalization(loader, event) {
  if (!event || typeof event !== "object") return

  if (!Object.prototype.hasOwnProperty.call(event, "isSr")) {
    Object.defineProperty(event, "isSr", {
      get: () => event.game === "sr",
      set: v => (event.game = v ? "sr" : "gs"),
    })
  }
  if (!Object.prototype.hasOwnProperty.call(event, "isGs")) {
    Object.defineProperty(event, "isGs", {
      get: () => event.game === "gs",
      set: v => (event.game = v ? "gs" : "sr"),
    })
  }

  const msg = String(event?.msg || "")
  if (!msg) return

  if (loader?.srReg instanceof RegExp && loader.srReg.test(msg)) {
    event.game = "sr"
    event.msg = msg.replace(loader.srReg, "#星铁")
    return
  }
  if (loader?.zzzReg instanceof RegExp && loader.zzzReg.test(msg)) {
    event.game = "zzz"
    event.msg = msg.replace(loader.zzzReg, "#绝区零")
  }
}

function createPluginInstances(loader, event, { targetPluginName = "" } = {}) {
  const list = []
  const wantedName = normalizeString(targetPluginName)
  const priorityList = Array.isArray(loader?.priority) ? loader.priority : []

  for (const item of priorityList) {
    if (wantedName && normalizeString(item?.name) !== wantedName) continue

    const PluginClass = item?.class
    if (typeof PluginClass !== "function") continue

    const plugin = new PluginClass(event)
    plugin.e = event
    if (typeof loader?.checkDisable === "function" && !loader.checkDisable(plugin)) continue
    if (typeof loader?.filtEvent === "function" && !loader.filtEvent(event, plugin)) continue
    list.push(plugin)
  }

  return list
}

function ruleMatches(loader, event, rule, { targetReg = "" } = {}) {
  const regText = normalizeString(rule?.reg)
  if (!regText) return false
  if (targetReg && regText !== normalizeString(targetReg)) return false

  if (rule?.event && typeof loader?.filtEvent === "function" && !loader.filtEvent(event, rule)) {
    return false
  }

  try {
    return new RegExp(regText).test(String(event?.msg || ""))
  } catch {
    return false
  }
}

async function recordYunzaiCommandUsage({ event, pluginName, rule, priority } = {}) {
  if (!event || !canTrackRule(rule, event)) return null

  const groupId = event?.group_id
  const userId = event?.user_id
  const rawCommand = normalizeString(event?.raw_message || event?.msg)
  if (!groupId || !userId || !rawCommand) return null

  const triggeredAt =
    Number(event?.__commandTriggeredAt || 0) ||
    (Number(event?.time) > 0 ? Number(event.time) * 1000 : Date.now())

  return await CommandUsageDB.recordUsage({
    groupId,
    userId,
    plugin: normalizeString(pluginName),
    reg: normalizeString(rule?.reg),
    rawCommand,
    protocol: normalizeProtocol(event),
    event: normalizeString(rule?.event || event?.post_type || "message") || "message",
    priority: Number(priority || 5000),
    source: getCommandUsageSource(event),
    triggeredAt,
    isSynthetic: Boolean(event?.__synthetic),
  }).catch(() => null)
}

function parseLogFnc(logFnc) {
  const text = normalizeString(logFnc)
  const match = /^\[(.+?)\]\[(.+?)\]$/.exec(text)
  if (!match) return null
  return {
    pluginName: normalizeString(match[1]),
    fncName: normalizeString(match[2]),
  }
}

function createInvokeResult(overrides = {}) {
  return {
    ok: false,
    matched: false,
    handled: false,
    blocked: false,
    reason: "",
    result: false,
    ...overrides,
  }
}

function logInvokeResult(rawCommand, result, options = {}) {
  const text = normalizeString(rawCommand)
  const reason = normalizeString(result?.reason || "unknown")
  const pluginName = normalizeString(options?.plugin)
  const detail = pluginName ? ` plugin=${pluginName}` : ""

  if (result?.ok) {
    getBridgeLogger().debug?.(`[yunzai-bridge] command executed: ${text}${detail} reason=${reason}`)
    return
  }

  getBridgeLogger().warn?.(`[yunzai-bridge] command did not complete: ${text}${detail} reason=${reason}`)
}

function shouldSkipSyntheticCooldown(ctx = {}, options = {}) {
  if (options?.skipCooldown === true) return true
  return normalizeString(ctx?.__commandUsageSource).toLowerCase() === "ai-dispatch"
}

async function runPluginContexts(plugins = []) {
  for (const plugin of plugins) {
    if (!plugin?.getContext) continue

    const context = {
      ...plugin.getContext(),
      ...plugin.getContext(false, true),
    }
    if (Object.keys(context).length === 0) continue

    let ret
    for (const fnc in context) {
      ret ||= await plugin[fnc](context[fnc])
    }

    if (ret === "continue") continue
    return createInvokeResult({
      ok: true,
      matched: true,
      handled: true,
      reason: "context",
      result: ret,
    })
  }

  return null
}

async function runPluginAccepts(loader, event, plugins = []) {
  if (typeof loader?.onlyReplyAt === "function" && !loader.onlyReplyAt(event)) {
    return createInvokeResult({
      handled: true,
      blocked: true,
      reason: "only-reply-at",
    })
  }

  applyGameAliasNormalization(loader, event)

  for (const plugin of plugins) {
    if (typeof plugin?.accept !== "function") continue

    const accepted = await plugin.accept(event)
    if (accepted === "return") {
      return createInvokeResult({
        ok: true,
        handled: true,
        reason: "accept-return",
        result: accepted,
      })
    }
    if (accepted) break
  }

  return null
}

async function runRuleByMatch(loader, event, plugins = [], { targetReg = "" } = {}) {
  const wantedReg = normalizeString(targetReg)

  for (const plugin of plugins) {
    const rules = Array.isArray(plugin?.rule) ? plugin.rule : []

    for (const rule of rules) {
      if (!ruleMatches(loader, event, rule, { targetReg: wantedReg })) continue

      event.logFnc = `[${plugin.name}][${rule.fnc}]`
      if (typeof loader?.filtPermission === "function" && !loader.filtPermission(event, rule)) {
        return createInvokeResult({
          ok: true,
          matched: true,
          handled: true,
          blocked: true,
          reason: "permission-denied",
        })
      }

      const fn = plugin?.[rule?.fnc]
      if (typeof fn !== "function") continue

      const result = await fn.call(plugin, event)
      if (result === false) continue

      if (typeof loader?.setLimit === "function") loader.setLimit(event)
      await recordYunzaiCommandUsage({
        event,
        pluginName: plugin.name,
        rule,
        priority: rule?.priority ?? plugin?.priority,
      })
      return createInvokeResult({
        ok: true,
        matched: true,
        handled: true,
        reason: "matched",
        result,
      })
    }
  }

  return createInvokeResult({
    reason: wantedReg ? "no-reg-match" : "no-match",
  })
}

async function prepareSyntheticInvocation(rawCommand, ctx, options = {}) {
  const text = normalizeString(rawCommand)
  if (!text) return createInvokeResult({ reason: "empty-command" })

  const modules = await getBridgeModules()
  const loader = modules?.PluginsLoader
  const Runtime = modules?.Runtime
  if (!loader) {
    if (shouldLogMissingBridge()) {
      getBridgeLogger().warn?.("[yunzai-bridge] command invocation skipped because loader is unavailable")
    }
    return createInvokeResult({ reason: "unavailable" })
  }
  if (!(await ensureLoaderReady(loader, { reason: "invoke-command" }))) {
    return createInvokeResult({ reason: "unavailable" })
  }

  const pluginName = normalizeString(options?.plugin)
  const syntheticCtx = ctx && typeof ctx === "object" ? Object.create(ctx) : {}
  syntheticCtx.raw_message = text
  syntheticCtx.msg = text

  const event = buildSyntheticYunzaiEvent(syntheticCtx, {
    reg: normalizeString(options?.reg),
    pluginName,
    preferParentReply: options?.preferParentReply === true,
  })
  attachBotIfMissing(event)

  if (typeof loader?.checkGuildMsg === "function" && loader.checkGuildMsg(event)) {
    return createInvokeResult({ handled: true, blocked: true, reason: "guild-message" })
  }
  if (!shouldSkipSyntheticCooldown(ctx, options) && typeof loader?.checkLimit === "function" && !loader.checkLimit(event)) {
    return createInvokeResult({ handled: true, blocked: true, reason: "cooldown" })
  }
  if (typeof loader?.dealMsg === "function") loader.dealMsg(event)
  if (typeof loader?.checkBlack === "function" && !loader.checkBlack(event)) {
    return createInvokeResult({ handled: true, blocked: true, reason: "blacklist" })
  }
  if (typeof loader?.reply === "function") loader.reply(event)
  if (Runtime && typeof Runtime.init === "function") await Runtime.init(event)

  const plugins = createPluginInstances(loader, event, { targetPluginName: pluginName })
  if (!plugins.length) return createInvokeResult({ reason: "no-plugin" })

  return {
    loader,
    event,
    plugins,
  }
}

async function recordExecutedYunzaiRule(loader, event) {
  const parsed = parseLogFnc(event?.logFnc)
  if (!parsed?.pluginName || !parsed?.fncName) return null

  const plugins = createPluginInstances(loader, event, { targetPluginName: parsed.pluginName })
  for (const plugin of plugins) {
    const rules = Array.isArray(plugin?.rule) ? plugin.rule : []
    for (const rule of rules) {
      if (normalizeString(rule?.fnc) !== parsed.fncName) continue
      if (!ruleMatches(loader, event, rule)) continue
      return await recordYunzaiCommandUsage({
        event,
        pluginName: plugin.name,
        rule,
        priority: rule?.priority ?? plugin?.priority,
      })
    }
  }

  return null
}

export async function startYunzaiCommandUsageBridge() {
  const modules = await getBridgeModules()
  const loader = modules?.PluginsLoader
  if (!loader || typeof loader.deal !== "function") return false
  if (loader.__xunluCommandUsageBridgePatched) return true

  const originalDeal = loader.deal.bind(loader)
  loader.deal = async function patchedDeal(event, ...args) {
    const result = await originalDeal(event, ...args)
    await recordExecutedYunzaiRule(loader, event).catch(() => null)
    return result
  }
  loader.__xunluCommandUsageBridgePatched = true
  return true
}

export async function invokeYunzaiCommandByText(rawCommand, ctx, options = {}) {
  const prepared = await prepareSyntheticInvocation(rawCommand, ctx, options)
  if (!prepared?.loader) {
    logInvokeResult(rawCommand, prepared, options)
    return prepared
  }

  const { loader, event, plugins } = prepared

  const contextResult = await runPluginContexts(plugins)
  if (contextResult) {
    logInvokeResult(rawCommand, contextResult, options)
    return contextResult
  }

  if (options?.skipOnlyReplyAt !== true) {
    const acceptResult = await runPluginAccepts(loader, event, plugins)
    if (acceptResult) {
      logInvokeResult(rawCommand, acceptResult, options)
      return acceptResult
    }
  } else {
    applyGameAliasNormalization(loader, event)

    for (const plugin of plugins) {
      if (typeof plugin?.accept !== "function") continue
      const accepted = await plugin.accept(event)
      if (accepted === "return") {
        const result = createInvokeResult({
          ok: true,
          handled: true,
          reason: "accept-return",
          result: accepted,
        })
        logInvokeResult(rawCommand, result, options)
        return result
      }
      if (accepted) break
    }
  }

  try {
    const result = await runRuleByMatch(loader, event, plugins, {
      targetReg: normalizeString(options?.reg),
    })
    logInvokeResult(rawCommand, result, options)
    return result
  } catch (error) {
    getBridgeLogger().warn?.(
      `[yunzai-bridge] plugin execution error for ${normalizeString(rawCommand)}:`,
      error?.stack || error?.message || error,
    )
    throw error
  }
}

export async function invokeYunzaiCommandByReg(reg, ctx, options = {}) {
  const regText = normalizeString(reg)
  if (!regText) return false

  const modules = await getBridgeModules()
  const loader = modules?.PluginsLoader
  const Runtime = modules?.Runtime
  if (!loader) return false
  if (!(await ensureLoaderReady(loader, { reason: "invoke-reg" }))) return false

  const pluginName = normalizeString(options?.plugin)
  const event = buildSyntheticYunzaiEvent(ctx, {
    reg: regText,
    pluginName,
    preferParentReply: options?.preferParentReply === true,
  })
  attachBotIfMissing(event)

  if (typeof loader?.checkGuildMsg === "function" && loader.checkGuildMsg(event)) return false
  if (!shouldSkipSyntheticCooldown(ctx, options) && typeof loader?.checkLimit === "function" && !loader.checkLimit(event)) return false
  if (typeof loader?.dealMsg === "function") loader.dealMsg(event)
  if (typeof loader?.checkBlack === "function" && !loader.checkBlack(event)) return false
  if (typeof loader?.reply === "function") loader.reply(event)
  if (Runtime && typeof Runtime.init === "function") await Runtime.init(event)

  const plugins = createPluginInstances(loader, event, { targetPluginName: pluginName })
  if (!plugins.length) return false

  for (const plugin of plugins) {
    if (!plugin?.getContext) continue
    const context = {
      ...plugin.getContext(),
      ...plugin.getContext(false, true),
    }
    if (Object.keys(context).length === 0) continue

    let ret
    for (const fnc in context) {
      ret ||= await plugin[fnc](context[fnc])
    }
    if (ret !== "continue") return Boolean(ret)
  }

  if (typeof loader?.onlyReplyAt === "function" && !loader.onlyReplyAt(event)) return false
  applyGameAliasNormalization(loader, event)

  for (const plugin of plugins) {
    if (typeof plugin?.accept !== "function") continue
    const accepted = await plugin.accept(event)
    if (accepted === "return") return false
    if (accepted) break
  }

  for (const plugin of plugins) {
    const rules = Array.isArray(plugin?.rule) ? plugin.rule : []
    for (const rule of rules) {
      if (!ruleMatches(loader, event, rule, { targetReg: regText })) continue

      event.logFnc = `[${plugin.name}][${rule.fnc}]`
      if (typeof loader?.filtPermission === "function" && !loader.filtPermission(event, rule)) {
        return false
      }

      const fn = plugin?.[rule?.fnc]
      if (typeof fn !== "function") continue

      const result = await fn.call(plugin, event)
      if (result === false) continue

      if (typeof loader?.setLimit === "function") loader.setLimit(event)
      await recordYunzaiCommandUsage({
        event,
        pluginName: plugin.name,
        rule,
        priority: rule?.priority ?? plugin?.priority,
      })
      return result
    }
  }

  return false
}

export function __resetYunzaiCommandBridgeStateForTests() {
  modulesPromise = null
  bridgeState.loaderRef = null
  bridgeState.loaderInitAttempted = false
  bridgeState.aiCatalogSignature = ""
  bridgeState.aiCatalogCommands = null
}
