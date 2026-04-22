import { renderUniversalSegments, UniversalMessageSegment } from "../../../Bot/message/index.js"
import { invokeYunzaiCommandByText, listYunzaiCommandsForAi } from "../../../Bot/yunzai/command-bridge.js"
import { listCatalogMatches } from "./dispatcher-catalog.js"
import {
  buildNaturalCommandCandidates,
  clampText,
  getDispatchLogger,
  normalizeCatalogSource,
  normalizeMatchText,
} from "./dispatcher-shared.js"

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
