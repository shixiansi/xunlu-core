import { renderUniversalSegments, UniversalMessageSegment } from "../../../Bot/message/index.js"
import { invokeYunzaiCommandByText, listYunzaiCommandsForAi } from "../../../Bot/yunzai/command-bridge.js"

function getDispatchLogger() {
  return globalThis.logger || console
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
}

function clampText(text, maxLen = 120) {
  const value = String(text || "").trim()
  if (!value) return ""
  if (value.length <= maxLen) return value
  return `${value.slice(0, Math.max(1, maxLen - 3))}...`
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

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

function normalizeCatalogSource(value) {
  const source = String(value || "").trim().toLowerCase()
  return source === "yunzai" ? "yunzai" : "xunlu"
}

function normalizeMatchText(value) {
  return String(value || "").trim()
}

function normalizeCatalogPriority(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 5000
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

function totalLength(items = []) {
  return items.reduce((sum, item) => sum + String(item || "").length, 0)
}

function hasWakeWord(text, wakeWords = []) {
  const value = String(text || "").trim()
  if (!value) return false
  return wakeWords.some(word => {
    const pattern = new RegExp(`^${escapeRegExp(word)}(?:[\\s,，。！？?]|$)`, "i")
    return pattern.test(value)
  })
}

function stripWakeWords(text, wakeWords = []) {
  let value = String(text || "").trim()
  for (const word of wakeWords) {
    const pattern = new RegExp(`^${escapeRegExp(word)}(?:[\\s,，。！？?]*)`, "i")
    value = value.replace(pattern, "").trim()
  }
  return value
}

function isHighRiskCommand(text) {
  return /^(#)?(禁言|解禁|踢黑|设置管理|取消管理|全体禁言|全体解禁|修改头衔|发好友|发群聊|发群列表|退出群|寻路强制更新|寻路更新|设置日志等级)/.test(
    String(text || "").trim(),
  )
}

function isIncompleteHighRiskCommand(text) {
  const value = String(text || "").trim()
  if (!isHighRiskCommand(value)) return false
  if (/^(#)?(全体禁言|全体解禁|寻路更新|寻路强制更新|寻路更新日志)/.test(value)) return false
  if (/禁言/.test(value)) {
    return !(/@|\b\d{5,}\b/.test(value) && /(\d+\s*(秒|分钟|小时|天)|\d+[smhd])/i.test(value))
  }
  if (/(解禁|踢黑|设置管理|取消管理)/.test(value)) {
    return !(/@|\b\d{5,}\b/.test(value))
  }
  if (/修改头衔/.test(value)) {
    const body = value.replace(/^#?修改头衔/, "").trim()
    return !(/@|\b\d{5,}\b/.test(body) && /\s+\S+/.test(body))
  }
  if (/(发好友|发群聊|发群列表)/.test(value)) {
    return value.split(/\s+/).filter(Boolean).length < 3
  }
  return false
}

function buildClarifyQuestion(command = "") {
  const value = String(command || "").trim()
  if (/禁言/.test(value)) return "你要禁言谁，多久？"
  if (/解禁/.test(value)) return "你要解除谁的禁言？"
  if (/踢黑/.test(value)) return "你要操作谁？"
  if (/(设置管理|取消管理)/.test(value)) return "你要对哪位成员执行这个管理操作？"
  if (/修改头衔/.test(value)) return "你要给谁修改头衔，改成什么？"
  if (/(发好友|发群聊|发群列表)/.test(value)) return "你要发给谁，内容是什么？"
  return "我还差一点关键信息，你想让我具体执行什么？"
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

export function shouldHandleDispatch({ ctx, config, session }) {
  if (!ctx || ctx?.__skipAiDispatch) return false
  if (String(ctx?.post_type || "").toLowerCase() !== "message") return false
  if (!ctx?.user_id || String(ctx?.user_id) === String(ctx?.self_id)) return false
  if (!String(ctx?.msg || "").trim()) return false

  if (ctx?.isPrivate || !ctx?.group_id) return true
  if (session?.pendingClarify) return true

  const mode = String(config?.siliconflow?.trigger_mode || "mention_or_wake")
  const mentioned = Boolean(ctx?.atBot)
  const wakeTriggered = hasWakeWord(ctx?.msg, config?.siliconflow?.wake_words)

  if (mode === "always") return true
  if (mode === "mention_only") return mentioned
  if (mode === "wake_only") return wakeTriggered
  return mentioned || wakeTriggered
}

export function normalizeIncomingUserText({ ctx, config, session }) {
  const wakeWords = config?.siliconflow?.wake_words || []
  let text = String(ctx?.msg || "").trim()

  if (ctx?.group_id && !session?.pendingClarify) {
    text = stripWakeWords(text, wakeWords)
  }

  if (ctx?.atBot && text) {
    return `@bot ${text}`.trim()
  }

  return text || String(ctx?.msg || "").trim()
}

export function buildDispatcherMessages({ ctx, session, catalog, userText, config }) {
  const history = Array.isArray(session?.history)
    ? session.history.slice(-Number(config?.siliconflow?.max_history || 8) * 2)
    : []
  const commandLines = []

  for (const item of catalog) {
    const line = `- ${item.example} [source:${item.source}, plugin:${item.plugin || "unknown"}]${
      item.desc ? ` - ${item.desc}` : ""
    }`
    commandLines.push(line)
    if (totalLength(commandLines) > Math.max(800, Number(config?.max_prompt_chars || 6000) * 0.45)) {
      commandLines.pop()
      break
    }
  }

  const systemPrompt = [
    "你是寻路 Bot 的 AI 指令调度器。",
    "你只做三选一决策：command、non_command、clarify。",
    "1. command：把用户自然语言映射成一条可以直接执行的最终命令。",
    "2. non_command：当用户是在闲聊、问候、日常对话时，只需要判断为 non_command，reply 可以简短占位。",
    "3. clarify：当参数不足、对象不明确，或高风险管理命令信息不完整时，先追问一句。",
    "",
    "输出必须是单个 JSON 对象，禁止 Markdown，禁止代码块，禁止额外解释。",
    '{"type":"command","command":"...","confidence":0-1,"reason_code":"..."}',
    '{"type":"command","command":"...","source":"xunlu|yunzai","plugin":"...","confidence":0-1,"reason_code":"..."}',
    '{"type":"non_command","reply":"...","confidence":0-1,"reason_code":"..."}',
    '{"type":"clarify","question":"...","confidence":0-1,"reason_code":"..."}',
    "",
    "规则：",
    "- command 只能从下面命令清单里挑选最合适的一条最终命令，不能编造新命令。",
    "- 优先输出用户能直接发送的示例命令，不要输出 reg。",
    "- 学习聊天相关命令如果示例带 @bot，输出时也必须保留 @bot 前缀。",
    "- 如果存在同名命令且你能判断来源，请补充 source 和 plugin。",
    "- 高风险管理命令如果缺对象、缺时长、缺目标群或缺内容，必须输出 clarify。",
    "- 如果更像普通聊天，不要硬凑命令，输出 non_command。",
    "",
    `当前场景：${ctx?.group_id ? "group" : "private"}`,
    `当前是否 @bot：${ctx?.atBot ? "yes" : "no"}`,
    "",
    "当前可用命令示例：",
    commandLines.join("\n") || "- 帮助",
  ].join("\n")

  return [
    { role: "system", content: systemPrompt },
    ...history.map(item => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: clampText(item.content, 480),
    })),
    { role: "user", content: clampText(userText, 480) },
  ]
}

export function buildPersonaMessages({ session, userText, config }) {
  const history = Array.isArray(session?.history)
    ? session.history.slice(-Number(config?.siliconflow?.max_history || 8) * 2)
    : []
  const personaPrompt = String(config?.siliconflow?.fallback_persona_prompt || "").trim()
  const systemPrompt = [
    personaPrompt,
    "",
    "补充要求：",
    "- 只输出直接发给用户的回复正文，不要输出 JSON、代码块或系统说明。",
    "- 结合当前对话历史自然接续，不要暴露内部调度、插件或模型细节。",
    "- 只有当用户明确要求“查看日志”或“写日记”时，才使用日志格式。",
  ]
    .filter(Boolean)
    .join("\n")

  return [
    { role: "system", content: systemPrompt },
    ...history.map(item => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: clampText(item.content, 480),
    })),
    { role: "user", content: clampText(userText, 480) },
  ]
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

function listCatalogMatches(catalog = [], { displayCommand = "", commandText = "", source = "", plugin = "" } = {}) {
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

const NATURAL_COMMAND_PREFIX_PATTERNS = [
  /^(?:请|麻烦|帮我|帮忙|给我|替我|我想|我要|想|想要|我想要|我想看|我要看|想看|给我看|帮我看|帮我查|查一下|查询|打开|显示|看看|看下|看一下|看一看|来个|来一张|来张|整一个)\s*/i,
]

const SAFE_NATURAL_COMMAND_PREFIXES = [
  "\u8bf7",
  "\u9ebb\u70e6",
  "\u5e2e\u6211",
  "\u5e2e\u5fd9",
  "\u5e2e\u6211\u53d1\u4e00\u4e0b",
  "\u5e2e\u6211\u53d1\u4e0b",
  "\u5e2e\u6211\u53d1\u4e2a",
  "\u5e2e\u6211\u53d1",
  "\u7ed9\u6211",
  "\u7ed9\u6211\u53d1\u4e00\u4e0b",
  "\u7ed9\u6211\u53d1\u4e0b",
  "\u7ed9\u6211\u53d1\u4e2a",
  "\u7ed9\u6211\u53d1",
  "\u66ff\u6211",
  "\u6211\u60f3\u8981",
  "\u6211\u60f3\u770b",
  "\u6211\u8981\u770b",
  "\u6211\u8981",
  "\u6211\u60f3",
  "\u60f3\u8981",
  "\u60f3\u770b",
  "\u60f3",
  "\u7ed9\u6211\u770b",
  "\u5e2e\u6211\u770b",
  "\u5e2e\u6211\u67e5",
  "\u67e5\u4e00\u4e0b",
  "\u67e5\u8be2",
  "\u6253\u5f00",
  "\u663e\u793a",
  "\u770b\u4e00\u4e2a",
  "\u770b\u4e00\u4e0b",
  "\u770b\u4e00\u770b",
  "\u770b\u4e0b",
  "\u770b\u770b",
  "\u770b",
  "\u53d1\u4e00\u4e0b",
  "\u53d1\u4e0b",
  "\u53d1\u4e00\u5f20",
  "\u53d1\u5f20",
  "\u53d1\u4e2a",
  "\u53d1",
  "\u6765\u4e00\u5f20",
  "\u6765\u5f20",
  "\u6765\u4e2a",
  "\u6574\u4e00\u4e2a",
]

const SAFE_NATURAL_COMMAND_PREFIX_PATTERNS = [
  new RegExp(
    `^(?:${SAFE_NATURAL_COMMAND_PREFIXES
      .slice()
      .sort((a, b) => b.length - a.length)
      .map(item => escapeRegExp(item))
      .join("|")})\\s*`,
    "i",
  ),
]

const POSSESSIVE_COMMAND_SUFFIXES = [
  "\u9762\u677f",
  "\u9762\u7248",
  "\u8be6\u7ec6",
  "\u8be6\u60c5",
  "\u5723\u9057\u7269",
  "\u9057\u5668",
  "\u6b66\u5668[1-7]?",
  "\u4f24\u5bb3(?:[1-9]\\d*)?",
]

const POSSESSIVE_COMMAND_PATTERN = new RegExp(
  `^(.*?)(?:\\s*\u7684\\s*)(${POSSESSIVE_COMMAND_SUFFIXES.join("|")})$`,
  "i",
)

function buildNaturalCommandCandidates(userText = "") {
  const baseText = normalizeMatchText(userText)
  const candidates = new Set()
  if (!baseText) return []

  const queue = [baseText]
  while (queue.length) {
    const current = queue.shift()
    if (!current || candidates.has(current)) continue
    candidates.add(current)

    const withoutTail = current.replace(/[。！？!?,，\s]+$/g, "").trim()
    if (withoutTail && withoutTail !== current && !candidates.has(withoutTail)) {
      queue.push(withoutTail)
    }

    for (const pattern of SAFE_NATURAL_COMMAND_PREFIX_PATTERNS) {
      const next = current.replace(pattern, "").trim()
      if (next && next !== current && !candidates.has(next)) {
        queue.push(next)
      }
    }

    const possessiveMatch = POSSESSIVE_COMMAND_PATTERN.exec(current)
    if (possessiveMatch) {
      const normalized = `${String(possessiveMatch[1] || "").trim()}${String(possessiveMatch[2] || "").trim()}`
      if (normalized && normalized !== current && !candidates.has(normalized)) {
        queue.push(normalized)
      }
    }
  }

  return [...candidates]
}

function hasNaturalCommandIntent(userText = "") {
  const text = normalizeMatchText(userText)
  if (!text) return false
  if (/^[#*@]/.test(text)) return true
  return SAFE_NATURAL_COMMAND_PREFIX_PATTERNS.some(pattern => pattern.test(text))
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

function createCatalogExecutionContext(ctx, prepared, sentMessages) {
  const baseCtx = ctx && typeof ctx === "object" ? ctx : {}
  const fallbackSegments = [UniversalMessageSegment.text(prepared?.commandText || "")]
  const rawSegments = Array.isArray(prepared?.rawSegments) ? prepared.rawSegments : fallbackSegments
  const execCtx = Object.create(baseCtx)

  Object.assign(execCtx, {
    rawSegments,
    message: rawSegments,
    raw_message: String(prepared?.commandText || "").trim(),
    msg: String(prepared?.commandText || "").trim(),
    __skipAiDispatch: true,
    __skipLearning: true,
    __commandUsageSource: "ai-dispatch",
  })

  if (typeof baseCtx?.reply === "function") {
    execCtx.reply = async function wrappedReply(...args) {
      if (args.length >= 1) sentMessages.push(args[0])
      return await baseCtx.reply.apply(baseCtx, args)
    }
  }

  if (typeof baseCtx?.sendMessage === "function") {
    execCtx.sendMessage = async function wrappedSendMessage(...args) {
      if (args.length >= 2) sentMessages.push(args[1])
      return await baseCtx.sendMessage.apply(baseCtx, args)
    }
  }

  if (typeof baseCtx?.renderImg === "function") {
    execCtx.renderImg = async function wrappedRenderImg(...args) {
      return await baseCtx.renderImg(...args)
    }
  }

  return execCtx
}

function buildCatalogMatchKey(match = {}) {
  return [
    normalizeCatalogSource(match?.source),
    normalizeMatchText(match?.plugin).toLowerCase(),
    normalizeMatchText(match?.reg),
  ].join("::")
}

function isRetryableYunzaiMissReason(reason = "") {
  const normalized = String(reason || "").trim().toLowerCase()
  return normalized === "no-match" || normalized === "no-reg-match" || normalized === "no-plugin"
}

async function invokePreparedYunzaiCommand(prepared, execCtx, sentMessages) {
  const attemptCommands = [prepared?.commandText, ...buildNaturalCommandCandidates(prepared?.commandText)].filter(Boolean)
  const seen = new Set()
  let lastResult = false
  let attemptedCommand = String(prepared?.commandText || "").trim()
  let attemptedMatch = prepared?.match || null

  const attemptMatch = async (commandText, match) => {
    const normalized = String(commandText || "").trim()
    const matchKey = buildCatalogMatchKey(match)
    const attemptKey = `${normalized}::${matchKey}`
    if (!normalized || seen.has(attemptKey)) return null
    seen.add(attemptKey)
    attemptedCommand = normalized
    attemptedMatch = match || null

    const result = await invokeYunzaiCommandByText(normalized, execCtx, {
      plugin: match?.plugin,
      reg: match?.reg,
      preferParentReply: true,
      skipCooldown: true,
    })
    lastResult = result

    if (Boolean(result?.ok || sentMessages.length > 0)) {
      return {
        result,
        attemptedCommand,
        attemptedMatch,
      }
    }

    if (!isRetryableYunzaiMissReason(result?.reason)) {
      return {
        result,
        attemptedCommand,
        attemptedMatch,
      }
    }

    return null
  }

  for (const commandText of attemptCommands) {
    const matched = await attemptMatch(commandText, prepared?.match)
    if (matched) return matched
  }

  let yunzaiCatalog = []
  try {
    yunzaiCatalog = await listYunzaiCommandsForAi({ ctx: execCtx })
  } catch (error) {
    getDispatchLogger().warn?.(
      "[ai-dispatch] failed to refresh yunzai catalog for retry:",
      error?.stack || error?.message || error,
    )
  }

  const originalMatchKey = buildCatalogMatchKey(prepared?.match)
  for (const commandText of attemptCommands) {
    const alternativeMatches = listCatalogMatches(yunzaiCatalog, {
      displayCommand: commandText,
      commandText,
      source: "yunzai",
    }).filter(match => buildCatalogMatchKey(match) !== originalMatchKey)

    for (const match of alternativeMatches) {
      getDispatchLogger().info?.(
        "[ai-dispatch] retrying yunzai command with alternative plugin match:",
        commandText,
        "->",
        `${match?.plugin || "unknown"} ${match?.reg || ""}`.trim(),
      )
      const retried = await attemptMatch(commandText, match)
      if (retried) return retried
    }
  }

  return {
    result: lastResult,
    attemptedCommand,
    attemptedMatch,
  }
}

export async function executeCatalogCommand(ctx, prepared) {
  const sentMessages = []
  const execCtx = createCatalogExecutionContext(ctx, prepared, sentMessages)

  try {
    const yunzaiExecution =
      prepared?.match?.source === "yunzai"
        ? await invokePreparedYunzaiCommand(prepared, execCtx, sentMessages)
        : null
    const result =
      prepared?.match?.source === "yunzai"
        ? yunzaiExecution?.result
        : await ctx.invokeCommandByText.call(execCtx, prepared.commandText)

    if (prepared?.match?.source === "yunzai" && !result?.ok && !sentMessages.length) {
      getDispatchLogger().warn?.(
        "[ai-dispatch] yunzai command execution did not produce a reply:",
        yunzaiExecution?.attemptedCommand || prepared?.commandText,
        result?.reason || "unknown",
      )
    }

    return {
      ok:
        prepared?.match?.source === "yunzai"
          ? Boolean(result?.ok || sentMessages.length > 0)
          : result !== false || sentMessages.length > 0,
      result,
      executedCommand: yunzaiExecution?.attemptedCommand || prepared?.commandText,
      sentMessages,
      replySummary: summarizeSentMessages(sentMessages),
    }
  } catch (error) {
    getDispatchLogger().warn?.(
      "[ai-dispatch] command execution failed:",
      prepared?.commandText,
      error?.stack || error?.message || error,
    )
    return {
      ok: false,
      error,
      sentMessages,
      replySummary: summarizeSentMessages(sentMessages),
    }
  }
}

export function summarizeSentMessages(messages = []) {
  const parts = []
  for (const item of Array.isArray(messages) ? messages : []) {
    if (typeof item === "string") {
      parts.push(String(item))
      continue
    }
    if (Array.isArray(item)) {
      parts.push(renderUniversalSegments(item))
      continue
    }
    if (item && typeof item === "object" && Array.isArray(item.message)) {
      parts.push(renderUniversalSegments(item.message))
      continue
    }
    parts.push(clampText(JSON.stringify(item), 120))
  }

  const summary = clampText(parts.filter(Boolean).join(" | "), 180)
  return summary || ""
}
