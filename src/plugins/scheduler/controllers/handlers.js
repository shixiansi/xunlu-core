import SchedulerStore, { createTaskId, normalizeScheduleExpr } from "../model/store.js"
import SchedulerRuntime, { claimSchedulerRuntime, formatDateTime, getClaimedSchedulerRuntime } from "../model/runtime.js"

function getLogger(logger) {
  return logger || globalThis.xunluCore?.services?.logger || console
}

function normalizeString(value) {
  return String(value ?? "").trim()
}

function parseTaskId(raw, prefix) {
  return normalizeString(raw).replace(prefix, "").trim()
}

function parseListSort(tasks = []) {
  return [...tasks].sort((a, b) => {
    if (Boolean(b.enabled) !== Boolean(a.enabled)) return Number(Boolean(b.enabled)) - Number(Boolean(a.enabled))
    return String(a.id || "").localeCompare(String(b.id || ""), "zh-Hans-CN")
  })
}

function usageForMessageTask() {
  return "用法：#定时发送 [--group <gid>|--user <uid>] [--at <uid,uid...>] <expr> | <text>"
}

function usageForCommandTask() {
  return "用法：#定时指令 [--group <gid>|--user <uid>] <expr> | <raw_command>"
}

function extractOption(source, pattern) {
  const match = pattern.exec(source)
  return {
    value: match?.[1] ? normalizeString(match[1]) : "",
    rest: match ? source.replace(match[0], " ").replace(/\s+/g, " ").trim() : source,
  }
}

function parseMentionsOption(value) {
  if (!value) return []
  return Array.from(
    new Set(
      String(value)
        .split(/[,\s，]+/)
        .map(item => normalizeString(item))
        .filter(Boolean),
    ),
  )
}

export function parseCreateDirective(raw, type = "message") {
  const prefix = type === "message" ? /^#定时发送\s*/ : /^#定时指令\s*/
  const body = normalizeString(raw).replace(prefix, "").trim()
  const pipeIndex = body.indexOf("|")
  if (pipeIndex < 0) {
    return {
      ok: false,
      error: type === "message" ? usageForMessageTask() : usageForCommandTask(),
    }
  }

  const left = normalizeString(body.slice(0, pipeIndex))
  const payload = normalizeString(body.slice(pipeIndex + 1))
  if (!left || !payload) {
    return {
      ok: false,
      error: type === "message" ? usageForMessageTask() : usageForCommandTask(),
    }
  }

  let rest = left
  const groupResult = extractOption(rest, /(?:^|\s)--group\s+([^\s|]+)/)
  rest = groupResult.rest
  const userResult = extractOption(rest, /(?:^|\s)--user\s+([^\s|]+)/)
  rest = userResult.rest

  if (groupResult.value && userResult.value) {
    return { ok: false, error: "不能同时指定 --group 和 --user" }
  }

  let mentions = []
  if (type === "message") {
    const atResult = extractOption(rest, /(?:^|\s)--at\s+([^\s|]+)/)
    rest = atResult.rest
    mentions = parseMentionsOption(atResult.value)
  }

  const expr = normalizeScheduleExpr(rest)
  if (!expr) {
    return { ok: false, error: "定时表达式无效，仅支持 6 段 cron 或“每天 HH:mm”" }
  }

  return {
    ok: true,
    expr,
    payload,
    mentions,
    target:
      groupResult.value
        ? { scene: "group", id: groupResult.value }
        : userResult.value
          ? { scene: "private", id: userResult.value }
          : null,
  }
}

export async function resolveIsGroupAdmin(ctx) {
  if (ctx?.isMaster) return true
  if (ctx?.isOwner || ctx?.isAdmin) return true
  if (!ctx?.isGroup || !ctx?.group_id || !ctx?.user_id) return false

  try {
    const info =
      (await ctx.getGroupMemberInfo?.(ctx.group_id, ctx.user_id).catch(() => null)) ||
      (await ctx.getGroupMemberInfo?.({ group_id: ctx.group_id, user_id: ctx.user_id }).catch(() => null))

    const role = String(info?.role || info?.permission || "").toLowerCase()
    if (role === "owner" || role === "admin") return true

    const flags = [
      info?.is_admin,
      info?.isAdmin,
      info?.admin,
      info?.is_owner,
      info?.isOwner,
      info?.owner,
    ]
    return flags.some(Boolean)
  } catch {
    return false
  }
}

function summarizeTask(task, nextDate) {
  const actionSummary =
    task.action.type === "message"
      ? `发送消息: ${task.action.text}`
      : `触发指令: ${task.action.raw_command}`

  return [
    `${task.id} | ${task.enabled ? "启用" : "禁用"} | ${task.action.type === "message" ? "消息" : "指令"}`,
    `目标: ${task.target.scene}:${task.target.id} | cron: ${task.schedule.expr}`,
    `创建者: ${task.creator.user_id} | 下次: ${task.enabled ? formatDateTime(nextDate) : "未启用"}`,
    actionSummary,
  ].join("\n")
}

async function resolveVisibleTasks(ctx, runtime) {
  if (ctx?.isMaster) return runtime.getTasks()
  if (!ctx?.isGroup) return null
  if (!(await resolveIsGroupAdmin(ctx))) return null

  return runtime
    .getTasks()
    .filter(task => task.target.scene === "group" && String(task.target.id) === String(ctx.group_id))
}

async function canManageTask(ctx, task) {
  if (!task) return false
  if (ctx?.isMaster) return true
  if (!ctx?.isGroup) return false
  if (task.target.scene !== "group" || String(task.target.id) !== String(ctx.group_id)) return false
  return await resolveIsGroupAdmin(ctx)
}

async function resolveCreateTarget(ctx, parsedTarget) {
  if (parsedTarget?.scene === "private") {
    if (!ctx?.isMaster) {
      return { ok: false, error: "仅主人可创建私聊定时任务" }
    }
    return { ok: true, target: { scene: "private", id: parsedTarget.id } }
  }

  if (parsedTarget?.scene === "group") {
    if (ctx?.isMaster) {
      return { ok: true, target: { scene: "group", id: parsedTarget.id } }
    }
    if (!ctx?.isGroup) {
      return { ok: false, error: "仅主人可为其他群创建任务" }
    }
    if (String(parsedTarget.id) !== String(ctx.group_id)) {
      return { ok: false, error: "仅主人可为其他群创建任务" }
    }
    if (!(await resolveIsGroupAdmin(ctx))) {
      return { ok: false, error: "需要管理员权限" }
    }
    return { ok: true, target: { scene: "group", id: String(ctx.group_id) } }
  }

  if (ctx?.isGroup) {
    if (!(await resolveIsGroupAdmin(ctx))) {
      return { ok: false, error: "需要管理员权限" }
    }
    return { ok: true, target: { scene: "group", id: String(ctx.group_id) } }
  }

  if (!ctx?.isMaster) {
    return { ok: false, error: "仅主人可在私聊中管理定时任务" }
  }

  const userId = normalizeString(ctx?.peer_id || ctx?.user_id || ctx?.sender_id)
  if (!userId) {
    return { ok: false, error: "无法识别私聊目标" }
  }
  return { ok: true, target: { scene: "private", id: userId } }
}

export class SchedulerService {
  constructor({ botApi, store, runtime, logger } = {}) {
    this.botApi = botApi
    this.store = store || new SchedulerStore()
    this.logger = getLogger(logger)
    this.runtime = claimSchedulerRuntime(
      runtime ||
        new SchedulerRuntime({
          botApi,
          store: this.store,
          logger: this.logger,
        }),
    )
  }

  register() {
    if (!this.botApi || typeof this.botApi.registerCommand !== "function") return

    this.botApi.registerCommand(
      ["^#定时列表$", 850, { key: "list", example: "#定时列表", desc: "查看当前可管理的定时任务" }],
      async ctx => await this.handleList(ctx),
    )

    this.botApi.registerCommand(
      ["^#定时查看(?:\\s+\\S+)?$", 850, { key: "view", example: "#定时查看 sch_a1b2c3d4", desc: "查看指定定时任务详情" }],
      async ctx => await this.handleView(ctx),
    )

    this.botApi.registerCommand(
      ["^#定时删除(?:\\s+\\S+)?$", 850, { key: "delete", example: "#定时删除 sch_a1b2c3d4", desc: "删除指定定时任务" }],
      async ctx => await this.handleDelete(ctx),
    )

    this.botApi.registerCommand(
      ["^#定时启用(?:\\s+\\S+)?$", 850, { key: "enable", example: "#定时启用 sch_a1b2c3d4", desc: "启用指定定时任务" }],
      async ctx => await this.handleToggle(ctx, true),
    )

    this.botApi.registerCommand(
      ["^#定时禁用(?:\\s+\\S+)?$", 850, { key: "disable", example: "#定时禁用 sch_a1b2c3d4", desc: "禁用指定定时任务" }],
      async ctx => await this.handleToggle(ctx, false),
    )

    this.botApi.registerCommand(
      ["^#定时重载$", 850, { key: "reload", example: "#定时重载", desc: "从 YAML 重新加载定时任务配置" }],
      async ctx => await this.handleReload(ctx),
    )

    this.botApi.registerCommand(
      [
        "^#定时发送(?:\\s+.+)?$",
        850,
        {
          key: "create-message",
          example: "#定时发送 每天 08:00 | 早上好",
          desc: "创建定时发送消息任务，可选 --group/--user/--at",
        },
      ],
      async ctx => await this.handleCreateMessageTask(ctx),
    )

    this.botApi.registerCommand(
      [
        "^#定时指令(?:\\s+.+)?$",
        850,
        {
          key: "create-command",
          example: "#定时指令 每天 08:00 | #帮助",
          desc: "创建定时触发指令任务，可选 --group/--user",
        },
      ],
      async ctx => await this.handleCreateCommandTask(ctx),
    )

    this.botApi.onMount(async () => {
      await this.runtime.reloadFromDisk()
    })
  }

  async handleReload(ctx) {
    if (!ctx?.isMaster) return await ctx.reply("仅主人可用")

    try {
      const result = this.runtime.reloadFromDisk()
      const lines = [
        `已重载定时任务：共 ${result.config.tasks.length} 条，已启用 ${result.scheduledCount} 条`,
      ]
      if (result.warnings.length) {
        lines.push(`跳过 ${result.warnings.length} 条异常配置`)
      }
      return await ctx.reply(lines.join("\n"))
    } catch (err) {
      return await ctx.reply(`重载失败：${err?.message || err}`)
    }
  }

  async handleList(ctx) {
    const visible = await resolveVisibleTasks(ctx, this.runtime)
    if (!visible) {
      return await ctx.reply(ctx?.isGroup ? "需要管理员权限" : "仅主人可在私聊中管理定时任务")
    }
    if (!visible.length) return await ctx.reply("当前没有可管理的定时任务")

    const lines = ["定时任务列表："]
    for (const task of parseListSort(visible)) {
      const nextDate = this.runtime.getNextInvocation(task.id)
      lines.push(`- ${task.id} | ${task.enabled ? "启用" : "禁用"} | ${task.action.type === "message" ? "消息" : "指令"} | ${task.target.scene}:${task.target.id} | 下次: ${task.enabled ? formatDateTime(nextDate) : "未启用"}`)
    }
    return await ctx.reply(lines.join("\n"))
  }

  async handleView(ctx) {
    const taskId = parseTaskId(ctx?.msg, /^#定时查看/)
    if (!taskId) return await ctx.reply("用法：#定时查看 <id>")

    const task = this.runtime.getTask(taskId)
    if (!task) return await ctx.reply("未找到对应的定时任务")
    if (!(await canManageTask(ctx, task))) return await ctx.reply("无权限管理该定时任务")

    return await ctx.reply(summarizeTask(task, this.runtime.getNextInvocation(task.id)))
  }

  async handleDelete(ctx) {
    const taskId = parseTaskId(ctx?.msg, /^#定时删除/)
    if (!taskId) return await ctx.reply("用法：#定时删除 <id>")

    const task = this.runtime.getTask(taskId)
    if (!task) return await ctx.reply("未找到对应的定时任务")
    if (!(await canManageTask(ctx, task))) return await ctx.reply("无权限管理该定时任务")

    this.store.removeTask(taskId)
    this.runtime.removeTask(taskId)
    return await ctx.reply(`已删除定时任务：${taskId}`)
  }

  async handleToggle(ctx, enabled) {
    const taskId = parseTaskId(ctx?.msg, enabled ? /^#定时启用/ : /^#定时禁用/)
    if (!taskId) return await ctx.reply(`用法：${enabled ? "#定时启用" : "#定时禁用"} <id>`)

    const task = this.runtime.getTask(taskId)
    if (!task) return await ctx.reply("未找到对应的定时任务")
    if (!(await canManageTask(ctx, task))) return await ctx.reply("无权限管理该定时任务")

    const saved = this.store.setTaskEnabled(taskId, enabled)
    if (!saved.task) return await ctx.reply("更新定时任务失败")

    this.runtime.syncTask(saved.task)
    const nextDate = this.runtime.getNextInvocation(taskId)
    const lines = [`已${enabled ? "启用" : "禁用"}定时任务：${taskId}`]
    if (enabled) lines.push(`下次触发：${formatDateTime(nextDate)}`)
    return await ctx.reply(lines.join("\n"))
  }

  async handleCreateMessageTask(ctx) {
    const parsed = parseCreateDirective(ctx?.msg, "message")
    if (!parsed.ok) return await ctx.reply(parsed.error)

    const targetResult = await resolveCreateTarget(ctx, parsed.target)
    if (!targetResult.ok) return await ctx.reply(targetResult.error)
    if (targetResult.target.scene !== "group" && parsed.mentions.length) {
      return await ctx.reply("私聊定时消息不支持 --at")
    }

    const now = Date.now()
    const task = {
      id: createTaskId(),
      enabled: true,
      schedule: { expr: parsed.expr },
      target: targetResult.target,
      action: {
        type: "message",
        text: parsed.payload,
        mentions: parsed.mentions,
      },
      creator: {
        user_id: normalizeString(ctx?.user_id || ctx?.sender_id),
      },
      created_at: now,
      updated_at: now,
    }

    const saved = this.store.upsertTask(task, { now })
    this.runtime.syncTask(saved.task)
    return await ctx.reply(this.buildCreateReply(saved.task))
  }

  async handleCreateCommandTask(ctx) {
    const parsed = parseCreateDirective(ctx?.msg, "command")
    if (!parsed.ok) return await ctx.reply(parsed.error)

    const targetResult = await resolveCreateTarget(ctx, parsed.target)
    if (!targetResult.ok) return await ctx.reply(targetResult.error)

    const now = Date.now()
    const task = {
      id: createTaskId(),
      enabled: true,
      schedule: { expr: parsed.expr },
      target: targetResult.target,
      action: {
        type: "command",
        raw_command: parsed.payload,
      },
      creator: {
        user_id: normalizeString(ctx?.user_id || ctx?.sender_id),
      },
      created_at: now,
      updated_at: now,
    }

    const saved = this.store.upsertTask(task, { now })
    this.runtime.syncTask(saved.task)
    return await ctx.reply(this.buildCreateReply(saved.task))
  }

  buildCreateReply(task) {
    const nextDate = this.runtime.getNextInvocation(task.id)
    return [
      `已创建定时任务：${task.id}`,
      `类型：${task.action.type === "message" ? "消息" : "指令"} | 目标：${task.target.scene}:${task.target.id}`,
      `cron：${task.schedule.expr}`,
      `下次触发：${formatDateTime(nextDate)}`,
    ].join("\n")
  }
}

export async function onEnable() {
  const runtime = getClaimedSchedulerRuntime()
  if (runtime) await runtime.reloadFromDisk()
}

export function register(botApi) {
  const service = new SchedulerService({ botApi })
  service.register()
}
