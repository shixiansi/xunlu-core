import { getAiDispatchConfig } from "../model/config.js"
import { LOCAL_PERSONA_UNAVAILABLE_REPLY } from "../model/persona.js"
import { appendSessionTurn, ensureSession, peekSession, resetSessions, updateSessionState } from "../model/session-store.js"
import {
  buildCommandCatalog,
  buildDispatcherMessages,
  buildPersonaMessages,
  describePreparedCommand,
  executeCatalogCommand,
  inferCommandFromUserText,
  normalizeIncomingUserText,
  shouldHandleDispatch,
  summarizeSentMessages,
  validateCommandDecision,
} from "../services/dispatcher.js"
import {
  getSiliconflowErrorKind,
  isSiliconflowTransportError,
  requestSiliconflowDecision,
  requestSiliconflowTextReply,
} from "../services/siliconflow.js"

function getLogger() {
  return globalThis.xunluCore?.services?.logger || console
}

function safeListCommands(ctx) {
  try {
    return typeof ctx?.listCommands === "function" ? ctx.listCommands() : []
  } catch {
    return []
  }
}

function isPersonaEnabled(config) {
  return config?.siliconflow?.fallback_persona_enabled !== false
}

function buildFallbackReply(error) {
  const message = String(error?.message || error || "")
  if (/timeout|ECONNABORTED|ETIMEDOUT/i.test(message)) {
    return "AI 指令调度这次超时了，你可以再说一次。"
  }
  return "AI 指令调度暂时不可用，你可以换种说法再试一次。"
}

function clampExecutionSummary(command, ok) {
  if (ok) return `已尝试执行：${String(command || "").trim()}`
  return `执行失败：${String(command || "").trim()}`
}

async function executePreparedCommand({ ctx, session, config, userText, prepared, confidence, reasonCode }) {
  appendSessionTurn(session, "user", userText, config)
  const executed = await executeCatalogCommand(ctx, prepared)
  const commandLabel = describePreparedCommand({
    ...prepared,
    commandText: executed?.executedCommand || prepared?.commandText,
  })
  const summary = summarizeSentMessages(executed.sentMessages) || clampExecutionSummary(commandLabel, executed.ok)

  appendSessionTurn(
    session,
    "assistant",
    `已执行指令：${commandLabel}\n插件回复摘要：${summary}`,
    config,
  )
  updateSessionState(session, {
    pendingClarify: false,
    lastResult: {
      type: "command",
      command: commandLabel,
      confidence,
      reason_code: reasonCode || "command",
    },
  })

  if (!executed.ok) {
    return await ctx.reply(`我理解到的命令是“${commandLabel}”，但执行失败了，你可以换种说法再试一次。`)
  }

  if (!executed.sentMessages.length) {
    return await ctx.reply(`已为你执行：${commandLabel}`)
  }

  return true
}

async function buildPersonaReply({ config, session, userText }) {
  const personaMessages = buildPersonaMessages({ session, userText, config })
  const result = await requestSiliconflowTextReply({
    config: config.siliconflow,
    messages: personaMessages,
  })
  return String(result?.text || "").trim()
}

async function replyWithPersona({ ctx, session, config, userText, reasonCode = "persona_fallback" }) {
  let reply = LOCAL_PERSONA_UNAVAILABLE_REPLY

  try {
    const generated = await buildPersonaReply({ config, session, userText })
    if (generated) reply = generated
  } catch (error) {
    getLogger().warn?.("[ai-dispatch] persona fallback failed:", error?.stack || error?.message || error)
  }

  appendSessionTurn(session, "user", userText, config)
  appendSessionTurn(session, "assistant", reply, config)
  updateSessionState(session, {
    pendingClarify: false,
    lastResult: {
      type: "non_command",
      reply,
      reason_code: reasonCode,
    },
  })
  return await ctx.reply(reply)
}

async function replyWithUnavailableFallback({ ctx, session, config, userText, reasonCode, error }) {
  const reply = isPersonaEnabled(config) ? LOCAL_PERSONA_UNAVAILABLE_REPLY : buildFallbackReply(error)
  appendSessionTurn(session, "user", userText, config)
  appendSessionTurn(session, "assistant", reply, config)
  updateSessionState(session, {
    pendingClarify: false,
    lastResult: {
      type: "error",
      reason_code: reasonCode,
    },
  })
  return await ctx.reply(reply)
}

async function handleDispatch(ctx) {
  const config = getAiDispatchConfig()
  const session = peekSession(ctx, config)

  if (!shouldHandleDispatch({ ctx, config, session })) return false
  if (!config?.siliconflow?.api_key) return false

  const activeSession = ensureSession(ctx, config)
  const catalog = await buildCommandCatalog(safeListCommands(ctx), {
    ctx,
    ignoredPlugins: ["ai-dispatch"],
  })
  const userText = normalizeIncomingUserText({ ctx, config, session: activeSession })
  const directlyInferredCommand = inferCommandFromUserText({
    userText,
    catalog,
    ctx,
    config,
  })

  if (directlyInferredCommand) {
    return await executePreparedCommand({
      ctx,
      session: activeSession,
      config,
      userText,
      prepared: directlyInferredCommand,
      reasonCode: "direct_inferred_command",
    })
  }

  const messages = buildDispatcherMessages({
    ctx,
    session: activeSession,
    catalog,
    userText,
    config,
  })

  let modelResult
  try {
    modelResult = await requestSiliconflowDecision({
      config: config.siliconflow,
      messages,
    })
  } catch (error) {
    const errorKind = getSiliconflowErrorKind(error) || "transport_error"
    if (isPersonaEnabled(config) && !isSiliconflowTransportError(error)) {
      return await replyWithPersona({
        ctx,
        session: activeSession,
        config,
        userText,
        reasonCode: errorKind,
      })
    }
    return await replyWithUnavailableFallback({
      ctx,
      session: activeSession,
      config,
      userText,
      reasonCode: errorKind,
      error,
    })
  }

  const decision = modelResult?.decision || {}
  const decisionType = String(decision?.type || "").trim().toLowerCase()
  const inferredPrepared =
    decisionType === "command"
      ? null
      : inferCommandFromUserText({
          userText,
          catalog,
          ctx,
          config,
        })

  if (inferredPrepared) {
    return await executePreparedCommand({
      ctx,
      session: activeSession,
      config,
      userText,
      prepared: inferredPrepared,
      confidence: decision?.confidence,
      reasonCode: decision?.reason_code || "inferred_from_user_text",
    })
  }

  if (decisionType === "command") {
    const validated = validateCommandDecision({ decision, catalog, ctx, config })

    if (!validated.ok) {
      const inferredFromOriginalText = inferCommandFromUserText({
        userText,
        catalog,
        ctx,
        config,
      })
      if (inferredFromOriginalText) {
        return await executePreparedCommand({
          ctx,
          session: activeSession,
          config,
          userText,
          prepared: inferredFromOriginalText,
          confidence: decision?.confidence,
          reasonCode: decision?.reason_code || validated.reason || "inferred_from_user_text",
        })
      }

      if (isPersonaEnabled(config) && !validated.needsClarify) {
        return await replyWithPersona({
          ctx,
          session: activeSession,
          config,
          userText,
          reasonCode: validated.reason || decision?.reason_code || "unmatched_command",
        })
      }

      const question = String(validated.question || "我还需要一点额外信息。").trim() || "我还需要一点额外信息。"
      appendSessionTurn(activeSession, "user", userText, config)
      appendSessionTurn(activeSession, "assistant", question, config)
      updateSessionState(activeSession, {
        pendingClarify: true,
        lastResult: {
          type: "clarify",
          question,
          reason_code: validated.reason || decision?.reason_code || "validation_failed",
        },
      })
      return await ctx.reply(question)
    }

    return await executePreparedCommand({
      ctx,
      session: activeSession,
      config,
      userText,
      prepared: validated.prepared,
      confidence: decision?.confidence,
      reasonCode: decision?.reason_code || "command",
    })
  }

  if (decisionType === "clarify") {
    const question = String(decision?.question || "我还需要一点额外信息。").trim() || "我还需要一点额外信息。"
    appendSessionTurn(activeSession, "user", userText, config)
    appendSessionTurn(activeSession, "assistant", question, config)
    updateSessionState(activeSession, {
      pendingClarify: true,
      lastResult: {
        type: "clarify",
        question,
        confidence: decision?.confidence,
        reason_code: decision?.reason_code || "clarify",
      },
    })
    return await ctx.reply(question)
  }

  if (isPersonaEnabled(config)) {
    return await replyWithPersona({
      ctx,
      session: activeSession,
      config,
      userText,
      reasonCode: decision?.reason_code || "non_command",
    })
  }

  const reply = String(decision?.reply || "").trim() || "我在。"
  appendSessionTurn(activeSession, "user", userText, config)
  appendSessionTurn(activeSession, "assistant", reply, config)
  updateSessionState(activeSession, {
    pendingClarify: false,
    lastResult: {
      type: "non_command",
      reply,
      confidence: decision?.confidence,
      reason_code: decision?.reason_code || "chat",
    },
  })
  return await ctx.reply(reply)
}

export function register(bot) {
  if (!bot || typeof bot.registerCommand !== "function") return

  bot.registerCommand(["", 99999, { key: "ai-dispatch" }], async ctx => {
    try {
      return await handleDispatch(ctx)
    } catch (error) {
      getLogger().warn?.("[ai-dispatch] unexpected error:", error?.stack || error?.message || error)
      return false
    }
  })
}

export function __resetAiDispatchSessionsForTests() {
  resetSessions()
}
