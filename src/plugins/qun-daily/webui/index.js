import { getQunDailyConfig, saveQunDailyConfig } from "../model/config.js"

const RANGE_OPTIONS = [
  { label: "1 天", value: 1 },
  { label: "3 天", value: 3 },
  { label: "7 天", value: 7 },
  { label: "30 天", value: 30 },
]

function getSummary() {
  const config = getQunDailyConfig()
  const sections = []
  if (config.push.include_stats) sections.push("统计")
  if (config.push.include_words) sections.push("词频")
  if (config.push.include_commands) sections.push("指令")

  return [
    `日报 ${config.push.enabled ? "开启" : "关闭"}`,
    `cron ${config.push.cron}`,
    `推送 ${sections.join("/") || "无"}`,
    `默认区间 ${config.command_defaults.stats_days}/${config.command_defaults.words_days}/${config.command_defaults.command_days} 天`,
  ].join(" | ")
}

export default {
  meta: {
    title: "群日报",
    description: "统一管理 qun-daily 的日报推送和手动查询默认时间范围。",
    order: 52,
    tags: ["stats", "report"],
  },

  definition: {
    sections: [
      {
        id: "push",
        scope: "global",
        title: "日报推送",
        description: "cron 改动在下次重载插件或重启后会重新注册定时任务。",
        fields: [
          { path: "push.enabled", label: "启用日报推送", type: "boolean" },
          {
            path: "push.cron",
            label: "日报 cron",
            type: "text",
            placeholder: "0 5 0 * * *",
            description: "使用 6 段 cron 表达式。",
          },
          { path: "push.include_stats", label: "推送消息统计", type: "boolean" },
          { path: "push.include_words", label: "推送词频统计", type: "boolean" },
          { path: "push.include_commands", label: "推送指令统计", type: "boolean" },
        ],
      },
      {
        id: "commands",
        scope: "global",
        title: "手动查询默认范围",
        fields: [
          {
            path: "command_defaults.stats_days",
            label: "消息统计默认天数",
            type: "select",
            options: RANGE_OPTIONS,
          },
          {
            path: "command_defaults.words_days",
            label: "词频统计默认天数",
            type: "select",
            options: RANGE_OPTIONS,
          },
          {
            path: "command_defaults.command_days",
            label: "指令统计默认天数",
            type: "select",
            options: RANGE_OPTIONS,
          },
        ],
      },
    ],
  },

  async getValues() {
    return {
      values: getQunDailyConfig(),
      meta: {
        summary: getSummary(),
      },
    }
  },

  async updateValues({ values = {} } = {}) {
    const before = getQunDailyConfig()
    const saved = saveQunDailyConfig(values)
    const reloadHint = before.push.cron !== saved.push.cron ? "，新的 cron 需重载插件后生效" : ""

    return {
      values: getQunDailyConfig(),
      meta: {
        summary: getSummary(),
      },
      message: `qun-daily 配置已保存${reloadHint}`,
    }
  },
}
