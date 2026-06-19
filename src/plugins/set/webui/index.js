import cfg from "../../../lib/config.js"

const ADAPTER_OPTIONS = [
  { label: "milky", value: "milky" },
  { label: "onebotv11", value: "onebotv11" },
  { label: "icqq", value: "icqq" },
  { label: "auto", value: "auto" },
]

const LOG_LEVEL_OPTIONS = [
  { label: "trace", value: "trace" },
  { label: "debug", value: "debug" },
  { label: "info", value: "info" },
  { label: "warn", value: "warn" },
  { label: "fatal", value: "fatal" },
  { label: "mark", value: "mark" },
  { label: "error", value: "error" },
  { label: "off", value: "off" },
]

const DEFAULT_SCENE_OPTIONS = [
  { label: "群聊", value: "group" },
  { label: "私聊", value: "private" },
]

function normalizeString(value, fallback = "") {
  if (value === undefined || value === null) return fallback
  return String(value)
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback
  return Boolean(value)
}

function normalizePort(value, fallback) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.max(1, Math.min(65535, Math.floor(num)))
}

function normalizeAdapter(value) {
  const text = String(value || "").trim()
  return ADAPTER_OPTIONS.some(item => item.value === text) ? text : "milky"
}

function normalizeLogLevel(value) {
  const text = String(value || "").trim().toLowerCase()
  return LOG_LEVEL_OPTIONS.some(item => item.value === text) ? text : "debug"
}

function normalizeDefaultScene(value) {
  const text = String(value || "").trim()
  return DEFAULT_SCENE_OPTIONS.some(item => item.value === text) ? text : "group"
}

function normalizeMasterIds(list) {
  return Array.from(
    new Set(
      (Array.isArray(list) ? list : [])
        .map(item => String(item ?? "").trim())
        .filter(Boolean),
    ),
  )
}

function getBotValues() {
  const bot = cfg.getConfig("bot") || {}

  return {
    runtime: {
      adapter: normalizeAdapter(bot.adapter),
      authority: normalizeString(bot.authority, "localhost"),
      basePath: normalizeString(bot.basePath, ":3010"),
      accessToken: normalizeString(bot.accessToken, ""),
      image_display: normalizeBoolean(bot.image_display, true),
      suffix_text: normalizeString(bot.suffix_text, ""),
      useTLS: normalizeBoolean(bot.useTLS, false),
      useSSE: normalizeBoolean(bot.useSSE, false),
      icqq_bridge_enable: normalizeBoolean(bot.icqq_bridge_enable, false),
    },
    control: {
      enabled: normalizeBoolean(bot.ctl_enable, true),
      port: normalizePort(bot.ctl_port, 3081),
      token: normalizeString(bot.ctl_token, ""),
      default_scene: normalizeDefaultScene(bot.ctl_default_scene),
      default_group_id: normalizeString(bot.ctl_default_group_id, ""),
      default_user_id: normalizeString(bot.ctl_default_user_id, ""),
    },
    webui: {
      enabled: normalizeBoolean(bot.webui_enable, true),
      host: normalizeString(bot.webui_host, "0.0.0.0"),
      port: normalizePort(bot.webui_port, 3000),
    },
    admin: {
      masterQQ: normalizeMasterIds(bot.masterQQ),
      log_level: normalizeLogLevel(bot.log_level),
    },
    plugin_control: {
      disabled_plugins: Array.isArray(bot?.plugin_control?.disabled_plugins)
        ? bot.plugin_control.disabled_plugins
        : [],
      disabled_commands: Array.isArray(bot?.plugin_control?.disabled_commands)
        ? bot.plugin_control.disabled_commands
        : [],
    },
  }
}

function getBotSummary() {
  const values = getBotValues()
  return [
    `适配器 ${values.runtime.adapter}`,
    `控制台 ${values.control.enabled ? `开启:${values.control.port}` : "关闭"}`,
    `WebUI ${values.webui.enabled ? `${values.webui.host}:${values.webui.port}` : "关闭"}`,
    `主人 ${values.admin.masterQQ.length} 个`,
    `日志 ${values.admin.log_level}`,
    `禁用插件 ${values.plugin_control.disabled_plugins.length} 个`,
    `禁用命令 ${values.plugin_control.disabled_commands.length} 个`,
  ].join(" | ")
}

function saveBotValues(values = {}) {
  const current = cfg.getConfig("bot") || {}
  const nextValues = getBotValues()
  const runtime = values?.runtime || {}
  const control = values?.control || {}
  const webui = values?.webui || {}
  const admin = values?.admin || {}
  const pluginControl = values?.plugin_control || {}

  const next = {
    ...current,
    adapter: normalizeAdapter(runtime.adapter ?? nextValues.runtime.adapter),
    authority: normalizeString(runtime.authority ?? nextValues.runtime.authority, "localhost").trim(),
    basePath: normalizeString(runtime.basePath ?? nextValues.runtime.basePath, ":3010").trim(),
    accessToken: normalizeString(runtime.accessToken ?? nextValues.runtime.accessToken, "").trim(),
    image_display: normalizeBoolean(runtime.image_display, nextValues.runtime.image_display),
    suffix_text: normalizeString(runtime.suffix_text ?? nextValues.runtime.suffix_text, ""),
    useTLS: normalizeBoolean(runtime.useTLS, nextValues.runtime.useTLS),
    useSSE: normalizeBoolean(runtime.useSSE, nextValues.runtime.useSSE),
    icqq_bridge_enable: normalizeBoolean(
      runtime.icqq_bridge_enable,
      nextValues.runtime.icqq_bridge_enable,
    ),
    ctl_enable: normalizeBoolean(control.enabled, nextValues.control.enabled),
    ctl_port: normalizePort(control.port, nextValues.control.port),
    ctl_token: normalizeString(control.token ?? nextValues.control.token, "").trim(),
    ctl_default_scene: normalizeDefaultScene(control.default_scene ?? nextValues.control.default_scene),
    ctl_default_group_id: normalizeString(
      control.default_group_id ?? nextValues.control.default_group_id,
      "",
    ).trim(),
    ctl_default_user_id: normalizeString(
      control.default_user_id ?? nextValues.control.default_user_id,
      "",
    ).trim(),
    webui_enable: normalizeBoolean(webui.enabled, nextValues.webui.enabled),
    webui_host: normalizeString(webui.host ?? nextValues.webui.host, "0.0.0.0").trim(),
    webui_port: normalizePort(webui.port, nextValues.webui.port),
    masterQQ: normalizeMasterIds(admin.masterQQ ?? nextValues.admin.masterQQ),
    log_level: normalizeLogLevel(admin.log_level ?? nextValues.admin.log_level),
    plugin_control: {
      disabled_plugins: Array.isArray(pluginControl.disabled_plugins)
        ? pluginControl.disabled_plugins
        : nextValues.plugin_control.disabled_plugins,
      disabled_commands: Array.isArray(pluginControl.disabled_commands)
        ? pluginControl.disabled_commands
        : nextValues.plugin_control.disabled_commands,
    },
  }

  cfg.getConfigReader("bot").setData(next)
  return next
}

export default {
  meta: {
    title: "系统设置",
    description: "统一管理 bot 基础配置、控制台端口、WebUI 入口和主人账号。",
    order: 20,
    tags: ["system", "bot"],
  },

  definition: {
    sections: [
      {
        id: "runtime",
        scope: "global",
        title: "运行基础",
        description: "适配器、连接信息等配置项多数需要在重载插件或重启后完全生效。",
        fields: [
          { path: "runtime.adapter", label: "适配器", type: "select", options: ADAPTER_OPTIONS },
          { path: "runtime.authority", label: "authority", type: "text" },
          { path: "runtime.basePath", label: "basePath", type: "text" },
          {
            path: "runtime.accessToken",
            label: "accessToken",
            type: "text",
            allowEmpty: true,
          },
          { path: "runtime.image_display", label: "启用图片显示", type: "boolean" },
          {
            path: "runtime.suffix_text",
            label: "回复尾缀",
            type: "textarea",
            rows: 4,
            allowEmpty: true,
            description: "支持文本和 [face:123] 这类表情占位符。",
          },
          { path: "runtime.useTLS", label: "使用 TLS", type: "boolean" },
          { path: "runtime.useSSE", label: "使用 SSE", type: "boolean" },
          { path: "runtime.icqq_bridge_enable", label: "启用 icqq bridge", type: "boolean" },
        ],
      },
      {
        id: "control",
        scope: "global",
        title: "控制台",
        fields: [
          { path: "control.enabled", label: "启用 Control Server", type: "boolean" },
          { path: "control.port", label: "Control Server 端口", type: "number", min: 1, max: 65535 },
          {
            path: "control.token",
            label: "Control Token",
            type: "text",
            allowEmpty: true,
          },
          {
            path: "control.default_scene",
            label: "CLI 默认场景",
            type: "select",
            options: DEFAULT_SCENE_OPTIONS,
          },
          {
            path: "control.default_group_id",
            label: "CLI 默认群号",
            type: "text",
            allowEmpty: true,
          },
          {
            path: "control.default_user_id",
            label: "CLI 默认用户",
            type: "text",
            allowEmpty: true,
          },
        ],
      },
      {
        id: "webui",
        scope: "global",
        title: "WebUI",
        description: "修改 host / port 后，当前 WebUI 进程通常需要重启或重新启动插件。",
        fields: [
          { path: "webui.enabled", label: "启用 WebUI", type: "boolean" },
          { path: "webui.host", label: "WebUI Host", type: "text" },
          { path: "webui.port", label: "WebUI 端口", type: "number", min: 1, max: 65535 },
        ],
      },
      {
        id: "admin",
        scope: "global",
        title: "主人与日志",
        fields: [
          {
            path: "admin.masterQQ",
            label: "主人 QQ 列表",
            type: "array",
            rows: 5,
            description: "每行一个 QQ 号，保存时会自动去重。",
          },
          {
            path: "admin.log_level",
            label: "日志等级",
            type: "select",
            options: LOG_LEVEL_OPTIONS,
          },
        ],
      },
      {
        id: "plugin_control",
        scope: "global",
        title: "插件管理",
        description: "管理插件和命令的启用/禁用状态，修改后需重载插件生效。",
        fields: [
          {
            path: "plugin_control.disabled_plugins",
            label: "禁用的插件",
            type: "array",
            rows: 5,
            description: "每行一个插件名，禁用后该插件将不会被加载。",
          },
          {
            path: "plugin_control.disabled_commands",
            label: "禁用的命令",
            type: "array",
            rows: 5,
            description: "每行一个命令，格式：插件名:命令正则 或 命令正则，禁用后该命令将不会被注册。",
          },
        ],
      },
    ],
  },

  async getValues() {
    return {
      values: getBotValues(),
      meta: {
        summary: getBotSummary(),
      },
    }
  },

  async updateValues({ values = {} } = {}) {
    saveBotValues(values)
    return {
      values: getBotValues(),
      meta: {
        summary: getBotSummary(),
      },
      message: "set / bot 基础配置已保存，部分运行参数需重载插件或重启后生效",
    }
  },
}
