import cfg from "../../lib/config.js"
import env from "../../lib/env.js"
import {
  callRuntimeBotGroupMemberInfo,
  callRuntimeBotGroupMemberList,
  extractMemberRoleFlags,
  findMemberInfoInGroupMemberList,
  pickGroupMemberRoleInfo,
  selectPreferredRoleFlags,
} from "../role/index.js"
import { normalizeEventId } from "./shared.js"

const GROUP_MEMBER_ROLE_CACHE_TTL_MS = 60 * 1000
const GROUP_BOT_ROLE_CACHE_TTL_MS = 5 * 60 * 1000
const groupMemberRoleCache = new Map()
const groupBotRoleCache = new Map()

function getRoleFlags(info) {
  return extractMemberRoleFlags(info)
}

function applyRoleFlags(target, flags) {
  const base = target && typeof target === "object" ? target : {}
  const next = { ...base }
  if (!flags) return next

  if (flags.role && !next.role) next.role = flags.role
  if (flags.isOwner !== null && flags.isOwner !== undefined) {
    next.is_owner = Boolean(flags.isOwner)
    next.isOwner = Boolean(flags.isOwner)
  }
  if (flags.isAdmin !== null && flags.isAdmin !== undefined) {
    next.is_admin = Boolean(flags.isAdmin)
    next.isAdmin = Boolean(flags.isAdmin)
  }
  if (!next._info || typeof next._info !== "object") next._info = {}
  if (flags.role && !next._info.role) next._info.role = flags.role
  return next
}

function getSelfIdFromCtx(e) {
  return normalizeEventId(
    e?.self_id ?? e?.bot?.uin ?? e?.bot?.self_id ?? globalThis.Bot?.uin ?? globalThis.Bot?.self_id,
  )
}

function readOwnDataProperty(target, key) {
  if (!target || typeof target !== "object") return undefined
  const desc = Object.getOwnPropertyDescriptor(target, key)
  if (!desc) return undefined
  if (Object.prototype.hasOwnProperty.call(desc, "value")) return desc.value
  return undefined
}

function setShadowProperty(target, key, value) {
  if (!target || typeof target !== "object") return false
  try {
    const ownDesc = Object.getOwnPropertyDescriptor(target, key)
    if (ownDesc?.set || ownDesc?.writable) {
      target[key] = value
      return true
    }
    if (!ownDesc) {
      Object.defineProperty(target, key, {
        value,
        configurable: true,
        writable: true,
        enumerable: true,
      })
      return true
    }
    if (ownDesc.configurable) {
      Object.defineProperty(target, key, {
        value,
        configurable: true,
        writable: true,
        enumerable: true,
      })
      return true
    }
  } catch {}
  return false
}

function getRuntimeGroup(groupId) {
  const gid = normalizeEventId(groupId)
  if (gid === undefined) return null
  const runtimeBot = globalThis.__xunlu_runtime_bot || globalThis.Bot
  if (!runtimeBot || typeof runtimeBot.pickGroup !== "function") return null
  try {
    return runtimeBot.pickGroup(Number(gid) || gid)
  } catch {
    return null
  }
}

function pickMemberInfoSafe(group, userId, { ignorePlaceholder = false } = {}) {
  return pickGroupMemberRoleInfo(group, userId, { ignorePlaceholder })
}

function getCachedRoleFlags(cache, key, ttlMs, now = Date.now()) {
  const cached = cache.get(key)
  if (!cached) return null
  if (now - Number(cached.ts || 0) >= ttlMs) {
    cache.delete(key)
    return null
  }
  return cached.flags || null
}

function setCachedRoleFlags(cache, key, flags, now = Date.now()) {
  if (!flags) return
  cache.set(key, { ts: now, flags })
  while (cache.size > 2000) {
    const firstKey = cache.keys().next()
    if (firstKey.done) break
    cache.delete(firstKey.value)
  }
}

/**
 * 角色解析器负责“谁是管理员/群主/bot 管理员”这类横切兜底逻辑。
 *
 * 这部分逻辑最容易在协议适配和群管插件之间互相污染，所以单独抽出来后，
 * MessagePipeline 只需要在最后调用一次 enrich 即可。
 */
export class RoleResolver {
  constructor(baseBot) {
    this.baseBot = baseBot
  }

  async getMasterList() {
    if (env.CurEnv == "QQBot-YunZai") {
      const { default: yuncfg } = await import("../../../../../lib/config/config.js")
      return yuncfg.masterQQ
    }
    return cfg.getConfig("bot").masterQQ
  }

  async enrichGroupRoleFlags(e) {
    if (!e || typeof e !== "object" || !e.group_id) return

    const groupId = normalizeEventId(e.group_id)
    const userId = normalizeEventId(e.user_id ?? e.sender_id)
    const selfId = getSelfIdFromCtx(e)
    const now = Date.now()
    const runtimeGroup = getRuntimeGroup(groupId)
    const ownMember = readOwnDataProperty(e, "member")
    const ownGroupMember = readOwnDataProperty(e, "group_member")
    const ownSender = readOwnDataProperty(e, "sender")
    const ownBotMember = readOwnDataProperty(e, "botMember")

    const senderFlags =
      getRoleFlags(ownMember) ??
      getRoleFlags(ownGroupMember) ??
      getRoleFlags(ownSender) ??
      getRoleFlags(pickMemberInfoSafe(runtimeGroup, userId, { ignorePlaceholder: true }))

    let resolvedSenderFlags = senderFlags
    const senderCacheKey = groupId !== undefined && userId !== undefined ? `${groupId}:${userId}` : ""
    if (!resolvedSenderFlags && senderCacheKey) {
      resolvedSenderFlags = getCachedRoleFlags(
        groupMemberRoleCache,
        senderCacheKey,
        GROUP_MEMBER_ROLE_CACHE_TTL_MS,
        now,
      )
    }
    if (
      !resolvedSenderFlags &&
      groupId !== undefined &&
      userId !== undefined &&
      typeof e.getGroupMemberInfo === "function"
    ) {
      try {
        let info = null
        try {
          info = await e.getGroupMemberInfo(groupId, userId)
        } catch {
          info = await e.getGroupMemberInfo({ group_id: groupId, user_id: userId }).catch(() => null)
        }
        resolvedSenderFlags = getRoleFlags(info)
        if (resolvedSenderFlags && senderCacheKey) {
          setCachedRoleFlags(groupMemberRoleCache, senderCacheKey, resolvedSenderFlags, now)
        }
      } catch {}
    }

    if (userId !== undefined) {
      const nextMember = applyRoleFlags(
        ownMember ||
          ownGroupMember || {
            user_id: userId,
            nickname: ownSender?.nickname,
            card: ownSender?.card,
          },
        resolvedSenderFlags,
      )
      setShadowProperty(e, "member", nextMember)
      setShadowProperty(e, "group_member", nextMember)
    }
    if (resolvedSenderFlags) {
      setShadowProperty(e, "sender", applyRoleFlags(ownSender, resolvedSenderFlags))
      e.isOwner = Boolean(resolvedSenderFlags.isOwner)
      e.isAdmin = Boolean(resolvedSenderFlags.isAdmin)
    } else {
      const fallbackMember = readOwnDataProperty(e, "member") || readOwnDataProperty(e, "group_member")
      e.isOwner = Boolean(fallbackMember?.is_owner ?? fallbackMember?.isOwner ?? false)
      e.isAdmin = Boolean(fallbackMember?.is_admin ?? fallbackMember?.isAdmin ?? e.isOwner)
    }

    if (groupId === undefined || selfId === undefined) return

    const cacheKey = `${groupId}:${selfId}`
    const cached = getCachedRoleFlags(groupBotRoleCache, cacheKey, GROUP_BOT_ROLE_CACHE_TTL_MS, now)

    const localBotInfo = pickMemberInfoSafe(runtimeGroup, selfId)
    let selection = selectPreferredRoleFlags({
      directInfo: ownBotMember,
      localInfo: localBotInfo,
      cachedFlags: cached,
      expectedUserId: selfId,
    })
    let botFlags = selection.flags
    let botFlagsSource = selection.source

    if (!botFlags && typeof e.getGroupMemberInfo === "function") {
      try {
        let info = null
        try {
          info = await e.getGroupMemberInfo(groupId, selfId)
        } catch {
          info = await e.getGroupMemberInfo({ group_id: groupId, user_id: selfId }).catch(() => null)
        }
        selection = selectPreferredRoleFlags({
          directInfo: e.botMember,
          localInfo: localBotInfo,
          cachedFlags: cached,
          upstreamInfo: info,
          expectedUserId: selfId,
        })
        botFlags = selection.flags
        botFlagsSource = selection.source
        if (botFlags && botFlagsSource === "upstream") {
          setCachedRoleFlags(groupBotRoleCache, cacheKey, botFlags, now)
        }
      } catch {}
    }
    if (!botFlags && typeof e.getGroupMemberList === "function") {
      try {
        let list = null
        try {
          list = await e.getGroupMemberList(groupId)
        } catch {
          list = await e.getGroupMemberList({ group_id: groupId }).catch(() => null)
        }
        const listInfo = findMemberInfoInGroupMemberList(list, selfId)
        const listFlags = getRoleFlags(listInfo)
        if (listFlags) {
          botFlags = listFlags
          botFlagsSource = "list"
          setCachedRoleFlags(groupBotRoleCache, cacheKey, botFlags, now)
        }
      } catch {}
    }
    if (!botFlags) {
      try {
        const runtimeInfo = await callRuntimeBotGroupMemberInfo(groupId, selfId)
        const runtimeFlags = getRoleFlags(runtimeInfo)
        if (runtimeFlags) {
          botFlags = runtimeFlags
          botFlagsSource = "runtime-upstream"
          setCachedRoleFlags(groupBotRoleCache, cacheKey, botFlags, now)
        }
      } catch {}
    }
    if (!botFlags) {
      try {
        const runtimeListInfo = await callRuntimeBotGroupMemberList(groupId, selfId)
        const runtimeListFlags = getRoleFlags(runtimeListInfo)
        if (runtimeListFlags) {
          botFlags = runtimeListFlags
          botFlagsSource = "runtime-list"
          setCachedRoleFlags(groupBotRoleCache, cacheKey, botFlags, now)
        }
      } catch {}
    }

    if (botFlags) {
      setShadowProperty(
        e,
        "botMember",
        applyRoleFlags(
          ownBotMember || {
            user_id: selfId,
          },
          botFlags,
        ),
      )
      e.botRole = botFlags.role
      e.botIsOwner = Boolean(botFlags.isOwner)
      e.botIsAdmin = Boolean(botFlags.isAdmin)
    }
  }
}

export default RoleResolver
