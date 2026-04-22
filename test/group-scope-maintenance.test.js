import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

import { getRuntimePaths } from "../src/runtime/runtime-context.js"
import {
  getConfig,
  getConfigPath,
  reloadConfig,
  setGroupOverrides,
} from "../src/plugins/learning_chat/model/config.js"
import SchedulerStore, { createTaskId } from "../src/plugins/scheduler/model/store.js"
import { getGroupNoticeConfig, setGroupNoticeConfig } from "../src/plugins/group/model/notice-store.js"
import {
  cleanupGroupScopedPluginData,
  reconcileGroupScopedPlugins,
} from "../src/plugins/group/services/group-scope-maintenance.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

const runtimePaths = getRuntimePaths()
const learningConfigPath = getConfigPath()
const groupMaintenanceStatePath = path.join(
  runtimePaths.getPluginDataDir("group"),
  "group-scope-maintenance.json",
)
const bilibiliGroupDir = runtimePaths.getPluginDataDir("bilibili", "group")
const schedulerStore = new SchedulerStore()

function readOptionalFile(filePath) {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null
  } catch {
    return null
  }
}

async function restoreLearningConfig(snapshot) {
  if (snapshot === null) {
    try {
      if (fs.existsSync(learningConfigPath)) fs.unlinkSync(learningConfigPath)
    } catch {}
  } else {
    fs.mkdirSync(path.dirname(learningConfigPath), { recursive: true })
    fs.writeFileSync(learningConfigPath, snapshot, "utf8")
  }
  await reloadConfig()
}

function restoreOptionalFile(filePath, snapshot) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  if (snapshot === null) {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    } catch {}
    return
  }
  fs.writeFileSync(filePath, snapshot, "utf8")
}

test("cleanupGroupScopedPluginData disables learning_chat and removes group-scoped plugin records", async () => {
  const fakeGroupId = "991234567"
  const learningSnapshot = readOptionalFile(learningConfigPath)
  const bilibiliFilePath = path.join(bilibiliGroupDir, `${fakeGroupId}.json`)
  const bilibiliSnapshot = readOptionalFile(bilibiliFilePath)

  try {
    await setGroupOverrides(fakeGroupId, {
      learning_enabled: true,
      proactive_enabled: true,
      proactive_command_enabled: true,
      reply_prob: 0.45,
    })
    setGroupNoticeConfig(fakeGroupId, { group_list_change: true, group_member_change: true })
    fs.mkdirSync(path.dirname(bilibiliFilePath), { recursive: true })
    fs.writeFileSync(bilibiliFilePath, JSON.stringify({ uid: "1001" }), "utf8")

    const taskId = createTaskId()
    schedulerStore.upsertTask(
      {
        id: taskId,
        enabled: true,
        schedule: { expr: "0 0 9 * * *" },
        target: { scene: "group", id: fakeGroupId },
        action: { type: "message", text: "hello", mentions: [] },
        creator: { user_id: "10000" },
        created_at: Date.now(),
        updated_at: Date.now(),
      },
      { now: Date.now() },
    )

    const result = await cleanupGroupScopedPluginData(fakeGroupId, { reason: "unit-test" })

    assert.equal(result.group_id, fakeGroupId)
    assert.equal(result.groupNoticeRemoved, true)
    assert.equal(result.bilibiliRemoved, true)
    assert.ok(result.schedulerRemovedTaskIds.includes(taskId))

    const learningCfg = getConfig()
    const groupCfg = learningCfg?.groups?.[fakeGroupId] || {}
    assert.equal(groupCfg.learning_enabled, false)
    assert.equal(groupCfg.proactive_enabled, false)
    assert.equal(groupCfg.proactive_command_enabled, false)
    assert.equal(groupCfg.reply_prob, 0)

    const noticeCfg = getGroupNoticeConfig(fakeGroupId)
    assert.equal(Boolean(noticeCfg.group_list_change), false)
    assert.equal(fs.existsSync(bilibiliFilePath), false)

    const schedulerTasks = schedulerStore.load().config.tasks
    assert.equal(schedulerTasks.some(item => item.id === taskId), false)
  } finally {
    await restoreLearningConfig(learningSnapshot)
    restoreOptionalFile(bilibiliFilePath, bilibiliSnapshot)
  }
})

test("reconcileGroupScopedPlugins skips auto cleanup when bot owner changes", async () => {
  const stateSnapshot = readOptionalFile(groupMaintenanceStatePath)

  try {
    fs.mkdirSync(path.dirname(groupMaintenanceStatePath), { recursive: true })
    fs.writeFileSync(
      groupMaintenanceStatePath,
      JSON.stringify(
        {
          version: 1,
          owner_self_id: "111111",
          updated_at: Date.now(),
        },
        null,
        2,
      ),
      "utf8",
    )

    const result = await reconcileGroupScopedPlugins({
      async getGroupList() {
        return new Map([["10001", {}]])
      },
      async getLoginInfo() {
        return { user_id: 222222, nickname: "bot-2" }
      },
    })

    assert.equal(result.ok, false)
    assert.equal(result.skippedDueToOwnerMismatch, true)
    assert.equal(result.owner_self_id, "111111")
    assert.equal(result.current_self_id, "222222")
  } finally {
    restoreOptionalFile(groupMaintenanceStatePath, stateSnapshot)
  }
})
