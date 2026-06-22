import fs from "node:fs"
import path from "node:path"
import { getRuntimePaths } from "../../../runtime/runtime-context.js"

function getBilibiliConfigPath() {
  return path.join(getRuntimePaths().rootDir, "data", "bilibili", "config.json")
}

function getBilibiliGroupDataDir() {
  return path.join(getRuntimePaths().rootDir, "data", "bilibili", "group")
}

function readBilibiliConfig() {
  try {
    const p = getBilibiliConfigPath()
    if (!fs.existsSync(p)) return {}
    return JSON.parse(fs.readFileSync(p, "utf8"))
  } catch {
    return {}
  }
}

function writeBilibiliConfig(cfg) {
  const p = getBilibiliConfigPath()
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2), "utf8")
}

function listBilibiliGroupIds() {
  try {
    const dir = getBilibiliGroupDataDir()
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir)
      .filter(f => f.endsWith(".json"))
      .map(f => f.replace(".json", ""))
      .sort((a, b) => String(a).localeCompare(String(b)))
  } catch {
    return []
  }
}

function getBilibiliValues() {
  const cfg = readBilibiliConfig()
  return {
    cookie: String(cfg.cookie || ""),
    push_interval_sec: Number(cfg.push_interval_sec || 300),
    default_video_qn: Number(cfg.default_video_qn || 80),
    dynamic_forward_enabled: cfg.dynamic_forward_enabled !== false,
    live_push_mode: String(cfg.live_push_mode || "image"),
    live_at_all: Boolean(cfg.live_at_all),
  }
}

function getGroupLiveValues(groupId) {
  const cfg = readBilibiliConfig()
  const override = cfg?.groups?.[String(groupId)] || {}
  return {
    live_push_mode: String(override.live_push_mode || "inherit"),
    live_at_all: String(override.live_at_all !== undefined
      ? (override.live_at_all ? "true" : "false")
      : "inherit"),
  }
}

function getGroupLiveSummary(groupId) {
  const cfg = readBilibiliConfig()
  const override = cfg?.groups?.[String(groupId)] || {}
  const effectiveMode = override.live_push_mode || cfg.live_push_mode || "image"
  const effectiveAtAll = override.live_at_all !== undefined ? override.live_at_all : Boolean(cfg.live_at_all)
  return [
    `群 ${groupId}`,
    `推送模式 ${effectiveMode === "text" ? "文字" : "图片"}`,
    `@全体 ${effectiveAtAll ? "开启" : "关闭"}`,
  ].join(" | ")
}

export default {
  meta: {
    title: "B站管理",
    description: "管理B站 Cookie（扫码登录）、动态推送频率和视频默认画质。",
    order: 50,
    tags: ["bilibili", "media"],
  },

  definition: {
    sections: [
      {
        id: "auth",
        scope: "global",
        title: "B站登录",
        description: "粘贴 B站 Cookie 字符串以登录（使用 b站扫码 命令获取）。包含 SESSDATA、bili_jct 等关键字段即可。",
        fields: [
          {
            path: "cookie",
            label: "B站 Cookie",
            type: "textarea",
            rows: 6,
            allowEmpty: true,
            description: "从扫码获取的完整 Cookie 字符串。",
          },
        ],
      },
      {
        id: "push",
        scope: "global",
        title: "动态推送",
        description: "控制 B站 UP 主动态推送的轮询频率。",
        fields: [
          {
            path: "push_interval_sec",
            label: "轮询间隔（秒）",
            type: "number",
            min: 60,
            max: 3600,
            description: "推荐 300 秒（5分钟），最小 60 秒。",
          },
          {
            path: "dynamic_forward_enabled",
            label: "启用动态转发",
            type: "boolean",
            description: "开启后将推送的 B站动态以转发消息形式发送。",
          },
        ],
      },
      {
        id: "live_push",
        scope: "global",
        title: "直播推送",
        description: "控制开播推送的消息格式和 @全体成员 行为。",
        fields: [
          {
            path: "live_push_mode",
            label: "推送模式",
            type: "select",
            options: [
              { label: "图片推送", value: "image" },
              { label: "文字推送", value: "text" },
            ],
            description: "图片推送发送渲染卡片，文字推送仅发送纯文本摘要。",
          },
          {
            path: "live_at_all",
            label: "@全体成员",
            type: "boolean",
            description: "开启后推送开播消息时自动 @全体成员。",
          },
        ],
      },
      {
        id: "video",
        scope: "global",
        title: "视频设置",
        description: "控制 B站视频解析的默认画质。",
        fields: [
          {
            path: "default_video_qn",
            label: "默认画质 qn",
            type: "select",
            options: [
              { label: "360P (qn=16)", value: 16 },
              { label: "480P (qn=32)", value: 32 },
              { label: "720P (qn=64)", value: 64 },
              { label: "1080P (qn=80)", value: 80 },
              { label: "1080P+ (qn=112)", value: 112 },
              { label: "4K (qn=120)", value: 120 },
            ],
            description: "视频时长较短时会自动使用更高画质。",
          },
        ],
      },
      {
        id: "group_live",
        scope: "group",
        title: "群级直播覆盖",
        description: "为单个群设置不同于全局的直播推送模式和 @全体成员 行为。",
        emptyText: "还没有已订阅直播的群，请先在群内订阅 B站 UP 主。",
        fields: [
          {
            path: "live_push_mode",
            label: "推送模式",
            type: "select",
            options: [
              { label: "跟随全局", value: "inherit" },
              { label: "图片推送", value: "image" },
              { label: "文字推送", value: "text" },
            ],
          },
          {
            path: "live_at_all",
            label: "@全体成员",
            type: "select",
            options: [
              { label: "跟随全局", value: "inherit" },
              { label: "开启", value: "true" },
              { label: "关闭", value: "false" },
            ],
          },
        ],
      },
    ],
  },

  async listScopes({ scope }) {
    if (scope !== "group") return []
    return listBilibiliGroupIds().map(groupId => ({
      id: String(groupId),
      label: `群 ${groupId}`,
    }))
  },

  async getValues({ scope = "global", scopeId = "" } = {}) {
    if (scope === "group") {
      const groupId = String(scopeId || "").trim()
      if (!groupId) return { values: {}, meta: {} }
      return {
        values: getGroupLiveValues(groupId),
        meta: { summary: getGroupLiveSummary(groupId) },
      }
    }

    return {
      values: getBilibiliValues(),
      meta: { summary: "B站 Cookie、推送频率、直播推送模式、视频画质" },
    }
  },

  async updateValues({ scope = "global", scopeId = "", values = {} } = {}) {
    const cfg = readBilibiliConfig()

    if (scope === "group") {
      const groupId = String(scopeId || "").trim()
      if (!groupId) return { values: {}, meta: {}, message: "无效的群号" }

      if (!cfg.groups) cfg.groups = {}
      if (!cfg.groups[groupId]) cfg.groups[groupId] = {}

      const override = cfg.groups[groupId]
      if (values.live_push_mode !== undefined) {
        const mode = String(values.live_push_mode).trim()
        if (mode === "inherit") delete override.live_push_mode
        else override.live_push_mode = mode === "text" ? "text" : "image"
      }
      if (values.live_at_all !== undefined) {
        const atAll = String(values.live_at_all).trim()
        if (atAll === "inherit") delete override.live_at_all
        else override.live_at_all = atAll === "true"
      }

      if (Object.keys(override).length === 0) delete cfg.groups[groupId]
      if (Object.keys(cfg.groups).length === 0) delete cfg.groups

      writeBilibiliConfig(cfg)
      return {
        values: getGroupLiveValues(groupId),
        meta: { summary: getGroupLiveSummary(groupId) },
        message: `B站直播推送 群 ${groupId} 配置已保存`,
      }
    }

    if (values.cookie !== undefined) cfg.cookie = String(values.cookie || "").trim()
    if (values.push_interval_sec !== undefined) cfg.push_interval_sec = Math.max(60, Number(values.push_interval_sec) || 300)
    if (values.default_video_qn !== undefined) cfg.default_video_qn = Number(values.default_video_qn) || 80
    if (values.dynamic_forward_enabled !== undefined) cfg.dynamic_forward_enabled = Boolean(values.dynamic_forward_enabled)
    if (values.live_push_mode !== undefined) cfg.live_push_mode = String(values.live_push_mode).trim() === "text" ? "text" : "image"
    if (values.live_at_all !== undefined) cfg.live_at_all = Boolean(values.live_at_all)
    writeBilibiliConfig(cfg)

    return {
      values: getBilibiliValues(),
      meta: { summary: "B站配置已保存" },
      message: "B站配置已保存，部分设置将在下次推送/解析时生效。",
    }
  },
}
