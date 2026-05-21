import {
  getGroupState,
  getProactiveState,
  getProactiveCommandState,
  listBans,
  setGroupState,
  setProactiveCommandState,
  setProactiveState,
} from "../model/db.js"
import { normalizeGroupId } from "./group-scope.js"
import { forgetHeatForGroup } from "./heat-state.js"

const lastByGroup = new Map()
const stateCache = new Map()
const proactiveStateCache = new Map()
const proactiveCommandStateCache = new Map()
const banCache = new Map()
const repeatStateByGroup = new Map()

function proactiveCommandKey(groupId, userId) {
  const gid = normalizeGroupId(groupId)
  const uid = String(userId || "")
  return gid && uid ? `${gid}:${uid}` : ""
}

export function getLastLearningMessage(groupId) {
  const gid = normalizeGroupId(groupId)
  return gid ? lastByGroup.get(gid) : undefined
}

export function setLastLearningMessage(groupId, value) {
  const gid = normalizeGroupId(groupId)
  if (!gid) return
  lastByGroup.set(gid, value)
}

export function getRepeatState(groupId) {
  const gid = normalizeGroupId(groupId)
  return gid ? repeatStateByGroup.get(gid) : undefined
}

export function setRepeatState(groupId, value) {
  const gid = normalizeGroupId(groupId)
  if (!gid) return
  repeatStateByGroup.set(gid, value)
}

export async function getStateCached(groupId) {
  const gid = normalizeGroupId(groupId)
  if (!gid) return null
  if (stateCache.has(gid)) return stateCache.get(gid)
  const st = await getGroupState(gid)
  stateCache.set(gid, st)
  return st
}

export async function patchState(groupId, patch = {}) {
  const gid = normalizeGroupId(groupId)
  if (!gid) return null
  const next = await setGroupState(gid, patch)
  stateCache.set(gid, next)
  return next
}

export async function getProactiveStateCached(groupId) {
  const gid = normalizeGroupId(groupId)
  if (!gid) return null
  if (proactiveStateCache.has(gid)) return proactiveStateCache.get(gid)
  const st = await getProactiveState(gid)
  proactiveStateCache.set(gid, st)
  return st
}

export async function patchProactiveState(groupId, patch = {}) {
  const gid = normalizeGroupId(groupId)
  if (!gid) return null
  const next = await setProactiveState(gid, patch)
  proactiveStateCache.set(gid, next)
  return next
}

export async function getProactiveCommandStateCached(groupId, userId) {
  const key = proactiveCommandKey(groupId, userId)
  if (!key) return null
  if (proactiveCommandStateCache.has(key)) return proactiveCommandStateCache.get(key)
  const st = await getProactiveCommandState(normalizeGroupId(groupId), String(userId || ""))
  proactiveCommandStateCache.set(key, st)
  return st
}

export async function patchProactiveCommandState(groupId, userId, patch = {}) {
  const key = proactiveCommandKey(groupId, userId)
  if (!key) return null
  const next = await setProactiveCommandState(normalizeGroupId(groupId), String(userId || ""), patch)
  proactiveCommandStateCache.set(key, next)
  return next
}

export async function getBanSet(groupId) {
  const gid = normalizeGroupId(groupId)
  if (!gid) return new Set()
  const now = Date.now()
  const cachedEntry = banCache.get(gid)
  if (cachedEntry && now - cachedEntry.ts < 30_000) return cachedEntry.set

  const rows = await listBans(gid, { limit: 1000 }).catch(() => [])
  const set = new Set(rows.map(r => String(r.reply_hash || "")).filter(Boolean))
  banCache.set(gid, { ts: now, set })
  return set
}

export function clearBanCache(groupId) {
  const gid = normalizeGroupId(groupId)
  if (!gid) return false
  return banCache.delete(gid)
}

export function clearLearningChatRuntimeCaches(groupId) {
  const gid = normalizeGroupId(groupId)
  if (!gid) return false

  lastByGroup.delete(gid)
  stateCache.delete(gid)
  proactiveStateCache.delete(gid)
  banCache.delete(gid)
  repeatStateByGroup.delete(gid)
  forgetHeatForGroup(gid)

  for (const key of Array.from(proactiveCommandStateCache.keys())) {
    if (key.startsWith(`${gid}:`)) proactiveCommandStateCache.delete(key)
  }

  return true
}
