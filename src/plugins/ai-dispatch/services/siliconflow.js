import axios from "axios"

function clampConfidence(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return undefined
  if (num < 0) return 0
  if (num > 1) return 1
  return num
}

function normalizeCommandSource(value) {
  const source = String(value || "").trim().toLowerCase()
  if (source === "xunlu" || source === "yunzai") return source
  return undefined
}

function createSiliconflowError(kind, message, cause, extra = {}) {
  const error = new Error(message || cause?.message || "siliconflow request failed")
  error.name = "SiliconflowError"
  error.kind = kind
  if (cause) error.cause = cause
  Object.assign(error, extra)
  return error
}

function extractJsonText(rawText) {
  const text = String(rawText || "").trim()
  if (!text) throw createSiliconflowError("parse", "empty model response")

  const unfenced = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()

  const start = unfenced.indexOf("{")
  const end = unfenced.lastIndexOf("}")
  if (start === -1 || end === -1 || end < start) {
    throw createSiliconflowError("parse", "model response did not contain JSON", null, { rawText: text })
  }

  return unfenced.slice(start, end + 1)
}

function normalizeDecisionPayload(raw = {}) {
  const type = String(raw?.type || "").trim().toLowerCase()
  const reasonCode = String(raw?.reason_code || raw?.reasonCode || "").trim()
  const confidence = clampConfidence(raw?.confidence)

  if (type === "command") {
    return {
      type,
      command: String(raw?.command || "").trim(),
      source: normalizeCommandSource(raw?.source),
      plugin: String(raw?.plugin || "").trim() || undefined,
      confidence,
      reason_code: reasonCode,
    }
  }

  if (type === "clarify") {
    return {
      type,
      question: String(raw?.question || "").trim(),
      confidence,
      reason_code: reasonCode,
    }
  }

  if (type === "non_command") {
    return {
      type,
      reply: String(raw?.reply || "").trim(),
      confidence,
      reason_code: reasonCode,
    }
  }

  throw createSiliconflowError("parse", `unsupported decision type: ${type || "unknown"}`, null, { raw })
}

async function readStreamText(stream) {
  return await new Promise((resolve, reject) => {
    let buffer = ""
    let pending = ""

    const flushLine = line => {
      const text = String(line || "").trim()
      if (!text || !text.startsWith("data:")) return
      const payload = text.replace(/^data:\s*/, "")
      if (!payload || payload === "[DONE]") return

      const parsed = JSON.parse(payload)
      const choice = parsed?.choices?.[0] || {}
      const delta = choice?.delta?.content
      const message = choice?.message?.content
      const textChunk = choice?.text
      const next = delta ?? message ?? textChunk ?? ""
      if (next) buffer += String(next)
    }

    stream.on("data", chunk => {
      pending += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk)
      let index = pending.indexOf("\n")
      while (index !== -1) {
        const line = pending.slice(0, index)
        pending = pending.slice(index + 1)
        try {
          flushLine(line)
        } catch (error) {
          reject(createSiliconflowError("parse", error?.message || "failed to parse response stream", error))
          return
        }
        index = pending.indexOf("\n")
      }
    })

    stream.on("end", () => {
      if (pending.trim()) {
        try {
          flushLine(pending)
        } catch (error) {
          reject(createSiliconflowError("parse", error?.message || "failed to parse response stream", error))
          return
        }
      }
      resolve(buffer.trim())
    })

    stream.on("error", error => reject(createSiliconflowError("transport", error?.message, error)))
  })
}

async function collectResponseText(data) {
  if (!data) return ""
  if (typeof data === "string") return data.trim()
  if (Buffer.isBuffer(data)) return data.toString("utf8").trim()
  if (typeof data?.on === "function") return await readStreamText(data)

  const choice = data?.choices?.[0] || {}
  return String(choice?.message?.content || choice?.text || "").trim()
}

function isRetryable(error) {
  const status = Number(error?.response?.status || 0)
  if (status >= 500) return true
  const code = String(error?.code || "").toUpperCase()
  return ["ECONNRESET", "ECONNABORTED", "ETIMEDOUT"].includes(code)
}

async function requestSiliconflowCompletion({
  config,
  messages = [],
  transport = axios,
  maxAttempts = 2,
  temperature = 0.2,
  responseFormat,
} = {}) {
  let lastError = null

  for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt += 1) {
    try {
      const body = {
        model: String(config?.model || "").trim(),
        messages,
        stream: true,
        temperature,
      }
      if (responseFormat) body.response_format = responseFormat

      const response = await transport.post(
        String(config?.base_url || "").trim(),
        body,
        {
          headers: {
            "Content-Type": "application/json",
            ...(config?.api_key ? { Authorization: `Bearer ${config.api_key}` } : {}),
          },
          responseType: "stream",
          timeout: Number(config?.timeout_ms || 30000),
        },
      )

      return await collectResponseText(response?.data)
    } catch (error) {
      lastError = error?.kind ? error : createSiliconflowError("transport", error?.message, error)
      if (attempt >= maxAttempts || !isRetryable(error)) break
    }
  }

  throw lastError || createSiliconflowError("transport", "siliconflow request failed")
}

export async function requestSiliconflowDecision({
  config,
  messages = [],
  transport = axios,
  maxAttempts = 2,
} = {}) {
  const rawText = await requestSiliconflowCompletion({
    config,
    messages,
    transport,
    maxAttempts,
    temperature: 0.2,
    responseFormat: { type: "json_object" },
  })

  try {
    return {
      rawText,
      decision: parseSiliconflowDecision(rawText),
    }
  } catch (error) {
    if (error?.kind === "parse") throw error
    throw createSiliconflowError("parse", error?.message || "failed to parse decision", error, { rawText })
  }
}

export async function requestSiliconflowTextReply({
  config,
  messages = [],
  transport = axios,
  maxAttempts = 2,
  temperature = 0.85,
} = {}) {
  const rawText = await requestSiliconflowCompletion({
    config,
    messages,
    transport,
    maxAttempts,
    temperature,
  })

  const text = String(rawText || "").trim()
  if (!text) {
    throw createSiliconflowError("parse", "empty model response", null, { rawText })
  }

  return {
    rawText,
    text,
  }
}

export function parseSiliconflowDecision(rawText) {
  const jsonText = extractJsonText(rawText)
  return normalizeDecisionPayload(JSON.parse(jsonText))
}

export function getSiliconflowErrorKind(error) {
  return String(error?.kind || "").trim().toLowerCase()
}

export function isSiliconflowTransportError(error) {
  return getSiliconflowErrorKind(error) === "transport"
}
