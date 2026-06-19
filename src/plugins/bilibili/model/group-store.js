import fs from "node:fs"
import path from "node:path"

import { getRuntimePaths } from "../../../runtime/runtime-context.js"

function getBilibiliGroupDataDir() {
  return getRuntimePaths().getPluginDataDir("bilibili", "group")
}

function getBilibiliGroupDataFile(groupId) {
  return path.join(getBilibiliGroupDataDir(), `${String(groupId || "").trim()}.json`)
}

export function listBilibiliConfiguredGroupIds() {
  const dir = getBilibiliGroupDataDir()
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith(".json"))
      .map(entry => entry.name.replace(/\.json$/i, "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}

export function removeBilibiliGroupData(groupId) {
  const filePath = getBilibiliGroupDataFile(groupId)
  try {
    if (!fs.existsSync(filePath)) return false
    fs.unlinkSync(filePath)
    return true
  } catch {
    return false
  }
}

export function reconcileBilibiliGroupData(activeGroupIds = []) {
  const normalizedIds = (Array.isArray(activeGroupIds) ? activeGroupIds : [])
    .map(id => String(id || "").trim())
    .filter(Boolean)

  // 保护机制：如果 activeGroupIds 为空，不执行清理，避免启动时误删数据
  if (normalizedIds.length === 0) {
    console.warn("[bilibili] skip reconcile: activeGroupIds is empty")
    return []
  }

  const active = new Set(normalizedIds)
  const removed = []

  for (const gid of listBilibiliConfiguredGroupIds()) {
    if (active.has(gid)) continue
    if (removeBilibiliGroupData(gid)) removed.push(gid)
  }

  return removed.sort((a, b) => a.localeCompare(b))
}
