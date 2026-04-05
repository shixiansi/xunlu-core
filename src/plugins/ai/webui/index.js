import cfg from "../../../lib/config.js"
import { DEFAULT_FALLBACK_PERSONA_PROMPT } from "../../ai-dispatch/model/persona.js"

function toNumber(value, fallback) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function normalizeWakeWords(value) {
  const list = Array.isArray(value) ? value : [value]
  return list
    .map(item => String(item || "").trim())
    .filter(Boolean)
}

function normalizeBoolean(value, fallback = true) {
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

function maskSecret(value) {
  const text = String(value || "").trim()
  if (!text) return "未配置"
  if (text.length <= 8) return `${text.slice(0, 2)}***`
  return `${text.slice(0, 4)}***${text.slice(-3)}`
}

function getAiValues() {
  const config = cfg.getConfig("ai") || {}
  const caimiao = config?.caimiao && typeof config.caimiao === "object" ? config.caimiao : {}
  const siliconflow = config?.siliconflow && typeof config.siliconflow === "object" ? config.siliconflow : {}

  return {
    caimiao: {
      "x-token": String(caimiao["x-token"] || ""),
      proxy: String(caimiao.proxy || ""),
    },
    siliconflow: {
      base_url: String(siliconflow.base_url || "https://api.siliconflow.cn/v1/chat/completions"),
      api_key: String(
        siliconflow.api_key || process.env.XUNLU_SILICONFLOW_API_KEY || process.env.SILICONFLOW_API_KEY || "",
      ),
      model: String(siliconflow.model || "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B"),
      timeout_ms: Math.max(5000, Math.floor(toNumber(siliconflow.timeout_ms, 30000))),
      max_history: Math.max(1, Math.floor(toNumber(siliconflow.max_history, 8))),
      trigger_mode: String(siliconflow.trigger_mode || "mention_or_wake"),
      wake_words: normalizeWakeWords(siliconflow.wake_words || ["寻路", "寻路bot", "xunlu", "xunlubot"]).join(", "),
      fallback_persona_enabled: normalizeBoolean(siliconflow.fallback_persona_enabled, true),
      fallback_persona_prompt: normalizeMultilineText(
        siliconflow.fallback_persona_prompt,
        DEFAULT_FALLBACK_PERSONA_PROMPT,
      ),
    },
  }
}

function getAiSummary() {
  const values = getAiValues()
  return [
    `菜苗 ${values.caimiao["x-token"] ? "已配置" : "未配置"}`,
    `SiliconFlow ${maskSecret(values.siliconflow.api_key)}`,
    `模型 ${values.siliconflow.model}`,
  ].join(" | ")
}

function saveAiValues(values = {}) {
  const current = getAiValues()
  const next = {
    caimiao: {
      "x-token": String(values?.caimiao?.["x-token"] ?? current.caimiao["x-token"] ?? "").trim(),
      proxy: String(values?.caimiao?.proxy ?? current.caimiao.proxy ?? "").trim(),
    },
    siliconflow: {
      base_url: String(values?.siliconflow?.base_url ?? current.siliconflow.base_url ?? "").trim(),
      api_key: String(values?.siliconflow?.api_key ?? current.siliconflow.api_key ?? "").trim(),
      model: String(values?.siliconflow?.model ?? current.siliconflow.model ?? "").trim(),
      timeout_ms: Math.max(
        5000,
        Math.floor(toNumber(values?.siliconflow?.timeout_ms ?? current.siliconflow.timeout_ms, 30000)),
      ),
      max_history: Math.max(
        1,
        Math.floor(toNumber(values?.siliconflow?.max_history ?? current.siliconflow.max_history, 8)),
      ),
      trigger_mode: String(
        values?.siliconflow?.trigger_mode ?? current.siliconflow.trigger_mode ?? "mention_or_wake",
      ).trim(),
      wake_words: normalizeWakeWords(
        String(values?.siliconflow?.wake_words ?? current.siliconflow.wake_words ?? "")
          .split(/[,\n]/g)
          .map(item => item.trim()),
      ),
      fallback_persona_enabled: normalizeBoolean(
        values?.siliconflow?.fallback_persona_enabled ?? current.siliconflow.fallback_persona_enabled,
        true,
      ),
      fallback_persona_prompt: normalizeMultilineText(
        values?.siliconflow?.fallback_persona_prompt ?? current.siliconflow.fallback_persona_prompt,
        DEFAULT_FALLBACK_PERSONA_PROMPT,
      ),
    },
  }

  cfg.getConfigReader("ai").setData(next)
  return next
}

export default {
  meta: {
    title: "AI",
    description: "统一管理现有 AI 插件和 AI 指令调度使用的服务配置。",
    order: 15,
    tags: ["ai", "token"],
  },

  definition: {
    sections: [
      {
        id: "caimiao",
        scope: "global",
        title: "菜苗配置",
        fields: [
          {
            path: "caimiao.x-token",
            label: "x-token",
            type: "text",
            allowEmpty: true,
            description: "用于调用 anuneko / 菜苗接口的访问令牌。",
          },
          {
            path: "caimiao.proxy",
            label: "代理地址",
            type: "text",
            allowEmpty: true,
            placeholder: "http://127.0.0.1:7890",
            description: "可选，留空表示直连。",
          },
        ],
      },
      {
        id: "siliconflow",
        scope: "global",
        title: "AI 指令调度",
        fields: [
          {
            path: "siliconflow.base_url",
            label: "接口地址",
            type: "text",
            allowEmpty: false,
            description: "SiliconFlow chat completions 接口地址。",
          },
          {
            path: "siliconflow.api_key",
            label: "API Key",
            type: "text",
            allowEmpty: true,
            description: "为空时可改用环境变量 XUNLU_SILICONFLOW_API_KEY / SILICONFLOW_API_KEY。",
          },
          {
            path: "siliconflow.model",
            label: "模型名",
            type: "text",
            allowEmpty: false,
          },
          {
            path: "siliconflow.timeout_ms",
            label: "超时毫秒",
            type: "number",
            min: 5000,
          },
          {
            path: "siliconflow.max_history",
            label: "历史轮数",
            type: "number",
            min: 1,
          },
          {
            path: "siliconflow.trigger_mode",
            label: "群聊触发模式",
            type: "select",
            options: [
              { label: "提及或唤醒词", value: "mention_or_wake" },
              { label: "仅提及", value: "mention_only" },
              { label: "仅唤醒词", value: "wake_only" },
              { label: "总是触发", value: "always" },
            ],
          },
          {
            path: "siliconflow.wake_words",
            label: "唤醒词",
            type: "text",
            allowEmpty: true,
            placeholder: "寻路, 寻路bot, xunlu",
            description: "多个唤醒词用逗号分隔。",
          },
          {
            path: "siliconflow.fallback_persona_enabled",
            label: "启用人格兜底",
            type: "boolean",
            description: "开启后，非命令型场景会用 Atri 人设生成回复。",
          },
          {
            path: "siliconflow.fallback_persona_prompt",
            label: "人格 Prompt",
            type: "textarea",
            rows: 18,
            allowEmpty: true,
            description: "编辑 AI 指令调度在非命令场景下使用的完整 persona prompt。",
          },
        ],
      },
    ],
  },

  async getValues() {
    return {
      values: getAiValues(),
      meta: {
        summary: getAiSummary(),
      },
    }
  },

  async updateValues({ values = {} } = {}) {
    saveAiValues(values)
    return {
      values: getAiValues(),
      meta: {
        summary: getAiSummary(),
      },
      message: "AI 配置已保存",
    }
  },
}
