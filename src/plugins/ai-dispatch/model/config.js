import cfg from "../../../lib/config.js"

import { DEFAULT_FALLBACK_PERSONA_PROMPT } from "./persona.js"

const DEFAULTS = Object.freeze({
  siliconflow: {
    base_url: "https://api.siliconflow.cn/v1/chat/completions",
    api_key: "",
    model: "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B",
    timeout_ms: 30000,
    max_history: 8,
    trigger_mode: "mention_or_wake",
    wake_words: ["寻路", "寻路bot", "xunlu", "xunlubot"],
    fallback_persona_enabled: true,
    fallback_persona_prompt: DEFAULT_FALLBACK_PERSONA_PROMPT,
  },
  session_ttl_sec: 1800,
  max_prompt_chars: 6000,
  max_command_length: 120,
})

function toNumber(value, fallback) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function normalizeTriggerMode(value) {
  const mode = String(value || "").trim().toLowerCase()
  if (["mention_only", "wake_only", "mention_or_wake", "always"].includes(mode)) return mode
  return DEFAULTS.siliconflow.trigger_mode
}

function normalizeWakeWords(value) {
  const list = Array.isArray(value) ? value : [value]
  return list
    .map(item => String(item || "").trim())
    .filter(Boolean)
}

function normalizeBoolean(value, fallback) {
  if (typeof value === "boolean") return value
  const text = String(value || "").trim().toLowerCase()
  if (["true", "1", "yes", "on"].includes(text)) return true
  if (["false", "0", "no", "off"].includes(text)) return false
  return fallback
}

function normalizeMultilineText(value, fallback) {
  const text = String(value ?? "").replace(/\r\n/g, "\n")
  return text.trim() ? text : fallback
}

export function getAiDispatchConfig() {
  const raw = cfg.getConfig("ai") || {}
  const siliconflow = raw?.siliconflow && typeof raw.siliconflow === "object" ? raw.siliconflow : {}
  const wakeWords = normalizeWakeWords(siliconflow.wake_words)

  return {
    siliconflow: {
      base_url: String(siliconflow.base_url || DEFAULTS.siliconflow.base_url).trim(),
      api_key: String(
        siliconflow.api_key ||
          process.env.XUNLU_SILICONFLOW_API_KEY ||
          process.env.SILICONFLOW_API_KEY ||
          DEFAULTS.siliconflow.api_key,
      ).trim(),
      model: String(siliconflow.model || DEFAULTS.siliconflow.model).trim(),
      timeout_ms: Math.max(5000, Math.floor(toNumber(siliconflow.timeout_ms, DEFAULTS.siliconflow.timeout_ms))),
      max_history: Math.max(
        1,
        Math.min(20, Math.floor(toNumber(siliconflow.max_history, DEFAULTS.siliconflow.max_history))),
      ),
      trigger_mode: normalizeTriggerMode(siliconflow.trigger_mode),
      wake_words: wakeWords.length ? wakeWords : [...DEFAULTS.siliconflow.wake_words],
      fallback_persona_enabled: normalizeBoolean(
        siliconflow.fallback_persona_enabled,
        DEFAULTS.siliconflow.fallback_persona_enabled,
      ),
      fallback_persona_prompt: normalizeMultilineText(
        siliconflow.fallback_persona_prompt,
        DEFAULTS.siliconflow.fallback_persona_prompt,
      ),
    },
    session_ttl_sec: Math.max(60, Math.floor(toNumber(raw?.session_ttl_sec, DEFAULTS.session_ttl_sec))),
    max_prompt_chars: Math.max(1200, Math.floor(toNumber(raw?.max_prompt_chars, DEFAULTS.max_prompt_chars))),
    max_command_length: Math.max(8, Math.floor(toNumber(raw?.max_command_length, DEFAULTS.max_command_length))),
  }
}
