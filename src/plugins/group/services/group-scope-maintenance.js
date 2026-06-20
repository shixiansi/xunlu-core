import fs from "node:fs"
import path from "node:path"

import { getRuntimePaths } from "../../../runtime/runtime-context.js"
import {
  listConfiguredGroupNoticeIds,
  reconcileGroupNoticeConfigs,
  removeGroupNoticeConfig,
} from "../model/notice-store.js"
import {
  cleanupLearningChatGroup,
  reconcileLearningChatGroups,
} from "../../learning_chat/controllers/handlers.js"
import {
  listBilibiliConfiguredGroupIds,
  reconcileBilibiliGroupData,
  removeBilibiliGroupData,
} from "../../bilibili/model/group-store.js"
import {
  reconcileSchedulerMissingGroupTasks,
  removeSchedulerTasksByGroupId,
} from "../../scheduler/model/store.js"
import { getClaimedSchedulerRuntime } from "../../scheduler/model/runtime.js"

function getStateFile() {
  return path.join(getRuntimePaths().getPluginDataDir("group"), "group-scope-maintenance.json")
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function normalizeId(value) {
  return String(value || "").trim()
}

function readState() {
  const stateFile = getStateFile()
  ensureParentDir(stateFile)
  try {
    if (!fs.existsSync(stateFile)) {
      return {
        version: 1,
        owner_self_id: "",
        updated_at: 0,
      }
    }
    const data = JSON.parse(fs.readFileSync(stateFile, "utf8"))
    return {
      version: 1,
      owner_self_id: normalizeId(data?.owner_self_id),
      updated_at: Number(data?.updated_at || 0) || 0,
    }
  } catch {
    return {
      version: 1,
      owner_self_id: "",
      updated_at: 0,
    }
  }
}

function writeState(next = {}) {
  const stateFile = getStateFile()
  ensureParentDir(stateFile)
  fs.writeFileSync(
    stateFile,
    JSON.stringify(
      {
        version: 1,
        owner_self_id: normalizeId(next.owner_self_id),
        updated_at: Number(next.updated_at || Date.now()) || Date.now(),
      },
      null,
      2,
    ),
    "utf8",
  )
}

function normalizeGroupIdSet(value) {
  const out = new Set()

  if (value instanceof Map) {
    for (const [groupId] of value.entries()) {
      const gid = normalizeId(groupId)
      if (gid) out.add(gid)
    }
    return out
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (item && typeof item === "object") {
        const gid = normalizeId(item.group_id ?? item.groupId ?? item.id ?? item.uin)
        if (gid) out.add(gid)
        continue
      }
      const gid = normalizeId(item)
      if (gid) out.add(gid)
    }
    return out
  }

  if (value && typeof value === "object") {
    for (const [groupId] of Object.entries(value)) {
      const gid = normalizeId(groupId)
      if (gid) out.add(gid)
    }
  }

  return out
}

async function resolveBotSelfId(runtimeLike) {
  const direct = normalizeId(runtimeLike?.self_id ?? runtimeLike?.uin ?? runtimeLike?.user_id)
  if (direct) return direct

  try {
    if (typeof runtimeLike?.getLoginInfo === "function") {
      const info = await runtimeLike.getLoginInfo()
      const next = normalizeId(info?.user_id ?? info?.uin ?? info?.self_id)
      if (next) return next
    }
  } catch (err) {
    console.warn("[group-cleanup] getLoginInfo failed:", err?.message || err)
  }

  const bot = globalThis.xunluCore?.bot?.getRuntimeBot?.() || globalThis.__xunlu_runtime_bot
  return normalizeId(bot?.uin ?? bot?.user_id ?? bot?.self_id)
}

export async function resolveRuntimeGroupIds(runtimeLike) {
  const runtimeBot = globalThis.xunluCore?.bot?.getRuntimeBot?.() || globalThis.__xunlu_runtime_bot
  const candidates = [runtimeLike, runtimeBot].filter(Boolean)

  for (const candidate of candidates) {
    if (typeof candidate?.getGroupList !== "function") continue
    try {
      const raw = await candidate.getGroupList()
      return {
        ok: true,
        groupIds: Array.from(normalizeGroupIdSet(raw)).sort((a, b) => a.localeCompare(b)),
      }
    } catch (err) {
      console.warn("[group-cleanup] getGroupList failed:", err?.message || err)
    }
  }

  return {
    ok: false,
    groupIds: [],
  }
}

export async function cleanupGroupScopedPluginData(groupId, options = {}) {
  const gid = normalizeId(groupId)
  if (!gid) {
    return {
      group_id: "",
      learningChat: null,
      groupNoticeRemoved: false,
      bilibiliRemoved: false,
      schedulerRemovedTaskIds: [],
      reason: normalizeId(options.reason),
    }
  }

  const learningChat = await cleanupLearningChatGroup(gid, {
    reason: options.reason || "group-scope-cleanup",
  }).catch(err => {
    console.warn("[group-cleanup] learning_chat cleanup failed:", err?.message || err)
    return null
  })

  const groupNoticeRemoved = removeGroupNoticeConfig(gid)
  const bilibiliRemoved = removeBilibiliGroupData(gid)
  const schedulerResult = removeSchedulerTasksByGroupId(gid)
  const schedulerRuntime = getClaimedSchedulerRuntime()
  for (const taskId of Array.isArray(schedulerResult?.removedTaskIds) ? schedulerResult.removedTaskIds : []) {
    schedulerRuntime?.removeTask?.(taskId)
  }

  return {
    group_id: gid,
    learningChat,
    groupNoticeRemoved,
    bilibiliRemoved,
    schedulerRemovedTaskIds: Array.isArray(schedulerResult?.removedTaskIds)
      ? schedulerResult.removedTaskIds
      : [],
    reason: normalizeId(options.reason),
  }
}

export async function reconcileGroupScopedPlugins(runtimeLike, options = {}) {
  const resolved = await resolveRuntimeGroupIds(runtimeLike)
  if (!resolved.ok) {
    return {
      ok: false,
      reason: "group-list-unavailable",
      activeGroupIds: [],
      skippedDueToOwnerMismatch: false,
      cleaned: null,
    }
  }

  const activeGroupIds = resolved.groupIds
  const currentSelfId = await resolveBotSelfId(runtimeLike)
  const state = readState()

  const shouldRepairLegacyPlaceholderOwner =
    state.owner_self_id === "10000" && currentSelfId && currentSelfId !== "10000"

  if (shouldRepairLegacyPlaceholderOwner) {
    writeState({ owner_self_id: currentSelfId, updated_at: Date.now() })
    return {
      ok: true,
      reason: "legacy-owner-placeholder-repaired",
      owner_self_id: currentSelfId,
      current_self_id: currentSelfId,
      activeGroupIds,
      skippedDueToOwnerMismatch: false,
      cleaned: {
        learningChat: null,
        groupNoticeRemoved: [],
        bilibiliRemoved: [],
        schedulerRemovedTaskIds: [],
      },
    }
  }

  if (state.owner_self_id && currentSelfId && state.owner_self_id !== currentSelfId) {
    return {
      ok: false,
      reason: "bot-owner-changed",
      owner_self_id: state.owner_self_id,
      current_self_id: currentSelfId,
      activeGroupIds,
      skippedDueToOwnerMismatch: true,
      cleaned: null,
    }
  }

  if (!state.owner_self_id && currentSelfId) {
    writeState({ owner_self_id: currentSelfId, updated_at: Date.now() })
  } else if (state.owner_self_id) {
    writeState({ owner_self_id: state.owner_self_id, updated_at: Date.now() })
  }

  const learningChat = await reconcileLearningChatGroups(runtimeLike, {
    ...options,
    activeGroupIds,
    reason: options.reason || "group-scope-reconcile",
  }).catch(err => {
    console.warn("[group-cleanup] learning_chat reconcile failed:", err?.message || err)
    return null
  })

  const groupNoticeRemoved = reconcileGroupNoticeConfigs(activeGroupIds)
  const bilibiliRemoved = reconcileBilibiliGroupData(activeGroupIds)
  const schedulerResult = reconcileSchedulerMissingGroupTasks(activeGroupIds)
  const schedulerRuntime = getClaimedSchedulerRuntime()
  for (const taskId of Array.isArray(schedulerResult?.removedTaskIds) ? schedulerResult.removedTaskIds : []) {
    schedulerRuntime?.removeTask?.(taskId)
  }

  return {
    ok: true,
    reason: "",
    owner_self_id: state.owner_self_id || currentSelfId || "",
    current_self_id: currentSelfId || "",
    activeGroupIds,
    skippedDueToOwnerMismatch: false,
    cleaned: {
      learningChat,
      groupNoticeRemoved,
      bilibiliRemoved,
      schedulerRemovedTaskIds: Array.isArray(schedulerResult?.removedTaskIds)
        ? schedulerResult.removedTaskIds
        : [],
    },
  }
}

export function listKnownGroupScopedPluginIds() {
  return {
    groupNotice: listConfiguredGroupNoticeIds(),
    bilibili: listBilibiliConfiguredGroupIds(),
  }
}
