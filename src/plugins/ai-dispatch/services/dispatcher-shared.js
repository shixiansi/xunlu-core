export function getDispatchLogger() {
  return globalThis.xunluCore?.services?.logger || console
}

export function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
}

export function clampText(text, maxLen = 120) {
  const value = String(text || "").trim()
  if (!value) return ""
  if (value.length <= maxLen) return value
  return `${value.slice(0, Math.max(1, maxLen - 3))}...`
}

export function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function normalizeCatalogSource(value) {
  const source = String(value || "").trim().toLowerCase()
  return source === "yunzai" ? "yunzai" : "xunlu"
}

export function normalizeMatchText(value) {
  return String(value || "").trim()
}

export function normalizeCatalogPriority(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 5000
}

export function totalLength(items = []) {
  return items.reduce((sum, item) => sum + String(item || "").length, 0)
}

export function hasWakeWord(text, wakeWords = []) {
  const value = String(text || "").trim()
  if (!value) return false
  return wakeWords.some(word => {
    const pattern = new RegExp(`^${escapeRegExp(word)}(?:[\\s,，。！？?]|$)`, "i")
    return pattern.test(value)
  })
}

export function stripWakeWords(text, wakeWords = []) {
  let value = String(text || "").trim()
  for (const word of wakeWords) {
    const pattern = new RegExp(`^${escapeRegExp(word)}(?:[\\s,，。！？?]*)`, "i")
    value = value.replace(pattern, "").trim()
  }
  return value
}

export function isHighRiskCommand(text) {
  return /^(#)?(禁言|解禁|踢黑|设置管理|取消管理|全体禁言|全体解禁|修改头衔|发好友|发群聊|发群列表|退出群|寻路强制更新|寻路更新|设置日志等级)/.test(
    String(text || "").trim(),
  )
}

export function isIncompleteHighRiskCommand(text) {
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

export function buildClarifyQuestion(command = "") {
  const value = String(command || "").trim()
  if (/禁言/.test(value)) return "你要禁言谁，多久？"
  if (/解禁/.test(value)) return "你要解除谁的禁言？"
  if (/踢黑/.test(value)) return "你要操作谁？"
  if (/(设置管理|取消管理)/.test(value)) return "你要对哪位成员执行这个管理操作？"
  if (/修改头衔/.test(value)) return "你要给谁修改头衔，改成什么？"
  if (/(发好友|发群聊|发群列表)/.test(value)) return "你要发给谁，内容是什么？"
  return "我还差一点关键信息，你想让我具体执行什么？"
}

const SAFE_NATURAL_COMMAND_PREFIXES = [
  "请",
  "麻烦",
  "帮我",
  "帮忙",
  "帮我发一下",
  "帮我发下",
  "帮我发个",
  "帮我发",
  "给我",
  "给我发一下",
  "给我发下",
  "给我发个",
  "给我发",
  "替我",
  "我想要",
  "我想看",
  "我要看",
  "我要",
  "我想",
  "想要",
  "想看",
  "想",
  "给我看",
  "帮我看",
  "帮我查",
  "查一下",
  "查询",
  "打开",
  "显示",
  "看一个",
  "看一下",
  "看一看",
  "看下",
  "看看",
  "看",
  "发一下",
  "发下",
  "发一张",
  "发张",
  "发个",
  "发",
  "来一张",
  "来张",
  "来个",
  "整一个",
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
  "面板",
  "面版",
  "详细",
  "详情",
  "圣遗物",
  "遗器",
  "武器[1-7]?",
  "伤害(?:[1-9]\\d*)?",
]

const POSSESSIVE_COMMAND_PATTERN = new RegExp(
  `^(.*?)(?:\\s*的\\s*)(${POSSESSIVE_COMMAND_SUFFIXES.join("|")})$`,
  "i",
)

export function buildNaturalCommandCandidates(userText = "") {
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

export function hasNaturalCommandIntent(userText = "") {
  const text = normalizeMatchText(userText)
  if (!text) return false
  if (/^[#*@]/.test(text)) return true
  return SAFE_NATURAL_COMMAND_PREFIX_PATTERNS.some(pattern => pattern.test(text))
}
