import MessageDB from "../../../db/MessageDB.js"
import CommandUsageDB from "../../../db/CommandUsageDB.js"
import {
  UniversalSegmentType,
  UniversalMessageSegment,
  getSegmentMentionTarget,
  normalizeUniversalSegmentType,
} from "../../../Bot/message/index.js"

import { getConfig, getEffectiveGroupConfig, setGroupOverrides } from "../model/config.js"
import {
  doesGroupTableExist,
  ensureHeatForGroup,
  getBotSelfId,
  getHeatSnapshot as readHeatSnapshot,
  getHeatState,
  listGroupIdsFromMessageDbTables,
  listTrackedHeatGroupIds,
  markBotSpoke,
  updateHeatFromUserMessage,
} from "../services/heat-state.js"
import { buildSignature, filterLearningSegments } from "../utils/signature.js"
import { rawToLearningSegments } from "../utils/convert.js"
import {
  patchImageSegmentsWithRkeyValue,
  prepareOutboundLearningSegments,
  sendLearningSegments,
} from "../services/outbound-media.js"
import {
  banReply,
  getGroupState,
  getProactiveState,
  getProactiveCommandState,
  getSignature,
  incrementTransition,
  initDb,
  listBans,
  listGlobalCandidates,
  listLocalCandidates,
  setGroupState,
  setProactiveCommandState,
  setProactiveState,
  upsertSignature,
} from "../model/db.js"

const lastByGroup = new Map() // groupId -> { hash, ts }
const stateCache = new Map() // groupId -> state
const proactiveStateCache = new Map() // groupId -> proactive state
const proactiveCommandStateCache = new Map() // groupId:userId -> proactive command state
const banCache = new Map() // groupId -> { ts, set }
const repeatStateByGroup = new Map() // groupId -> { hash, startedAt, lastAt, users:Set, count, repeated }

let runtimeProtocolHint = ""

function localDayKey(ts = Date.now()) {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function toInt(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.floor(n) : undefined
}

function toNumber(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function normalizeMessageSegmentType(type) {
  const rawType = String(type || "").trim()
  if (!rawType) return rawType

  try {
    return normalizeUniversalSegmentType(rawType)
  } catch {
    return rawType
  }
}

function withTimeout(promise, timeoutMs, timeoutValue = null) {
  const ms = Math.max(1, Math.floor(Number(timeoutMs) || 1))
  return Promise.race([
    Promise.resolve(promise),
    new Promise(resolve => setTimeout(() => resolve(timeoutValue), ms)),
  ])
}

function getTodayRangeSec(ts = Date.now()) {
  const start = new Date(ts)
  start.setHours(0, 0, 0, 0)
  const end = new Date(ts)
  end.setHours(23, 59, 59, 999)
  return { startSec: Math.floor(start.getTime() / 1000), endSec: Math.floor(end.getTime() / 1000) }
}

function isToggleCommand(ctx) {
  if (!ctx?.atBot) return false
  const msg = String(ctx?.msg || "").trim()
  return /(开启学习|学说话|快学|关闭学习|别学|闭嘴)/.test(msg)
}

function isBanCommand(ctx) {
  if (!ctx?.atBot) return false
  const msg = String(ctx?.msg || "").trim()
  return /(不可以|达咩|不能说这)/.test(msg)
}

function isBlockUsersCommand(ctx) {
  if (!ctx?.atBot) return false
  const msg = String(ctx?.msg || "").trim()
  return /^(拉黑学习|学习拉黑)$/.test(msg)
}

function isProactiveControlCommand(ctx) {
  if (!ctx?.atBot) return false
  const msg = String(ctx?.msg || "").trim()
  return /^(开启主动发言|关闭主动发言|开启主动指令|关闭主动指令)$/.test(msg)
}

function isListProactiveGroupsCommand(ctx) {
  const msg = String(ctx?.msg || "").trim()
  return /^#?查看主动发言群聊$/.test(msg)
}

function pickWeighted(items) {
  const list = Array.isArray(items) ? items : []
  const total = list.reduce((acc, it) => acc + Math.max(0, Number(it.weight) || 0), 0)
  if (!total) return null
  let r = Math.random() * total
  for (const it of list) {
    r -= Math.max(0, Number(it.weight) || 0)
    if (r <= 0) return it
  }
  return list[list.length - 1] || null
}

async function getStateCached(groupId) {
  const gid = String(groupId || "")
  if (!gid) return null
  if (stateCache.has(gid)) return stateCache.get(gid)
  const st = await getGroupState(gid)
  stateCache.set(gid, st)
  return st
}

async function patchState(groupId, patch = {}) {
  const gid = String(groupId || "")
  if (!gid) return null
  const next = await setGroupState(gid, patch)
  stateCache.set(gid, next)
  return next
}

async function getProactiveStateCached(groupId) {
  const gid = String(groupId || "")
  if (!gid) return null
  if (proactiveStateCache.has(gid)) return proactiveStateCache.get(gid)
  const st = await getProactiveState(gid)
  proactiveStateCache.set(gid, st)
  return st
}

async function patchProactiveState(groupId, patch = {}) {
  const gid = String(groupId || "")
  if (!gid) return null
  const next = await setProactiveState(gid, patch)
  proactiveStateCache.set(gid, next)
  return next
}

async function getProactiveCommandStateCached(groupId, userId) {
  const gid = String(groupId || "")
  const uid = String(userId || "")
  const key = `${gid}:${uid}`
  if (!gid || !uid) return null
  if (proactiveCommandStateCache.has(key)) return proactiveCommandStateCache.get(key)
  const st = await getProactiveCommandState(gid, uid)
  proactiveCommandStateCache.set(key, st)
  return st
}

async function patchProactiveCommandState(groupId, userId, patch = {}) {
  const gid = String(groupId || "")
  const uid = String(userId || "")
  const key = `${gid}:${uid}`
  if (!gid || !uid) return null
  const next = await setProactiveCommandState(gid, uid, patch)
  proactiveCommandStateCache.set(key, next)
  return next
}

async function getBanSet(groupId) {
  const gid = String(groupId || "")
  if (!gid) return new Set()
  const now = Date.now()
  const cachedEntry = banCache.get(gid)
  if (cachedEntry && now - cachedEntry.ts < 30_000) return cachedEntry.set

  const rows = await listBans(gid, { limit: 1000 }).catch(() => [])
  const set = new Set(rows.map(r => String(r.reply_hash || "")).filter(Boolean))
  banCache.set(gid, { ts: now, set })
  return set
}

async function resolveIsGroupAdmin(ctx) {
  if (ctx?.isMaster) return true
  if (!ctx?.isGroup || !ctx?.group_id || !ctx?.user_id) return false

  try {
    const info = await ctx.getGroupMemberInfo?.(ctx.group_id, ctx.user_id)
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
    if (flags.some(Boolean)) return true
  } catch {}

  return false
}

function isReplyFromSelf(ctx, replied) {
  const selfId = Number(ctx?.self_id ?? globalThis.Bot?.uin ?? globalThis.Bot?.user_id ?? 0)
  if (!selfId) return false

  const senderRaw =
    replied?.sender_id ??
    replied?.user_id ??
    replied?.sender?.user_id ??
    replied?.sender?.uid ??
    replied?.sender?.uin ??
    replied?.senderUid ??
    replied?.sender_uid

  const senderId =
    senderRaw !== undefined && senderRaw !== null && senderRaw !== "" ? Number(senderRaw) : NaN
  return Number.isFinite(senderId) && senderId === selfId
}

async function cmdToggleLearning(ctx) {
  if (!ctx?.isGroup || !ctx?.group_id) return false
  if (!ctx?.atBot) return false

  const msg = String(ctx?.msg || "").trim()
  const enable = /(开启学习|学说话|快学)/.test(msg)
  const disable = /(关闭学习|别学|闭嘴)/.test(msg)
  if (!enable && !disable) return false

  const target = enable && !disable ? true : disable && !enable ? false : enable
  await setGroupOverrides(String(ctx.group_id), { learning_enabled: target })
  return await ctx.reply(target ? "本群已开启学习" : "本群已关闭学习")
}

async function cmdBanReply(ctx) {
  if (!ctx?.isGroup || !ctx?.group_id) return false
  if (!ctx?.atBot) return false

  if (!(await resolveIsGroupAdmin(ctx))) {
    return await ctx.reply("无权限：需要管理员或主人")
  }

  const replied = await ctx.getReplyMessage?.()
  if (!replied) return await ctx.reply("请回复机器人发言后再发送：不可以 / 达咩 / 不能说这")
  if (!isReplyFromSelf(ctx, replied)) {
    return await ctx.reply("请回复机器人自己发出的消息")
  }

  const segments = filterLearningSegments(replied?.message || [])
  const { hash } = buildSignature(segments)
  if (!hash) return await ctx.reply("无法识别要禁用的回复内容")

  await banReply(String(ctx.group_id), hash)
  banCache.delete(String(ctx.group_id))
  return await ctx.reply("已禁用该回复（本群生效）")
}

function parseMentionTargets(ctx) {
  const segments = Array.isArray(ctx?.message) ? ctx.message : []
  if (!segments.length) return []

  const selfRaw = ctx?.self_id ?? getBotSelfId()
  const selfId = selfRaw !== undefined && selfRaw !== null && selfRaw !== "" ? String(selfRaw) : ""

  const out = []
  for (const seg of segments) {
    if (!seg || normalizeMessageSegmentType(seg?.type) !== UniversalSegmentType.MENTION) continue
    const target = getSegmentMentionTarget(seg)
    if (!target) continue
    if (selfId && target === selfId) continue
    out.push(target)
  }

  return Array.from(new Set(out))
}

async function cmdBlockLearningUsers(ctx) {
  if (!ctx?.isGroup || !ctx?.group_id) return false
  if (!ctx?.atBot) return false

  if (!(await resolveIsGroupAdmin(ctx))) {
    return await ctx.reply("无权限：需要管理员或主人")
  }

  const targets = parseMentionTargets(ctx)
  if (!targets.length) {
    return await ctx.reply("用法：@bot 拉黑学习 @用户1 @用户2（支持多重@）")
  }

  const gid = String(ctx.group_id)
  const cfg = getConfig()
  const g = cfg?.groups && typeof cfg.groups === "object" ? cfg.groups[gid] : null
  const current = Array.isArray(g?.block_users)
    ? g.block_users.map(v => String(v)).filter(Boolean)
    : []

  const next = Array.from(new Set([...current, ...targets]))
  await setGroupOverrides(gid, { block_users: next })
  return await ctx.reply(`已将 ${targets.length} 人加入本群学习黑名单`)
}

async function cmdToggleProactiveSetting(ctx) {
  if (!ctx?.isGroup || !ctx?.group_id) return false
  if (!ctx?.atBot) return false
  if (!ctx?.isMaster) return await ctx.reply("仅主人可用")

  const msg = String(ctx?.msg || "").trim()
  if (msg === "开启主动发言") {
    await setGroupOverrides(String(ctx.group_id), { proactive_enabled: true })
    return await ctx.reply("本群已开启主动发言")
  }
  if (msg === "关闭主动发言") {
    await setGroupOverrides(String(ctx.group_id), { proactive_enabled: false })
    return await ctx.reply("本群已关闭主动发言")
  }
  if (msg === "开启主动指令") {
    await setGroupOverrides(String(ctx.group_id), { proactive_command_enabled: true })
    return await ctx.reply("本群已开启主动指令")
  }
  if (msg === "关闭主动指令") {
    await setGroupOverrides(String(ctx.group_id), { proactive_command_enabled: false })
    return await ctx.reply("本群已关闭主动指令")
  }

  return false
}

async function handleRepeat(ctx, groupCfg, msgInfo) {
  const cfg = getConfig()
  if (!cfg?.repeat?.enable) return false
  if (!groupCfg?.group_id) return false

  const gid = groupCfg.group_id
  const threshold = Math.max(2, Math.floor(toNumber(cfg.repeat.threshold, 3)))
  const maxWindowMs = Math.max(1, Math.floor(toNumber(cfg.repeat.max_window_sec, 3600))) * 1000
  const requireDistinct = cfg.repeat.require_distinct_users !== false
  const minTextLen = Math.max(0, Math.floor(toNumber(cfg.repeat.min_text_len, 2)))

  if (!msgInfo?.hash) return false
  if (
    msgInfo.textLen > 0 &&
    msgInfo.textLen < minTextLen &&
    msgInfo.segments?.every(s => s.type === UniversalSegmentType.TEXT)
  ) {
    return false
  }

  const bans = await getBanSet(gid)
  if (bans.has(msgInfo.hash)) return false

  const now = Date.now()
  const uid = String(ctx?.user_id ?? ctx?.sender_id ?? "")

  const st = repeatStateByGroup.get(gid)
  if (!st || st.hash !== msgInfo.hash || now - st.startedAt > maxWindowMs) {
    repeatStateByGroup.set(gid, {
      hash: msgInfo.hash,
      startedAt: now,
      lastAt: now,
      users: new Set(uid ? [uid] : []),
      count: 1,
      repeated: false,
    })
    return false
  }

  st.lastAt = now
  st.count += 1
  if (uid) st.users.add(uid)

  if (st.repeated) return false
  if (st.count < threshold) return false
  if (requireDistinct && st.users.size < 2) return false

  st.repeated = true
  repeatStateByGroup.set(gid, st)

  const state = await getStateCached(gid)
  const cooldownOk = !state?.last_repeat_at || now - Number(state.last_repeat_at) > 10_000
  if (!cooldownOk) return false

  const outbound = await prepareOutboundLearningSegments(msgInfo.segments, {
    protocol: ctx?.protocol,
    runtimeProtocolHint,
  }).catch(() => msgInfo.segments)
  await ctx.reply(outbound)
  await patchState(gid, { last_repeat_at: now })
  markBotSpoke(gid)
  return true
}

async function handleLearnAndReply(ctx, groupCfg, msgInfo) {
  const cfg = getConfig()
  const gid = groupCfg.group_id

  if (!groupCfg.learning_enabled) return false

  const now = Date.now()

  // learn transition
  const prev = lastByGroup.get(gid)
  const maxGapMs = Math.max(0, Math.floor(toNumber(cfg.learning.learn_max_gap_sec, 600))) * 1000
  const maxCount = Math.max(1, Math.floor(toNumber(cfg.learning.max_learn_count, 6)))

  await upsertSignature({
    hash: msgInfo.hash,
    sig: msgInfo.sig,
    preview: msgInfo.preview,
    segments: msgInfo.segments,
  }).catch(() => {})

  if (prev && now - prev.ts <= maxGapMs && prev.hash && prev.hash !== msgInfo.hash) {
    await incrementTransition({
      groupId: gid,
      fromHash: prev.hash,
      toHash: msgInfo.hash,
      maxCount,
    }).catch(() => {})
  }

  lastByGroup.set(gid, { hash: msgInfo.hash, ts: now })

  // auto reply
  const state = await getStateCached(gid)
  const cooldownMs = Math.max(0, Math.floor(toNumber(cfg.learning.reply_cooldown_sec, 12))) * 1000
  if (state?.last_auto_reply_at && now - Number(state.last_auto_reply_at) < cooldownMs) return false

  const local = await listLocalCandidates({
    groupId: gid,
    fromHash: msgInfo.hash,
    minCount: cfg.learning.reply_threshold,
  }).catch(() => [])

  const global = await listGlobalCandidates({
    fromHash: msgInfo.hash,
    minCount: cfg.learning.reply_threshold,
    minGroups: cfg.learning.cross_group_min_groups,
  }).catch(() => [])

  const bans = await getBanSet(gid)

  const weights = new Map()
  for (const row of local) {
    const to = String(row?.to_hash || "")
    if (!to) continue
    const w = Math.max(0, Number(row?.count) || 0)
    weights.set(to, (weights.get(to) || 0) + w)
  }
  for (const row of global) {
    const to = String(row?.to_hash || row?.toHash || "")
    if (!to) continue
    const w = Math.max(0, Number(row?.totalCount) || 0)
    weights.set(to, (weights.get(to) || 0) + w)
  }

  weights.delete(msgInfo.hash)
  for (const h of bans) weights.delete(h)

  const candidates = Array.from(weights.entries())
    .map(([hash, weight]) => ({ hash, weight }))
    .filter(it => it.weight > 0)

  if (!candidates.length) return false

  const picked = pickWeighted(candidates)
  if (!picked) return false

  const replyProb = Math.max(0, Math.min(1, toNumber(groupCfg.reply_prob, cfg.learning.reply_prob)))
  if (Math.random() > replyProb) return false

  const sigRec = await getSignature(picked.hash).catch(() => null)
  const storedRawSegments = sigRec?.segments ? JSON.parse(String(sigRec.segments || "[]")) : []
  const normalizedSegments = rawToLearningSegments(storedRawSegments, {
    protocolHints: [runtimeProtocolHint, ctx?.protocol],
  })
  const rawSegments =
    Array.isArray(normalizedSegments) && normalizedSegments.length ? normalizedSegments : storedRawSegments
  if (!Array.isArray(rawSegments) || rawSegments.length === 0) return false

  const outbound = await prepareOutboundLearningSegments(rawSegments, {
    protocol: ctx?.protocol,
    runtimeProtocolHint,
  }).catch(() => rawSegments)
  await ctx.reply(outbound)
  await patchState(gid, { last_auto_reply_at: now })
  markBotSpoke(gid)
  return true
}

function shouldIgnoreForLearning(ctx, groupCfg, msgInfo) {
  if (ctx?.__skipLearning || ctx?.__proactiveCommand || ctx?.__synthetic) return true
  const cfg = getConfig()
  if (!ctx?.isGroup) return true
  if (!ctx?.group_id) return true
  if (!msgInfo?.hash) return true

  if (
    isToggleCommand(ctx) ||
    isBanCommand(ctx) ||
    isBlockUsersCommand(ctx) ||
    isProactiveControlCommand(ctx) ||
    isListProactiveGroupsCommand(ctx)
  ) {
    return true
  }

  const uid = String(ctx.user_id ?? "")
  if (uid && groupCfg.block_users.includes(uid)) return true

  const text = String(msgInfo.textJoined || "")
  if (text && groupCfg.block_words.some(w => w && text.includes(w))) return true

  const minTextLen = Math.max(0, Math.floor(toNumber(cfg.learning.min_text_len, 2)))
  if (
    msgInfo.textLen > 0 &&
    msgInfo.textLen < minTextLen &&
    msgInfo.segments.every(s => s.type === UniversalSegmentType.TEXT)
  ) {
    return true
  }

  return false
}

function getCommandWhitelist() {
  const cfg = getConfig()
  return Array.isArray(cfg?.proactive?.command_whitelist)
    ? cfg.proactive.command_whitelist.map(item => String(item || "")).filter(Boolean)
    : []
}

async function fetchLatestUserMessageRecord(groupId, userId) {
  const gid = String(groupId || "")
  const uid = Number(userId)
  if (!gid || !Number.isFinite(uid)) return null
  if (!(await doesGroupTableExist(gid))) return null

  try {
    const table = await MessageDB.getGroupTable(gid)
    const rec = await table.findOne({
      where: { user_id: uid },
      order: [["time", "DESC"]],
    })
    return rec ? rec.dataValues ?? rec : null
  } catch {
    return null
  }
}

export async function listEnabledProactiveGroups({ discoveredIds = null, extraGroupIds = [] } = {}) {
  const cfg = getConfig()
  const ids = new Set([
    ...Object.keys(cfg?.groups || {}),
    ...listTrackedHeatGroupIds(),
    ...((Array.isArray(extraGroupIds) ? extraGroupIds : []).map(id => String(id || "")).filter(Boolean)),
  ])

  if (Array.isArray(discoveredIds)) {
    for (const gid of discoveredIds.map(id => String(id || "")).filter(Boolean)) ids.add(gid)
  } else {
    const more = await listGroupIdsFromMessageDbTables().catch(() => [])
    for (const gid of more.map(id => String(id || "")).filter(Boolean)) ids.add(gid)
  }

  const items = []
  for (const gid of Array.from(ids)) {
    const effective = getEffectiveGroupConfig(gid)
    if (!effective?.proactive_enabled) continue

    const override =
      cfg?.groups && typeof cfg.groups === "object" && cfg.groups[gid] && typeof cfg.groups[gid] === "object"
        ? cfg.groups[gid]
        : {}

    items.push({
      group_id: gid,
      effective,
      override,
      global_proactive_enabled: Boolean(cfg?.proactive?.enable),
      global_proactive_command_enabled: Boolean(cfg?.proactive?.command_enable),
    })
  }

  items.sort((a, b) => String(a.group_id).localeCompare(String(b.group_id)))
  return items
}

async function cmdListProactiveGroups(ctx) {
  if (!ctx?.isMaster) return await ctx.reply("仅主人可用")

  const cfg = getConfig()
  const groups = await listEnabledProactiveGroups()
  if (!groups.length) return await ctx.reply("当前没有开启主动发言的群聊")

  const lines = ["主动发言已开启的群聊："]
  if (!cfg?.proactive?.enable || !cfg?.proactive?.command_enable) {
    lines.push("提示：群配置开启，但当前全局未生效")
  }

  for (const item of groups) {
    const commandState = item?.effective?.proactive_command_enabled ? "开启" : "关闭"
    lines.push(`群 ${item.group_id}：主动指令${commandState}`)
  }

  return await ctx.reply(lines.join("\n"))
}

function pickUserFavoriteCommand(rows = []) {
  const bestByUser = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    const uid = String(row?.user_id || "")
    if (!uid) continue
    const current = bestByUser.get(uid)
    if (!current) {
      bestByUser.set(uid, row)
      continue
    }
    const count = Number(row?.count || 0)
    const currentCount = Number(current?.count || 0)
    if (count > currentCount) {
      bestByUser.set(uid, row)
      continue
    }
    if (count === currentCount && Number(row?.last_triggered_at || 0) > Number(current?.last_triggered_at || 0)) {
      bestByUser.set(uid, row)
    }
  }

  return Array.from(bestByUser.values()).sort((a, b) => {
    if (Number(b?.count || 0) !== Number(a?.count || 0)) return Number(b?.count || 0) - Number(a?.count || 0)
    return Number(b?.last_triggered_at || 0) - Number(a?.last_triggered_at || 0)
  })
}

export async function runProactiveCommandTick(ctxLike, botApi) {
  const cfg = getConfig()
  if (!cfg?.proactive?.enable || !cfg?.proactive?.command_enable) return false
  if (!botApi || typeof botApi.buildSyntheticCommandEvent !== "function" || typeof botApi.invokeCommandByReg !== "function") {
    return false
  }

  const whitelist = getCommandWhitelist()
  if (!whitelist.length) return false

  const hourBucket = new Date().getHours()
  const ids = new Set([...Object.keys(cfg?.groups || {}), ...Array.from(heatByGroup.keys())])
  if (cfg?.proactive?.allow_default) {
    const more = await listGroupIdsFromMessageDbTables().catch(() => [])
    for (const gid of more) ids.add(String(gid))
  }

  for (const gid of Array.from(ids)) {
    const groupCfg = getEffectiveGroupConfig(gid)
    if (!groupCfg?.proactive_enabled || !groupCfg?.proactive_command_enabled) continue

    const heat = await ensureHeatForGroup(gid).catch(() => null)
    if (!heat || Number(heat?.messagesToday || 0) < Number(cfg?.proactive?.min_messages_today || 0)) continue

    const favorites = await CommandUsageDB.getHourlyFavoriteCommands({
      groupId: gid,
      hourBucket,
      whitelistRegs: whitelist,
      historyDays: cfg?.proactive?.command_history_days,
      minCount: cfg?.proactive?.command_min_count,
    }).catch(() => [])
    if (!favorites.length) continue

    for (const favorite of pickUserFavoriteCommand(favorites)) {
      const uid = String(favorite?.user_id || "")
      const reg = String(favorite?.reg || "")
      const pluginName = String(favorite?.plugin || "").trim()
      const rawCommand = String(favorite?.raw_command || "").trim()
      if (!uid || !reg || !rawCommand) continue

      const state = await getProactiveCommandStateCached(gid, uid)
      const today = localDayKey()
      const cooldownMs = Math.max(0, Math.floor(Number(cfg?.proactive?.command_cooldown_sec || 0))) * 1000
      const recentManualMs = Math.max(0, Math.floor(Number(cfg?.proactive?.command_recent_manual_sec || 0))) * 1000
      const maxDaily = Math.max(1, Math.floor(Number(cfg?.proactive?.command_max_daily_per_user || 1)))

      const dailyCount =
        String(state?.last_triggered_date_key || "") === today ? Number(state?.daily_trigger_count || 0) : 0
      if (dailyCount >= maxDaily) continue
      if (Number(state?.last_triggered_at || 0) && Date.now() - Number(state.last_triggered_at) < cooldownMs) continue

      const hasRecentManual = recentManualMs
        ? await CommandUsageDB.hasRecentManualUsage({
            groupId: gid,
            userId: uid,
            reg,
            sinceMs: Date.now() - recentManualMs,
          }).catch(() => false)
        : false
      if (hasRecentManual) continue

      const baseMessageRecord = await fetchLatestUserMessageRecord(gid, uid)
      if (!baseMessageRecord) continue
      const maxAgeMs =
        Math.max(1, Math.floor(Number(cfg?.proactive?.command_recent_user_hours || 72))) * 3600 * 1000
      if (Number(baseMessageRecord?.time || 0) * 1000 < Date.now() - maxAgeMs) continue

      const mentionMsg = [
        UniversalMessageSegment.mention(uid),
        UniversalMessageSegment.text(` 自动帮你执行常用指令：${rawCommand}`),
      ]

      const send = ctxLike?.sendMessage || globalThis.Bot?.sendMessage
      if (typeof send !== "function") continue

      await send({ group_id: Number(gid) || gid }, mentionMsg).catch(() => null)

      const synthetic = await botApi.buildSyntheticCommandEvent({
        baseMessageRecord: { ...baseMessageRecord, protocol: favorite?.protocol || runtimeProtocolHint },
        rawCommand,
        reg,
        userId: uid,
        groupId: gid,
        protocol: favorite?.protocol || runtimeProtocolHint,
        flags: {
          __proactiveCommand: true,
          __synthetic: true,
          __skipLearning: true,
          __commandUsageSource: "proactive-command",
        },
      })

      const result = await botApi.invokeCommandByReg(reg, synthetic, {
        event: "message",
        ...(pluginName ? { plugin: pluginName } : {}),
      }).catch(err => {
        console.warn("[learning_chat] proactive command invoke failed:", err?.message || err)
        return false
      })

      if (result === false || result === undefined || result === null) continue

      await patchProactiveCommandState(gid, uid, {
        last_triggered_at: Date.now(),
        last_triggered_reg: reg,
        last_triggered_date_key: today,
        daily_trigger_count: dailyCount + 1,
        updated_at: Date.now(),
      })
      markBotSpoke(gid)
      return true
    }
  }

  return false
}

export async function proactiveTick(ctxLike, botApi = null) {
  const cfg = getConfig()
  if (!cfg?.proactive?.enable) return

  const proactiveCommandOk = await runProactiveCommandTick(ctxLike, botApi).catch(() => false)
  if (proactiveCommandOk) return

  const now = Date.now()
  const minMessagesToday = Math.max(0, Math.floor(toNumber(cfg.proactive.min_messages_today, 30)))
  const silenceFactor = Math.max(1, Math.floor(toNumber(cfg.proactive.silence_factor, 5)))
  const minSilenceSec = Math.max(0, Math.floor(toNumber(cfg.proactive.min_silence_sec, 300)))

  // 无响应退避：min_interval_sec 作为“硬间隔”；backoff_base_sec 作为“无响应退避基准”
  const minIntervalMs =
    Math.max(0, Math.floor(toNumber(cfg.proactive.min_interval_sec, 600))) * 1000
  const backoffBaseMsRaw =
    Math.max(
      0,
      Math.floor(toNumber(cfg.proactive.backoff_base_sec, cfg.proactive.min_interval_sec ?? 600)),
    ) * 1000
  const fallbackBackoffBaseMs = Math.max(60_000, minIntervalMs || 0)
  const backoffBaseMs = backoffBaseMsRaw > 0 ? backoffBaseMsRaw : fallbackBackoffBaseMs

  const maxBackoffExp = Math.max(0, Math.floor(toNumber(cfg.proactive.backoff_max_exp, 6)))
  const maxAttempts = maxBackoffExp + 1

  const protocolHints = [runtimeProtocolHint, ctxLike?.protocol]

  const loadRecentPool = async (gid, { limit = 80 } = {}) => {
    let pool = []
    try {
      if (await doesGroupTableExist(gid)) {
        const table = await MessageDB.getGroupTable(gid)
        const rows = await table.findAll({
          attributes: ["message", "time", "user_id", "message_id"],
          order: [["time", "DESC"]],
          limit: Math.max(1, Math.min(500, Math.floor(Number(limit) || 80))),
        })
        pool = (Array.isArray(rows) ? rows : []).map(r => r?.dataValues ?? r).filter(Boolean)
      }
    } catch {}

    if (!pool.length) {
      const history = await MessageDB.getGroupMsgByDay(gid, 1).catch(() => [])
      pool = Array.isArray(history) ? history.slice(0, limit) : []
    }

    return pool
  }

  const pickContextFromRecentUserMessage = async (gid, groupCfg, bans) => {
    const pool = await loadRecentPool(gid, { limit: 60 }).catch(() => [])
    if (!pool.length) return null

    const botId = getBotSelfId()
    const botIdStr = botId ? String(botId) : ""
    const minTextLen = Math.max(0, Math.floor(toNumber(cfg.learning.min_text_len, 2)))

    for (const rec of pool) {
      const uid = rec?.user_id !== undefined && rec?.user_id !== null ? String(rec.user_id) : ""
      if (botIdStr && uid === botIdStr) continue
      if (uid && groupCfg.block_users.includes(uid)) continue

      const rawSegments = rec?.message
      if (!rawSegments) continue

      const segments = rawToLearningSegments(rawSegments, { protocolHints })
      if (!segments.length) continue

      const info = buildSignature(segments)
      info.segments = segments
      if (!info.hash) continue
      if (bans.has(info.hash)) continue

      const text = String(info.textJoined || "")
      if (text && groupCfg.block_words.some(w => w && text.includes(w))) continue

      if (
        info.textLen > 0 &&
        info.textLen < minTextLen &&
        segments.every(s => s.type === UniversalSegmentType.TEXT)
      ) {
        continue
      }

      return info
    }

    return null
  }

  const pickNextHashByTransitions = async ({ gid, fromHash, bans }) => {
    const from_hash = String(fromHash || "")
    if (!from_hash) return ""

    const minGroups = Math.max(1, Math.floor(toNumber(cfg.learning.cross_group_min_groups, 3)))
    const thresholds = [Math.max(1, Math.floor(toNumber(cfg.learning.reply_threshold, 4))), 1]

    for (const threshold of thresholds) {
      const local = await listLocalCandidates({
        groupId: gid,
        fromHash: from_hash,
        minCount: threshold,
      }).catch(() => [])
      const global = await listGlobalCandidates({
        fromHash: from_hash,
        minCount: threshold,
        minGroups,
      }).catch(() => [])

      const weights = new Map()
      for (const row of local) {
        const to = String(row?.to_hash || "")
        if (!to) continue
        const w = Math.max(0, Number(row?.count) || 0)
        weights.set(to, (weights.get(to) || 0) + w)
      }
      for (const row of global) {
        const to = String(row?.to_hash || row?.toHash || "")
        if (!to) continue
        const w = Math.max(0, Number(row?.totalCount) || 0)
        weights.set(to, (weights.get(to) || 0) + w)
      }

      weights.delete(from_hash)
      for (const h of bans) weights.delete(h)

      const candidates = Array.from(weights.entries())
        .map(([hash, weight]) => ({ hash, weight }))
        .filter(it => it.weight > 0)

      const picked = pickWeighted(candidates)
      if (picked?.hash) return String(picked.hash)
    }

    return ""
  }

  const runProactiveForGroup = async gid => {
    const groupCfg = getEffectiveGroupConfig(gid)
    const bans = await getBanSet(gid)

    const context = await pickContextFromRecentUserMessage(gid, groupCfg, bans)
    if (!context?.hash) return false

    const batchMin = Math.max(1, Math.floor(toNumber(cfg.proactive.batch_min, 1)))
    const batchMax = Math.max(batchMin, Math.floor(toNumber(cfg.proactive.batch_max, 3)))
    const batch = Math.floor(Math.random() * (batchMax - batchMin + 1)) + batchMin

    let fromHash = String(context.hash)
    let sent = 0

    for (let i = 0; i < batch; i++) {
      const nextHash = await pickNextHashByTransitions({ gid, fromHash, bans })
      if (!nextHash) break

      const sigRec = await getSignature(nextHash).catch(() => null)
      const storedRawSegments = sigRec?.segments ? JSON.parse(String(sigRec.segments || "[]")) : []
      const normalizedSegments = rawToLearningSegments(storedRawSegments, { protocolHints })
      const rawSegments =
        Array.isArray(normalizedSegments) && normalizedSegments.length ? normalizedSegments : storedRawSegments
      if (!Array.isArray(rawSegments) || rawSegments.length === 0) break

      const info = buildSignature(rawSegments)
      if (!info.hash) break
      if (bans.has(info.hash)) break

      const text = String(info.textJoined || "")
      if (text && groupCfg.block_words.some(w => w && text.includes(w))) break

      const minTextLen = Math.max(0, Math.floor(toNumber(cfg.learning.min_text_len, 2)))
      if (
        info.textLen > 0 &&
        info.textLen < minTextLen &&
        rawSegments.every(s => s.type === UniversalSegmentType.TEXT)
      ) {
        break
      }

      // 处理 QQNT 图片 rkey（避免历史图片直链过期）

      const ok = await sendLearningSegments(gid, rawSegments, {
        send: ctxLike?.sendMessage || globalThis.Bot?.sendMessage,
        protocol: ctxLike?.protocol || runtimeProtocolHint,
        runtimeProtocolHint,
        afterSend: markBotSpoke,
      }).catch(() => false)
      if (!ok) break

      sent += 1
      fromHash = nextHash
    }

    if (!sent) return false

    // 更新退避状态：连续主动发言未收到用户消息则递增，收到用户消息则重置
    const heat = getHeatState(gid) || {}
    const groupState = await getStateCached(gid)
    const pstate = await getProactiveStateCached(gid)

    const lastSentAt = Math.max(
      Number(groupState?.last_proactive_at) || 0,
      Number(pstate?.last_sent_at) || 0,
    )
    const lastUserMsgAt = Number(heat?.lastUserMsgAt) || 0
    const userRepliedSinceLast = Boolean(lastSentAt && lastUserMsgAt && lastUserMsgAt > lastSentAt)

    let attempts = Math.max(0, Math.floor(Number(pstate?.attempts_no_reply) || 0))
    if (userRepliedSinceLast) attempts = 0

    const nextAttempts = Math.min(maxAttempts, Math.max(1, attempts + 1))
    await patchProactiveState(gid, {
      attempts_no_reply: nextAttempts,
      last_sent_at: Date.now(),
      updated_at: Date.now(),
    })
    await patchState(gid, { last_proactive_at: Date.now() })
    return true
  }

  const ids = new Set([...Object.keys(cfg?.groups || {}), ...listTrackedHeatGroupIds()])

  if (cfg?.proactive?.allow_default) {
    const more = await listGroupIdsFromMessageDbTables().catch(() => [])
    for (const gid of more) ids.add(String(gid))
  }

  const candidates = []

  for (const gidRaw of Array.from(ids)) {
    const gid = String(gidRaw || "")
    if (!gid) continue

    const groupCfg = getEffectiveGroupConfig(gid)
    if (!groupCfg.proactive_enabled) continue

    const heat = await ensureHeatForGroup(gid).catch(() => null)
    if (!heat) continue

    const messagesToday = Math.max(0, Math.floor(toNumber(heat.messagesToday, 0)))
    if (messagesToday < minMessagesToday) continue

    const state = await getStateCached(gid)
    const pstate = await getProactiveStateCached(gid)

    const lastProactiveAt = Math.max(
      Number(state?.last_proactive_at) || 0,
      Number(pstate?.last_sent_at) || 0,
    )
    const lastUserMsgAt = Number(heat.lastUserMsgAt) || 0

    const userRepliedSinceLast = Boolean(
      lastProactiveAt && lastUserMsgAt && lastUserMsgAt > lastProactiveAt,
    )
    let attempts = Math.max(0, Math.floor(Number(pstate?.attempts_no_reply) || 0))
    if (userRepliedSinceLast && attempts) {
      attempts = 0
      // 异步清零即可，避免候选计算被 DB 阻塞
      void patchProactiveState(gid, { attempts_no_reply: 0 }).catch(() => {})
    }

    let backoffDelayMs = 0
    if (attempts > 0) {
      const exp = Math.min(maxBackoffExp, Math.max(0, attempts - 1))
      backoffDelayMs = backoffBaseMs * Math.pow(2, exp)
    }
    const effectiveIntervalMs = Math.max(minIntervalMs, backoffDelayMs)
    if (lastProactiveAt && now - lastProactiveAt < effectiveIntervalMs) continue

    const avgIntervalSec = Math.max(1, toNumber(heat.avgIntervalSec, 120))
    const requiredSilenceSec = Math.max(minSilenceSec, avgIntervalSec * silenceFactor)

    const lastMsgAt = Number(heat.lastMsgAt) || 0
    if (!lastMsgAt) continue
    const silentMs = now - lastMsgAt
    if (silentMs < requiredSilenceSec * 1000) continue

    // 退避后权重降低（减少在“没人理”时持续刷同一个群）
    const weight = messagesToday / Math.pow(2, Math.max(0, attempts - 1))
    candidates.push({ gid, weight })
  }

  let remaining = candidates
  for (let i = 0; i < 3; i++) {
    const picked = pickWeighted(remaining)
    if (!picked) return

    const gid = picked.gid
    const ok = await runProactiveForGroup(gid).catch(() => false)
    if (ok) return

    remaining = remaining.filter(it => it.gid !== gid)
    if (!remaining.length) return
  }
}

export function register(bot) {
  if (!bot || typeof bot.registerCommand !== "function") return

  void initDb().catch(() => {})
  void getConfig()

  // 重启后立即从 MessageDB 回填“今日热度”，避免主动发言因 heatByGroup 为空而失效
  void (async () => {
    try {
      const cfg = getConfig()
      const ids = new Set(Object.keys(cfg?.groups || {}))
      if (cfg?.proactive?.allow_default) {
        const more = await listGroupIdsFromMessageDbTables().catch(() => [])
        for (const gid of more) ids.add(String(gid))
      }
      for (const gid of Array.from(ids)) {
        const groupCfg = getEffectiveGroupConfig(gid)
        if (!groupCfg.proactive_enabled) continue
        await ensureHeatForGroup(gid, { forceBootstrap: true })
      }
    } catch {}
  })()

  bot.registerCommand(
    [
      "^(开启学习|学说话|快学|关闭学习|别学|闭嘴)$",
      1000,
      { example: "@bot 开启学习", desc: "开启/关闭本群学习" },
    ],
    async ctx => {
      if (!ctx?.isGroup || !ctx?.atBot) return false
      return await cmdToggleLearning(ctx)
    },
  )

  bot.registerCommand(
    [
      "^(不可以|达咩|不能说这)$",
      1000,
      { example: "@bot 不可以（回复机器人消息）", desc: "禁用某句已学会的回复" },
    ],
    async ctx => {
      if (!ctx?.isGroup || !ctx?.atBot) return false
      return await cmdBanReply(ctx)
    },
  )

  bot.registerCommand(
    [
      "^(开启主动发言|关闭主动发言|开启主动指令|关闭主动指令)$",
      1000,
      { example: "@bot 开启主动发言", desc: "开启/关闭本群主动发言或主动指令（主人）" },
    ],
    async ctx => {
      if (!ctx?.isGroup || !ctx?.atBot) return false
      return await cmdToggleProactiveSetting(ctx)
    },
  )

  bot.registerCommand(
    [
      "^(|#)查看主动发言群聊$",
      1000,
      { example: ["#查看主动发言群聊"], desc: "查看已开启主动发言的群聊（主人）" },
    ],
    async ctx => {
      return await cmdListProactiveGroups(ctx)
    },
  )

  bot.registerCommand(
    [
      "^(拉黑学习|学习拉黑)$",
      1000,
      { example: "@bot 拉黑学习 @A @B", desc: "将被@成员加入本群学习黑名单（支持多重@）" },
    ],
    async ctx => {
      if (!ctx?.isGroup || !ctx?.atBot) return false
      return await cmdBlockLearningUsers(ctx)
    },
  )

  // main handler: learn/reply/repeat/heat (run late)
  bot.registerCommand(["", 9999], async ctx => {
    try {
      if (!ctx?.isGroup || !ctx?.group_id) return false

      runtimeProtocolHint = String(ctx?.protocol || runtimeProtocolHint || "")

      const gid = String(ctx.group_id)
      const groupCfg = getEffectiveGroupConfig(gid)

      updateHeatFromUserMessage(gid)

      const segments = filterLearningSegments(ctx.message || [])
      const info = buildSignature(segments)
      info.segments = segments

      if (shouldIgnoreForLearning(ctx, groupCfg, info)) return false

      // repeat first (can reply even when learning disabled)
      await handleRepeat(ctx, groupCfg, info).catch(() => false)

      // learn + auto reply
      await handleLearnAndReply(ctx, groupCfg, info).catch(() => false)

      return false
    } catch (err) {
      console.warn("[learning_chat] handler error:", err?.message || err)
      return false
    }
  })

  // proactive tick each minute
  if (typeof bot.setTask === "function") {
    bot.setTask("0 * * * * *", ctxLike => {
      void proactiveTick(ctxLike, bot).catch(() => {})
    })
  }
}

export function onBotEvent(event) {
  return event
}

export function getHeatSnapshot() {
  return readHeatSnapshot()
}

export function getRuntimeProtocolHint() {
  return runtimeProtocolHint
}

export function invalidateBanCache(groupId) {
  const gid = String(groupId || "")
  if (!gid) return
  banCache.delete(gid)
}
