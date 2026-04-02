import {
  getConfig,
  getEffectiveGroupConfig,
  getSafeConfig,
  setGroupOverrides,
  updateGlobalConfig,
} from "../model/config.js"
import { getHeatSnapshot } from "../controllers/handlers.js"

function triStateField(path, label, description = "") {
  return {
    path,
    label,
    type: "select",
    description,
    options: [
      { label: "跟随全局", value: "inherit" },
      { label: "开启", value: "true" },
      { label: "关闭", value: "false" },
    ],
  }
}

function fromTriState(value) {
  if (value === "inherit" || value === undefined || value === null || value === "") return null
  return value === true || value === "true"
}

function toTriState(value) {
  if (value === undefined || value === null) return "inherit"
  return value ? "true" : "false"
}

function buildGroupScopes() {
  const cfg = getConfig()
  const heats = getHeatSnapshot()
  const heatMap = new Map(heats.map(item => [String(item.group_id), item]))
  const ids = new Set([
    ...Object.keys(cfg?.groups || {}),
    ...heats.map(item => String(item.group_id)),
  ])

  return Array.from(ids)
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b)))
    .map(groupId => {
      const heat = heatMap.get(String(groupId))
      const today = Number(heat?.messagesToday || 0)
      return {
        id: String(groupId),
        label: String(groupId),
        description: today ? `今日消息 ${today}` : "",
      }
    })
}

function buildGroupSummary(groupId) {
  const effective = getEffectiveGroupConfig(groupId)
  return [
    `当前群号 ${groupId}`,
    `学习 ${effective.learning_enabled ? "开启" : "关闭"}`,
    `主动发言 ${effective.proactive_enabled ? "开启" : "关闭"}`,
    `主动指令 ${effective.proactive_command_enabled ? "开启" : "关闭"}`,
    `reply_prob ${effective.reply_prob}`,
  ].join(" | ")
}

function pickGlobalValues() {
  const cfg = getSafeConfig()
  return {
    learning: {
      enabled_default: cfg.learning.enabled_default,
      reply_threshold: cfg.learning.reply_threshold,
      max_learn_count: cfg.learning.max_learn_count,
      cross_group_min_groups: cfg.learning.cross_group_min_groups,
      reply_prob: cfg.learning.reply_prob,
      reply_cooldown_sec: cfg.learning.reply_cooldown_sec,
      learn_max_gap_sec: cfg.learning.learn_max_gap_sec,
      min_text_len: cfg.learning.min_text_len,
      block_words: cfg.learning.block_words || [],
      block_users: cfg.learning.block_users || [],
    },
    repeat: {
      enable: cfg.repeat.enable,
      threshold: cfg.repeat.threshold,
      max_window_sec: cfg.repeat.max_window_sec,
      require_distinct_users: cfg.repeat.require_distinct_users,
      min_text_len: cfg.repeat.min_text_len,
    },
    proactive: {
      enable: cfg.proactive.enable,
      allow_default: cfg.proactive.allow_default,
      min_messages_today: cfg.proactive.min_messages_today,
      silence_factor: cfg.proactive.silence_factor,
      min_silence_sec: cfg.proactive.min_silence_sec,
      min_interval_sec: cfg.proactive.min_interval_sec,
      backoff_base_sec: cfg.proactive.backoff_base_sec,
      backoff_max_exp: cfg.proactive.backoff_max_exp,
      batch_min: cfg.proactive.batch_min,
      batch_max: cfg.proactive.batch_max,
      command_enable: cfg.proactive.command_enable,
      command_history_days: cfg.proactive.command_history_days,
      command_min_count: cfg.proactive.command_min_count,
      command_cooldown_sec: cfg.proactive.command_cooldown_sec,
      command_recent_manual_sec: cfg.proactive.command_recent_manual_sec,
      command_recent_user_hours: cfg.proactive.command_recent_user_hours,
      command_max_daily_per_user: cfg.proactive.command_max_daily_per_user,
      command_whitelist: cfg.proactive.command_whitelist || [],
    },
  }
}

function pickGroupValues(groupId) {
  const cfg = getConfig()
  const override = cfg?.groups?.[String(groupId)] || {}
  return {
    learning_enabled: toTriState(override.learning_enabled),
    proactive_enabled: toTriState(override.proactive_enabled),
    proactive_command_enabled: toTriState(override.proactive_command_enabled),
    reply_prob: override.reply_prob ?? null,
    block_words: override.block_words || [],
    block_users: override.block_users || [],
  }
}

export default {
  meta: {
    title: "学习聊天",
    description: "统一管理 learning_chat 的学习、复读和主动发言参数。",
    order: 10,
    tags: ["chat", "learning"],
  },

  definition: {
    sections: [
      {
        id: "learning_global",
        scope: "global",
        title: "学习与回复",
        fields: [
          { path: "learning.enabled_default", label: "默认允许学习", type: "boolean" },
          { path: "learning.reply_threshold", label: "回复阈值", type: "number", min: 1 },
          { path: "learning.max_learn_count", label: "最大学习次数", type: "number", min: 1 },
          { path: "learning.cross_group_min_groups", label: "跨群最小群数", type: "number", min: 1 },
          { path: "learning.reply_prob", label: "回复概率", type: "number", min: 0, max: 1, step: 0.01 },
          { path: "learning.reply_cooldown_sec", label: "回复冷却秒数", type: "number", min: 0 },
          { path: "learning.learn_max_gap_sec", label: "学习最大间隔秒数", type: "number", min: 0 },
          { path: "learning.min_text_len", label: "最小文本长度", type: "number", min: 0 },
          { path: "learning.block_words", label: "全局屏蔽词", type: "array", rows: 6 },
          { path: "learning.block_users", label: "全局屏蔽用户", type: "array", rows: 6 },
        ],
      },
      {
        id: "repeat_global",
        scope: "global",
        title: "复读策略",
        fields: [
          { path: "repeat.enable", label: "启用复读检测", type: "boolean" },
          { path: "repeat.threshold", label: "复读阈值", type: "number", min: 2 },
          { path: "repeat.max_window_sec", label: "统计窗口秒数", type: "number", min: 1 },
          { path: "repeat.require_distinct_users", label: "要求不同用户", type: "boolean" },
          { path: "repeat.min_text_len", label: "最小文本长度", type: "number", min: 0 },
        ],
      },
      {
        id: "proactive_global",
        scope: "global",
        title: "主动发言",
        fields: [
          { path: "proactive.enable", label: "启用主动发言", type: "boolean" },
          { path: "proactive.allow_default", label: "默认允许群触发", type: "boolean" },
          { path: "proactive.min_messages_today", label: "今日最小消息数", type: "number", min: 0 },
          { path: "proactive.silence_factor", label: "静默因子", type: "number", min: 1 },
          { path: "proactive.min_silence_sec", label: "最小静默秒数", type: "number", min: 0 },
          { path: "proactive.min_interval_sec", label: "最小发送间隔秒数", type: "number", min: 0 },
          { path: "proactive.backoff_base_sec", label: "退避基准秒数", type: "number", min: 0 },
          { path: "proactive.backoff_max_exp", label: "退避指数上限", type: "number", min: 0 },
          { path: "proactive.batch_min", label: "最小批量条数", type: "number", min: 1 },
          { path: "proactive.batch_max", label: "最大批量条数", type: "number", min: 1 },
          { path: "proactive.command_enable", label: "启用主动指令", type: "boolean" },
          { path: "proactive.command_history_days", label: "指令历史天数", type: "number", min: 1 },
          { path: "proactive.command_min_count", label: "主动指令最小命中次数", type: "number", min: 1 },
          { path: "proactive.command_cooldown_sec", label: "主动指令冷却秒数", type: "number", min: 0 },
          { path: "proactive.command_recent_manual_sec", label: "最近人工触发保护秒数", type: "number", min: 0 },
          { path: "proactive.command_recent_user_hours", label: "最近用户活跃小时数", type: "number", min: 1 },
          { path: "proactive.command_max_daily_per_user", label: "单用户日上限", type: "number", min: 1 },
          { path: "proactive.command_whitelist", label: "主动指令白名单", type: "array", rows: 8 },
        ],
      },
      {
        id: "group_overrides",
        scope: "group",
        title: "群级覆盖",
        emptyText: "还没有生成群级数据，先让插件在目标群里运行一段时间。",
        fields: [
          triStateField("learning_enabled", "学习开关", "支持继承全局默认值"),
          triStateField("proactive_enabled", "主动发言开关"),
          triStateField("proactive_command_enabled", "主动指令开关"),
          {
            path: "reply_prob",
            label: "群级回复概率覆盖",
            type: "number",
            min: 0,
            max: 1,
            step: 0.01,
            allowEmpty: true,
            description: "留空表示继承全局概率",
          },
          { path: "block_words", label: "群级屏蔽词", type: "array", rows: 6 },
          { path: "block_users", label: "群级屏蔽用户", type: "array", rows: 6 },
        ],
      },
    ],
  },

  async listScopes({ scope }) {
    if (scope !== "group") return []
    return buildGroupScopes()
  },

  async getValues({ scope = "global", scopeId = "" } = {}) {
    if (scope === "group") {
      const groupId = String(scopeId || "").trim()
      if (!groupId) return { values: {}, meta: {} }
      return {
        values: pickGroupValues(groupId),
        meta: {
          summary: buildGroupSummary(groupId),
        },
      }
    }

    return {
      values: pickGlobalValues(),
      meta: {},
    }
  },

  async updateValues({ scope = "global", scopeId = "", values = {} } = {}) {
    if (scope === "group") {
      const groupId = String(scopeId || "").trim()
      await setGroupOverrides(groupId, {
        learning_enabled: fromTriState(values.learning_enabled),
        proactive_enabled: fromTriState(values.proactive_enabled),
        proactive_command_enabled: fromTriState(values.proactive_command_enabled),
        reply_prob: values.reply_prob === null ? null : values.reply_prob,
        block_words: values.block_words || [],
        block_users: values.block_users || [],
      })

      return {
        values: pickGroupValues(groupId),
        meta: {
          summary: buildGroupSummary(groupId),
        },
        message: `learning_chat 群 ${groupId} 配置已保存`,
      }
    }

    await updateGlobalConfig(values)
    return {
      values: pickGlobalValues(),
      meta: {},
      message: "learning_chat 全局配置已保存",
    }
  },
}
