import { UniversalMessageSegment } from "../../../Bot/message/index.js"
import { listYunzaiCommandsForAi } from "../../../Bot/yunzai/command-bridge.js"
import {
  buildClarifyQuestion,
  buildNaturalCommandCandidates,
  clampText,
  getDispatchLogger,
  hasNaturalCommandIntent,
  isHighRiskCommand,
  isIncompleteHighRiskCommand,
  isPlainObject,
  normalizeCatalogPriority,
  normalizeCatalogSource,
  normalizeMatchText,
} from "./dispatcher-shared.js"

function pickHelpExample(help) {
  if (!help) return ""
  const example = help.example ?? help.examples
  if (Array.isArray(example)) return example.map(item => String(item || "").trim()).find(Boolean) || ""
  if (typeof example === "string" || typeof example === "number") return String(example).trim()
  return ""
}

function pickHelpDesc(help) {
  if (!help) return ""
  const desc = help.desc ?? help.description ?? help.summary
  if (typeof desc === "string" || typeof desc === "number") return String(desc).trim()
  return ""
}

function pickItemExample(item) {
  const example = item?.example ?? item?.command
  if (Array.isArray(example)) return example.map(entry => String(entry || "").trim()).find(Boolean) || ""
  if (typeof example === "string" || typeof example === "number") return String(example).trim()
  return ""
}

function pickItemDesc(item) {
  const desc = item?.desc ?? item?.description ?? item?.summary ?? item?.dsc
  if (typeof desc === "string" || typeof desc === "number") return String(desc).trim()
  return ""
}

function autoExampleFromReg(reg) {
  let source = String(reg || "").trim()
  if (!source) return ""
  if (source.startsWith("^")) source = source.slice(1)
  if (source.endsWith("$")) source = source.slice(0, -1)

  let out = ""
  let index = 0

  const readUntil = (endChar, startIndex) => {
    let depth = 0
    for (let cursor = startIndex; cursor < source.length; cursor += 1) {
      const char = source[cursor]
      if (char === "\\") {
        cursor += 1
        continue
      }
      if (char === "(") depth += 1
      if (char === ")") {
        if (depth === 0) return cursor
        depth -= 1
      }
      if (char === endChar && depth === 0) return cursor
    }
    return -1
  }

  while (index < source.length) {
    const char = source[index]

    if (char === "\\") {
      const next = source[index + 1]
      if (!next) break

      if (next === "s") {
        index += 2
        if (source[index] === "*" || source[index] === "+") index += 1
        out += " "
        continue
      }

      if (next === "d") {
        index += 2
        while (/[+*?0-9{}]/.test(source[index] || "")) index += 1
        out += "<数字>"
        continue
      }

      if (next === "w" || next === "S") {
        index += 2
        while (/[+*?0-9{}]/.test(source[index] || "")) index += 1
        out += "<参数>"
        continue
      }

      out += next
      index += 2
      continue
    }

    if (char === "(") {
      const end = readUntil(")", index + 1)
      if (end === -1) {
        index += 1
        continue
      }
      const inner = source.slice(index + 1, end)
      const optional = source[end + 1] === "?"
      const parts = inner.split("|").map(item => item.trim()).filter(Boolean)
      let picked = parts[0] || ""
      if (parts.length > 1) {
        picked =
          parts.find(item => !/[.*+?[\]{}\\]/.test(item) && item.length >= 2) ||
          parts.find(item => !/[.*+?[\]{}\\]/.test(item)) ||
          picked
      }
      picked = picked
        .replace(/\\s\*|\\s\+/g, " ")
        .replace(/\\d\+/g, "<数字>")
        .replace(/\\w\+/g, "<参数>")
        .replace(/\\S\+/g, "<参数>")
        .replace(/\.\+/g, "<参数>")
        .replace(/\.\*/g, "<参数>")
      if (!(optional && !picked.includes("<") && !picked.includes(" "))) {
        out += picked
      }
      index = end + 1
      if (source[index] === "?") index += 1
      continue
    }

    if (char === "[") {
      const end = source.indexOf("]", index + 1)
      if (end === -1) {
        index += 1
        continue
      }
      out += "<参数>"
      index = end + 1
      while (/[+*?]/.test(source[index] || "")) index += 1
      continue
    }

    if (char === ".") {
      const next = source[index + 1]
      if (next === "+" || next === "*") {
        out += "<参数>"
        index += 2
        if (source[index] === "?") index += 1
        continue
      }
      out += "."
      index += 1
      continue
    }

    if (/[+*?]/.test(char)) {
      index += 1
      continue
    }

    out += char
    index += 1
  }

  out = out
    .replace(/\s+/g, " ")
    .replace(/\\+/g, "")
    .replace(/\(\?:/g, "")
    .trim()

  if (!out || /[\[\]{}]/.test(out)) return ""
  return out
}

function toCatalogItems(items = []) {
  return (Array.isArray(items) ? items : []).map(item => ({
    ...(item && typeof item === "object" ? item : {}),
    source: item?.source || "xunlu",
  }))
}

export async function buildCommandCatalog(items = [], options = {}) {
  const ignored = new Set((options?.ignoredPlugins || []).map(item => String(item || "").trim()).filter(Boolean))
  const catalog = []
  const seen = new Set()
  let yunzaiItems = []

  if (options?.includeYunzai !== false) {
    try {
      yunzaiItems = await listYunzaiCommandsForAi({ ctx: options?.ctx })
    } catch (error) {
      getDispatchLogger().warn?.(
        "[ai-dispatch] failed to build yunzai command catalog:",
        error?.stack || error?.message || error,
      )
    }
  }

  const sourceItems = [...toCatalogItems(items), ...toCatalogItems(yunzaiItems)]

  for (const item of sourceItems) {
    const source = normalizeCatalogSource(item?.source)
    const plugin = String(item?.plugin || item?.name || "").trim()
    const reg = String(item?.reg || "").trim()
    const event = String(item?.event || "message").trim().toLowerCase()
    if (!reg || ignored.has(plugin) || !event.startsWith("message")) continue

    const help = isPlainObject(item?.help) ? item.help : null
    const example = clampText(pickItemExample(item) || pickHelpExample(help) || autoExampleFromReg(reg), 80)
    if (!example) continue
    const desc = clampText(pickItemDesc(item) || pickHelpDesc(help), 90)
    const key = `${source}::${plugin}::${example}`
    if (seen.has(key)) continue
    seen.add(key)

    catalog.push({
      source,
      plugin,
      reg,
      event,
      example,
      desc,
      priority: normalizeCatalogPriority(item?.priority),
      highRisk: isHighRiskCommand(example),
    })
  }

  catalog.sort(
    (a, b) =>
      Number(a.source !== "xunlu") - Number(b.source !== "xunlu") ||
      a.plugin.localeCompare(b.plugin) ||
      a.priority - b.priority ||
      a.example.localeCompare(b.example),
  )
  return catalog
}

function filterCatalogByDecision(catalog = [], { source = "", plugin = "" } = {}) {
  const requestedSource = normalizeMatchText(source).toLowerCase()
  const requestedPlugin = normalizeMatchText(plugin).toLowerCase()
  return catalog.filter(item => {
    if (requestedSource && normalizeCatalogSource(item?.source) !== requestedSource) return false
    if (requestedPlugin && String(item?.plugin || "").trim().toLowerCase() !== requestedPlugin) return false
    return true
  })
}

function scoreCatalogMatch(item, { requestedSource = "", requestedPlugin = "" } = {}) {
  const source = normalizeCatalogSource(item?.source)
  const plugin = String(item?.plugin || "").trim().toLowerCase()
  return [
    requestedSource ? Number(source !== requestedSource) : Number(source !== "xunlu"),
    requestedPlugin ? Number(plugin !== requestedPlugin) : 0,
    normalizeCatalogPriority(item?.priority),
    plugin,
    normalizeMatchText(item?.example),
  ]
}

function compareCatalogMatches(a, b, context = {}) {
  const scoreA = scoreCatalogMatch(a, context)
  const scoreB = scoreCatalogMatch(b, context)
  for (let index = 0; index < scoreA.length; index += 1) {
    if (scoreA[index] < scoreB[index]) return -1
    if (scoreA[index] > scoreB[index]) return 1
  }
  return 0
}

export function listCatalogMatches(catalog = [], { displayCommand = "", commandText = "", source = "", plugin = "" } = {}) {
  const requestedSource = normalizeMatchText(source).toLowerCase()
  const requestedPlugin = normalizeMatchText(plugin).toLowerCase()
  const filteredCatalog = filterCatalogByDecision(catalog, { source: requestedSource, plugin: requestedPlugin })
  const commandCandidates = new Set([displayCommand, commandText].map(normalizeMatchText).filter(Boolean))
  const sortContext = { requestedSource, requestedPlugin }
  const matches = []
  const seen = new Set()

  const appendMatches = items => {
    for (const item of items) {
      const key = [
        normalizeCatalogSource(item?.source),
        normalizeMatchText(item?.plugin).toLowerCase(),
        normalizeMatchText(item?.reg),
        normalizeMatchText(item?.example),
      ].join("::")
      if (seen.has(key)) continue
      seen.add(key)
      matches.push(item)
    }
  }

  appendMatches(
    filteredCatalog
      .filter(item => commandCandidates.has(normalizeMatchText(item?.example)))
      .sort((a, b) => compareCatalogMatches(a, b, sortContext)),
  )

  appendMatches(
    filteredCatalog
      .filter(item => {
        try {
          return new RegExp(String(item?.reg || "")).test(commandText)
        } catch {
          return false
        }
      })
      .sort((a, b) => compareCatalogMatches(a, b, sortContext)),
  )

  return matches
}

function pickCatalogMatch(catalog = [], { displayCommand = "", commandText = "", source = "", plugin = "" } = {}) {
  return (
    listCatalogMatches(catalog, {
      displayCommand,
      commandText,
      source,
      plugin,
    })[0] || null
  )
}

export function validateCommandDecision({ decision, catalog, ctx, config }) {
  const displayCommand = String(decision?.command || "").trim()
  if (!displayCommand) {
    return {
      ok: false,
      reason: "empty_command",
      needsClarify: false,
      question: "我还不确定要执行哪条命令，你想让我具体做什么？",
    }
  }

  let commandText = displayCommand
  let rawSegments = null

  if (/^@bot\b/i.test(commandText)) {
    commandText = commandText.replace(/^@bot\b/i, "").trim()
    if (!commandText) {
      return {
        ok: false,
        reason: "missing_atbot_command",
        needsClarify: true,
        question: "你想让我替你执行哪条 @bot 指令？",
      }
    }
    if (!ctx?.self_id) {
      return {
        ok: false,
        reason: "missing_self_id",
        needsClarify: true,
        question: "这条指令需要先明确当前 bot 身份后才能执行，你可以再试一次吗？",
      }
    }
    rawSegments = [UniversalMessageSegment.mention(ctx?.self_id), UniversalMessageSegment.text(` ${commandText}`)]
  } else {
    rawSegments = [UniversalMessageSegment.text(commandText)]
  }

  if (commandText.length > Math.max(8, Number(config?.max_command_length || 120))) {
    return {
      ok: false,
      reason: "command_too_long",
      needsClarify: false,
      question: "我理解到的指令太长了，你可以再说得更具体一点吗？",
    }
  }

  if (isIncompleteHighRiskCommand(displayCommand)) {
    return {
      ok: false,
      reason: "high_risk_incomplete",
      needsClarify: true,
      question: buildClarifyQuestion(displayCommand),
    }
  }

  const match = pickCatalogMatch(catalog, {
    displayCommand,
    commandText,
    source: decision?.source,
    plugin: decision?.plugin,
  })

  if (!match) {
    const highRisk = isHighRiskCommand(displayCommand)
    return {
      ok: false,
      reason: highRisk ? "no_match_high_risk" : "no_match",
      needsClarify: highRisk,
      question: decision?.question || buildClarifyQuestion(displayCommand),
    }
  }

  return {
    ok: true,
    prepared: {
      displayCommand,
      commandText,
      rawSegments,
      match,
      source: match?.source || normalizeCatalogSource(decision?.source),
    },
  }
}

export function inferCommandFromUserText({ userText, catalog, ctx, config }) {
  const text = normalizeMatchText(userText)
  if (!text) return null

  const candidates = buildNaturalCommandCandidates(text)
  const hasIntent = hasNaturalCommandIntent(text)
  const matches = []

  for (const candidate of candidates) {
    const validated = validateCommandDecision({
      decision: { command: candidate },
      catalog,
      ctx,
      config,
    })
    if (!validated?.ok) continue
    const wrapped = hasNaturalCommandIntent(candidate)
    matches.push({
      candidate,
      prepared: validated.prepared,
      score: [
        Number(wrapped),
        Number(candidate === text && wrapped),
        Number(validated.prepared?.match?.source !== "xunlu"),
        normalizeCatalogPriority(validated.prepared?.match?.priority),
        candidate.length,
      ],
    })
  }

  matches.sort((a, b) => {
    for (let index = 0; index < a.score.length; index += 1) {
      if (a.score[index] < b.score[index]) return -1
      if (a.score[index] > b.score[index]) return 1
    }
    return 0
  })

  const best = matches[0]
  if (!best) return null

  if (!hasIntent && best.candidate === text && text.length > Math.max(12, Number(config?.max_command_length || 120) * 0.2)) {
    return null
  }

  return best.prepared
}

export function describePreparedCommand(prepared = {}) {
  const displayCommand = normalizeMatchText(prepared?.displayCommand)
  const commandText = normalizeMatchText(prepared?.commandText)
  if (/^@bot\b/i.test(displayCommand) && commandText) return commandText
  return displayCommand || commandText
}
