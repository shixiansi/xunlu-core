import { getClaimedSchedulerRuntime } from "../model/runtime.js"
import SchedulerStore from "../model/store.js"

function countEnabledTasks(tasks = []) {
  return tasks.filter(task => task?.enabled !== false).length
}

function countTasksByType(tasks = [], type) {
  return tasks.filter(task => String(task?.action?.type || "") === type).length
}

function summarizeScheduler(config = {}, warnings = [], runtimeReloaded = false) {
  const tasks = Array.isArray(config?.tasks) ? config.tasks : []
  const parts = [
    `任务 ${tasks.length} 条`,
    `启用 ${countEnabledTasks(tasks)} 条`,
    `消息 ${countTasksByType(tasks, "message")} 条`,
    `指令 ${countTasksByType(tasks, "command")} 条`,
  ]
  if (warnings.length) parts.push(`警告 ${warnings.length} 条`)
  if (runtimeReloaded) parts.push("已热重载")
  return parts.join(" | ")
}

function normalizeTasksValue(tasks) {
  return Array.isArray(tasks) ? tasks : []
}

function getSchedulerPayload(result, runtimeReloaded = false) {
  const config = result?.config || {}
  const warnings = Array.isArray(result?.warnings) ? result.warnings : []
  return {
    values: {
      tasks: normalizeTasksValue(config.tasks),
    },
    meta: {
      summary: summarizeScheduler(config, warnings, runtimeReloaded),
    },
  }
}

export default {
  meta: {
    title: "定时任务",
    description: "直接编辑 scheduler 的任务列表，并在保存后尝试热重载运行中的任务。",
    order: 45,
    tags: ["schedule", "task"],
  },

  definition: {
    sections: [
      {
        id: "global",
        scope: "global",
        title: "任务配置",
        description: "这里直接编辑 tasks 数组。保存时会走 scheduler 自身的校验与标准化逻辑。",
        fields: [
          {
            path: "tasks",
            label: "tasks",
            type: "json",
            rows: 22,
            description:
              "保持为 JSON 数组，每个元素对应一条定时任务。无效任务会被自动跳过，并在摘要中显示警告数量。",
          },
        ],
      },
    ],
  },

  async getValues() {
    const store = new SchedulerStore()
    return getSchedulerPayload(store.load())
  },

  async updateValues({ values = {} } = {}) {
    const nextTasks = values?.tasks
    if (!Array.isArray(nextTasks)) {
      throw new Error("scheduler.tasks must be a JSON array")
    }

    const store = new SchedulerStore()
    const saved = store.save({ version: 1, tasks: nextTasks })

    const runtime = getClaimedSchedulerRuntime()
    if (runtime && typeof runtime.reloadFromDisk === "function") {
      const reloaded = runtime.reloadFromDisk()
      return {
        ...getSchedulerPayload(reloaded, true),
        message: "scheduler 配置已保存，并已热重载运行中的任务",
      }
    }

    return {
      ...getSchedulerPayload(saved),
      message: "scheduler 配置已保存；当前未检测到运行中的调度器实例",
    }
  },
}
