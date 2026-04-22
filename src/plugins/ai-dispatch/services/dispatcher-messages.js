import {
  clampText,
  hasWakeWord,
  stripWakeWords,
  totalLength,
} from "./dispatcher-shared.js"

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
    "{\"type\":\"command\",\"command\":\"...\",\"confidence\":0-1,\"reason_code\":\"...\"}",
    "{\"type\":\"command\",\"command\":\"...\",\"source\":\"xunlu|yunzai\",\"plugin\":\"...\",\"confidence\":0-1,\"reason_code\":\"...\"}",
    "{\"type\":\"non_command\",\"reply\":\"...\",\"confidence\":0-1,\"reason_code\":\"...\"}",
    "{\"type\":\"clarify\",\"question\":\"...\",\"confidence\":0-1,\"reason_code\":\"...\"}",
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
