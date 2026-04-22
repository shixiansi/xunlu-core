import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import schedule from "node-schedule"
import YAML from "yaml"

import env from "../../../lib/env.js"

export const DEFAULT_SCHEDULER_STORE = {
  version: 1,
  tasks: [],
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeString(value) {
  return String(value ?? "").trim()
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function normalizeTimestamp(value, fallback = Date.now()) {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : Math.floor(fallback)
}

function normalizeMentions(list) {
  if (!Array.isArray(list)) return []
  const values = list.map(item => normalizeString(item)).filter(Boolean)
  return Array.from(new Set(values))
}

function validateCronExpression(expr) {
  const job = schedule.scheduleJob(expr, () => {})
  if (!job) return false
  job.cancel()
  return true
}

export function normalizeScheduleExpr(input) {
  const text = normalizeString(input).replace(/\s+/g, " ")
  if (!text) return null

  const daily = /^每天\s+(\d{1,2}):(\d{2})$/.exec(text)
  if (daily) {
    const hour = Number(daily[1])
    const minute = Number(daily[2])
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null
    return `0 ${minute} ${hour} * * *`
  }

  const parts = text.split(/\s+/)
  if (parts.length !== 6) return null
  return validateCronExpression(text) ? text : null
}

function normalizeTarget(rawTarget = {}) {
  const scene = normalizeString(rawTarget?.scene).toLowerCase()
  const id =
    normalizeString(rawTarget?.id) ||
    normalizeString(rawTarget?.group_id) ||
    normalizeString(rawTarget?.user_id)

  if ((scene !== "group" && scene !== "private") || !id) return null
  return { scene, id }
}

function normalizeAction(rawAction = {}, targetScene) {
  const type = normalizeString(rawAction?.type).toLowerCase()
  if (type === "message") {
    const text = normalizeString(rawAction?.text)
    if (!text) return null

    const mentions = normalizeMentions(rawAction?.mentions)
    if (targetScene !== "group" && mentions.length) return null

    return {
      type,
      text,
      mentions,
    }
  }

  if (type === "command") {
    const rawCommand = normalizeString(rawAction?.raw_command)
    if (!rawCommand) return null

    return {
      type,
      raw_command: rawCommand,
    }
  }

  return null
}

function normalizeCreator(rawCreator = {}) {
  const userId = normalizeString(rawCreator?.user_id)
  if (!userId) return null
  return { user_id: userId }
}

export function normalizeTask(rawTask, options = {}) {
  const now = normalizeTimestamp(options?.now)
  const taskId = normalizeString(rawTask?.id)
  if (!taskId) {
    return { task: null, warnings: ["task.id is required"] }
  }

  const expr = normalizeScheduleExpr(rawTask?.schedule?.expr)
  if (!expr) {
    return { task: null, warnings: [`task ${taskId}: invalid schedule expr`] }
  }

  const target = normalizeTarget(rawTask?.target)
  if (!target) {
    return { task: null, warnings: [`task ${taskId}: invalid target`] }
  }

  const action = normalizeAction(rawTask?.action, target.scene)
  if (!action) {
    return { task: null, warnings: [`task ${taskId}: invalid action`] }
  }

  const creator = normalizeCreator(rawTask?.creator)
  if (!creator) {
    return { task: null, warnings: [`task ${taskId}: invalid creator`] }
  }

  return {
    task: {
      id: taskId,
      enabled: rawTask?.enabled !== undefined ? Boolean(rawTask.enabled) : true,
      schedule: {
        expr,
      },
      target,
      action,
      creator,
      created_at: normalizeTimestamp(rawTask?.created_at, now),
      updated_at: normalizeTimestamp(rawTask?.updated_at, now),
    },
    warnings: [],
  }
}

export function normalizeStore(rawStore, options = {}) {
  const store = rawStore && typeof rawStore === "object" ? rawStore : {}
  const warnings = []
  const seen = new Set()
  const tasks = []

  for (const rawTask of Array.isArray(store?.tasks) ? store.tasks : []) {
    const { task, warnings: taskWarnings } = normalizeTask(rawTask, options)
    warnings.push(...taskWarnings)
    if (!task) continue

    if (seen.has(task.id)) {
      warnings.push(`duplicate task id skipped: ${task.id}`)
      continue
    }

    seen.add(task.id)
    tasks.push(task)
  }

  return {
    config: {
      version: 1,
      tasks,
    },
    warnings,
  }
}

export function createTaskId() {
  return `sch_${crypto.randomBytes(4).toString("hex")}`
}

export function getDefaultSchedulerConfigPath() {
  return path.resolve(env.RootPath, "data", "scheduler", "config.yaml")
}

export class SchedulerStore {
  constructor(configPath = getDefaultSchedulerConfigPath()) {
    this.configPath = configPath
  }

  ensureFile() {
    ensureParentDir(this.configPath)
    if (!fs.existsSync(this.configPath)) {
      fs.writeFileSync(this.configPath, YAML.stringify(DEFAULT_SCHEDULER_STORE), "utf8")
    }
  }

  load(options = {}) {
    this.ensureFile()

    let parsed = DEFAULT_SCHEDULER_STORE
    try {
      const raw = fs.readFileSync(this.configPath, "utf8")
      parsed = raw ? YAML.parse(raw) : DEFAULT_SCHEDULER_STORE
    } catch (err) {
      throw new Error(`[scheduler] failed to parse config: ${err?.message || err}`)
    }

    return normalizeStore(parsed, options)
  }

  save(config, options = {}) {
    this.ensureFile()
    const normalized = normalizeStore(config, options)
    fs.writeFileSync(this.configPath, YAML.stringify(normalized.config), "utf8")
    return normalized
  }

  upsertTask(task, options = {}) {
    const current = this.load(options)
    const nextTasks = [...current.config.tasks]
    const idx = nextTasks.findIndex(item => item.id === task.id)
    if (idx >= 0) nextTasks[idx] = deepClone(task)
    else nextTasks.push(deepClone(task))

    const saved = this.save({ version: 1, tasks: nextTasks }, options)
    return {
      ...saved,
      task: saved.config.tasks.find(item => item.id === task.id) || null,
    }
  }

  removeTask(taskId, options = {}) {
    const current = this.load(options)
    const nextTasks = current.config.tasks.filter(item => item.id !== String(taskId))
    const removed = nextTasks.length !== current.config.tasks.length
    const saved = this.save({ version: 1, tasks: nextTasks }, options)
    return {
      ...saved,
      removed,
    }
  }

  setTaskEnabled(taskId, enabled, options = {}) {
    const current = this.load(options)
    const nextTasks = current.config.tasks.map(item => {
      if (item.id !== String(taskId)) return item
      return {
        ...item,
        enabled: Boolean(enabled),
        updated_at: normalizeTimestamp(options?.now),
      }
    })

    const saved = this.save({ version: 1, tasks: nextTasks }, options)
    return {
      ...saved,
      task: saved.config.tasks.find(item => item.id === String(taskId)) || null,
    }
  }

  removeTasksByGroupId(groupId, options = {}) {
    const gid = normalizeString(groupId)
    if (!gid) {
      return {
        ...this.load(options),
        removedTaskIds: [],
      }
    }

    const current = this.load(options)
    const removedTaskIds = current.config.tasks
      .filter(item => item?.target?.scene === "group" && String(item?.target?.id || "") === gid)
      .map(item => item.id)

    if (!removedTaskIds.length) {
      return {
        ...current,
        removedTaskIds: [],
      }
    }

    const nextTasks = current.config.tasks.filter(item => !removedTaskIds.includes(item.id))
    const saved = this.save({ version: 1, tasks: nextTasks }, options)
    return {
      ...saved,
      removedTaskIds,
    }
  }

  reconcileMissingGroupTasks(activeGroupIds = [], options = {}) {
    const active = new Set(
      (Array.isArray(activeGroupIds) ? activeGroupIds : [])
        .map(item => normalizeString(item))
        .filter(Boolean),
    )

    const current = this.load(options)
    const removedTaskIds = current.config.tasks
      .filter(item => item?.target?.scene === "group")
      .filter(item => !active.has(String(item?.target?.id || "")))
      .map(item => item.id)

    if (!removedTaskIds.length) {
      return {
        ...current,
        removedTaskIds: [],
      }
    }

    const nextTasks = current.config.tasks.filter(item => !removedTaskIds.includes(item.id))
    const saved = this.save({ version: 1, tasks: nextTasks }, options)
    return {
      ...saved,
      removedTaskIds,
    }
  }
}

export function removeSchedulerTasksByGroupId(groupId, options = {}) {
  return new SchedulerStore().removeTasksByGroupId(groupId, options)
}

export function reconcileSchedulerMissingGroupTasks(activeGroupIds = [], options = {}) {
  return new SchedulerStore().reconcileMissingGroupTasks(activeGroupIds, options)
}

export default SchedulerStore
