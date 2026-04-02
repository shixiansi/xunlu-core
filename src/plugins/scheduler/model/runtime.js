import schedule from "node-schedule"

import { UniversalMessageSegment } from "../../../Bot/message/universal-message.js"

const GLOBAL_RUNTIME_KEY = "__xunlu_scheduler_runtime__"

function getLogger(logger) {
  return logger || globalThis.logger || console
}

function normalizeString(value) {
  return String(value ?? "").trim()
}

function toTargetId(value) {
  const text = normalizeString(value)
  if (!text) return value
  const num = Number(text)
  return Number.isFinite(num) ? num : text
}

function jobName(taskId) {
  return `xunlu:scheduler:${taskId}`
}

function getGlobalRuntimeState() {
  if (!globalThis[GLOBAL_RUNTIME_KEY]) {
    globalThis[GLOBAL_RUNTIME_KEY] = {
      runtime: null,
    }
  }
  return globalThis[GLOBAL_RUNTIME_KEY]
}

function nextInvocationToDate(job) {
  const next = job?.nextInvocation?.()
  if (!next) return null
  if (typeof next?.toDate === "function") return next.toDate()

  const date = new Date(next)
  return Number.isFinite(date.getTime()) ? date : null
}

function formatDatePart(value) {
  return String(value).padStart(2, "0")
}

export function formatDateTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "未计划"
  return `${date.getFullYear()}-${formatDatePart(date.getMonth() + 1)}-${formatDatePart(date.getDate())} ${formatDatePart(date.getHours())}:${formatDatePart(date.getMinutes())}:${formatDatePart(date.getSeconds())}`
}

export function claimSchedulerRuntime(runtime) {
  const state = getGlobalRuntimeState()
  if (state.runtime && state.runtime !== runtime) {
    state.runtime.shutdown()
  }
  state.runtime = runtime
  return runtime
}

export function getClaimedSchedulerRuntime() {
  return getGlobalRuntimeState().runtime || null
}

export function buildMessagePayload(text, mentions = []) {
  const cleanText = normalizeString(text)
  const cleanMentions = Array.isArray(mentions) ? mentions.map(item => normalizeString(item)).filter(Boolean) : []
  if (!cleanMentions.length) return cleanText

  const segments = []
  cleanMentions.forEach((uid, index) => {
    if (index > 0) segments.push(UniversalMessageSegment.text(" "))
    segments.push(UniversalMessageSegment.mention(uid))
  })
  if (cleanText) segments.push(UniversalMessageSegment.text(` ${cleanText}`))
  return segments
}

export class SchedulerRuntime {
  constructor({ botApi, store, logger } = {}) {
    this.botApi = botApi
    this.store = store
    this.logger = getLogger(logger)
    this.tasks = new Map()
    this.jobs = new Map()
    this.lastWarnings = []
  }

  getTasks() {
    return Array.from(this.tasks.values())
  }

  getTask(taskId) {
    return this.tasks.get(String(taskId)) || null
  }

  getNextInvocation(taskId) {
    return nextInvocationToDate(this.jobs.get(String(taskId)) || null)
  }

  cancelTask(taskId) {
    const key = String(taskId)
    const job = this.jobs.get(key)
    if (job) {
      job.cancel()
      this.jobs.delete(key)
    }
    schedule.cancelJob(jobName(key))
  }

  shutdown() {
    for (const taskId of Array.from(this.jobs.keys())) {
      this.cancelTask(taskId)
    }
    this.tasks.clear()
  }

  replaceAll(tasks = []) {
    this.shutdown()
    this.tasks.clear()

    for (const task of Array.isArray(tasks) ? tasks : []) {
      this.tasks.set(task.id, task)
      if (task.enabled) this.scheduleTask(task)
    }
  }

  reloadFromDisk() {
    const loaded = this.store.load()
    this.lastWarnings = loaded.warnings
    this.replaceAll(loaded.config.tasks)
    return {
      ...loaded,
      scheduledCount: this.jobs.size,
    }
  }

  syncTask(task) {
    if (!task || !task.id) return null
    this.tasks.set(task.id, task)
    this.cancelTask(task.id)
    if (task.enabled) this.scheduleTask(task)
    return task
  }

  removeTask(taskId) {
    this.cancelTask(taskId)
    this.tasks.delete(String(taskId))
  }

  scheduleTask(task) {
    const key = String(task.id)
    const job = schedule.scheduleJob(jobName(key), task.schedule.expr, async () => {
      try {
        await this.executeTask(task)
      } catch (err) {
        this.logger.warn("[scheduler] task execution failed:", err?.message || err)
      }
    })

    if (!job) {
      this.logger.warn("[scheduler] failed to schedule task:", key)
      return null
    }

    this.jobs.set(key, job)
    return job
  }

  async executeTask(task) {
    if (!task || !this.botApi) return false

    if (task.action.type === "message") {
      const target =
        task.target.scene === "group"
          ? { group_id: toTargetId(task.target.id) }
          : { user_id: toTargetId(task.target.id) }
      const payload = buildMessagePayload(task.action.text, task.action.mentions)
      return await this.botApi.sendMessage(target, payload)
    }

    if (task.action.type === "command") {
      const synthetic = await this.botApi.buildSyntheticCommandEvent({
        baseMessageRecord: {
          protocol: "",
          user_id: task.creator.user_id,
          sender_id: task.creator.user_id,
          peer_id: task.target.scene === "private" ? task.target.id : task.target.id,
          group_id: task.target.scene === "group" ? task.target.id : undefined,
          message_type: task.target.scene === "group" ? "group" : "private",
          message_scene: task.target.scene,
          sender: {
            user_id: task.creator.user_id,
            nickname: task.creator.user_id,
            card: task.creator.user_id,
          },
        },
        rawCommand: task.action.raw_command,
        userId: task.creator.user_id,
        groupId: task.target.scene === "group" ? task.target.id : undefined,
        peerId: task.target.scene === "private" ? task.target.id : undefined,
        scene: task.target.scene,
        flags: {
          __synthetic: true,
          __skipLearning: true,
          __commandUsageSource: "scheduled-command",
        },
      })

      return await this.botApi.invokeCommandByText(task.action.raw_command, synthetic, {
        scene: task.target.scene,
      })
    }

    return false
  }
}

export default SchedulerRuntime
