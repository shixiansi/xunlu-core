import fs from "node:fs"
import path from "node:path"
import { getRuntimePaths } from "../../../runtime/runtime-context.js"

function getBilibiliConfigPath() {
  return path.join(getRuntimePaths().rootDir, "data", "bilibili", "config.json")
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

function getBilibiliValues() {
  const cfg = readBilibiliConfig()
  return {
    cookie: String(cfg.cookie || ""),
    push_interval_sec: Number(cfg.push_interval_sec || 300),
    default_video_qn: Number(cfg.default_video_qn || 80),
    dynamic_forward_enabled: cfg.dynamic_forward_enabled !== false,
  }
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
    ],
  },

  async getValues() {
    return {
      values: getBilibiliValues(),
      meta: { summary: "B站 Cookie、推送频率、视频画质" },
    }
  },

  async updateValues({ values = {} } = {}) {
    const cfg = readBilibiliConfig()
    if (values.cookie !== undefined) cfg.cookie = String(values.cookie || "").trim()
    if (values.push_interval_sec !== undefined) cfg.push_interval_sec = Math.max(60, Number(values.push_interval_sec) || 300)
    if (values.default_video_qn !== undefined) cfg.default_video_qn = Number(values.default_video_qn) || 80
    if (values.dynamic_forward_enabled !== undefined) cfg.dynamic_forward_enabled = Boolean(values.dynamic_forward_enabled)
    writeBilibiliConfig(cfg)

    return {
      values: getBilibiliValues(),
      meta: { summary: "B站配置已保存" },
      message: "B站配置已保存，部分设置将在下次推送/解析时生效。",
    }
  },
}
