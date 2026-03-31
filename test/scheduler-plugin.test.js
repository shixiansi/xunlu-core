import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import YAML from "yaml"

import { SchedulerService } from "../src/plugins/scheduler/controllers/handlers.js"
import SchedulerRuntime from "../src/plugins/scheduler/model/runtime.js"
import SchedulerStore from "../src/plugins/scheduler/model/store.js"

function createLoggerStub() {
  return {
    info() {},
    warn() {},
    error() {},
    debug() {},
    mark() {},
  }
}

function createTempConfigPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xunlu-scheduler-"))
  return path.join(dir, "config.yaml")
}

test("SchedulerStore skips invalid and duplicate YAML tasks", async () => {
  const configPath = createTempConfigPath()
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(
    configPath,
    YAML.stringify({
      version: 1,
      tasks: [
        {
          id: "sch_ok",
          enabled: true,
          schedule: { expr: "每天 08:00" },
          target: { scene: "group", id: "10001" },
          action: { type: "message", text: "早上好", mentions: ["20002"] },
          creator: { user_id: "30003" },
          created_at: 1,
          updated_at: 1,
        },
        {
          id: "sch_ok",
          enabled: true,
          schedule: { expr: "0 0 9 * * *" },
          target: { scene: "group", id: "10001" },
          action: { type: "message", text: "重复 id" },
          creator: { user_id: "30003" },
        },
        {
          id: "sch_bad",
          enabled: true,
          schedule: { expr: "invalid cron" },
          target: { scene: "group", id: "10001" },
          action: { type: "command", raw_command: "#帮助" },
          creator: { user_id: "30003" },
        },
      ],
    }),
    "utf8",
  )

  const store = new SchedulerStore(configPath)
  const loaded = store.load()

  assert.equal(loaded.config.tasks.length, 1)
  assert.equal(loaded.config.tasks[0].schedule.expr, "0 0 8 * * *")
  assert.match(loaded.warnings.join("\n"), /duplicate task id skipped/)
  assert.match(loaded.warnings.join("\n"), /invalid schedule expr/)
})

test("SchedulerRuntime executes message tasks and rebuilds jobs on reload", async () => {
  const configPath = createTempConfigPath()
  const store = new SchedulerStore(configPath)
  const sent = []
  const runtime = new SchedulerRuntime({
    store,
    logger: createLoggerStub(),
    botApi: {
      async sendMessage(target, message) {
        sent.push({ target, message })
        return true
      },
      async buildSyntheticCommandEvent() {
        return null
      },
      async invokeCommandByText() {
        return false
      },
    },
  })

  const task = {
    id: "sch_msg",
    enabled: true,
    schedule: { expr: "0 0 8 * * *" },
    target: { scene: "group", id: "428596438" },
    action: { type: "message", text: "早上好", mentions: ["123456"] },
    creator: { user_id: "10001" },
    created_at: 1,
    updated_at: 1,
  }

  store.save({ version: 1, tasks: [task] })
  const loaded = runtime.reloadFromDisk()
  assert.equal(loaded.scheduledCount, 1)

  await runtime.executeTask(task)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].target.group_id, 428596438)
  assert.equal(Array.isArray(sent[0].message), true)
  assert.equal(sent[0].message[0].type, "at")
  assert.equal(sent[0].message.at(-1).data.content, " 早上好")

  store.save({
    version: 1,
    tasks: [
      {
        ...task,
        enabled: false,
      },
    ],
  })
  const reloaded = runtime.reloadFromDisk()
  assert.equal(reloaded.scheduledCount, 0)
  runtime.shutdown()
})

test("SchedulerService enforces group-admin scope and private-owner restrictions", async () => {
  const configPath = createTempConfigPath()
  const store = new SchedulerStore(configPath)
  const runtime = new SchedulerRuntime({
    store,
    logger: createLoggerStub(),
    botApi: {
      async sendMessage() {
        return true
      },
      async buildSyntheticCommandEvent() {
        return null
      },
      async invokeCommandByText() {
        return false
      },
    },
  })

  const service = new SchedulerService({
    store,
    runtime,
    logger: createLoggerStub(),
    botApi: {
      registerCommand() {},
      onMount() {},
      async sendMessage() {
        return true
      },
      async buildSyntheticCommandEvent() {
        return null
      },
      async invokeCommandByText() {
        return false
      },
    },
  })

  const replies = []
  const adminCtx = {
    msg: "#定时发送 每天 08:00 | 早上好",
    isGroup: true,
    group_id: "10001",
    user_id: "20002",
    sender_id: "20002",
    isAdmin: true,
    async reply(message) {
      replies.push(message)
      return true
    },
  }

  await service.handleCreateMessageTask(adminCtx)
  assert.equal(runtime.getTasks().length, 1)
  assert.match(replies[0], /已创建定时任务/)

  replies.length = 0
  await service.handleCreateMessageTask({
    msg: "#定时发送 每天 08:00 | 早上好",
    isGroup: true,
    group_id: "10001",
    user_id: "20003",
    sender_id: "20003",
    async reply(message) {
      replies.push(message)
      return true
    },
  })
  assert.equal(runtime.getTasks().length, 1)
  assert.equal(replies[0], "需要管理员权限")

  replies.length = 0
  await service.handleCreateMessageTask({
    msg: "#定时发送 每天 08:00 | 私聊消息",
    isGroup: false,
    user_id: "20004",
    sender_id: "20004",
    async reply(message) {
      replies.push(message)
      return true
    },
  })
  assert.equal(replies[0], "仅主人可在私聊中管理定时任务")
  runtime.shutdown()
})

test("SchedulerRuntime executes command tasks with creator identity and scheduled source", async () => {
  const buildCalls = []
  const invokeCalls = []
  const runtime = new SchedulerRuntime({
    logger: createLoggerStub(),
    botApi: {
      async sendMessage() {
        return true
      },
      async buildSyntheticCommandEvent(payload) {
        buildCalls.push(payload)
        return {
          ...payload.baseMessageRecord,
          raw_message: payload.rawCommand,
          msg: payload.rawCommand,
          post_type: "message",
          reply: async () => true,
        }
      },
      async invokeCommandByText(rawCommand, event, options) {
        invokeCalls.push({ rawCommand, event, options })
        return true
      },
    },
  })

  await runtime.executeTask({
    id: "sch_cmd",
    enabled: true,
    schedule: { expr: "0 0 8 * * *" },
    target: { scene: "private", id: "77777" },
    action: { type: "command", raw_command: "#帮助" },
    creator: { user_id: "88888" },
    created_at: 1,
    updated_at: 1,
  })

  assert.equal(buildCalls.length, 1)
  assert.equal(buildCalls[0].userId, "88888")
  assert.equal(buildCalls[0].peerId, "77777")
  assert.equal(buildCalls[0].scene, "private")
  assert.equal(buildCalls[0].flags.__commandUsageSource, "scheduled-command")
  assert.equal(invokeCalls.length, 1)
  assert.equal(invokeCalls[0].rawCommand, "#帮助")
  assert.equal(invokeCalls[0].options.scene, "private")
})
