import { getOrCreateGroup, getOrCreateUser, loadDb, normalizeId, saveDb } from "../model/store.js"
import { setGroupMemberMute } from "../model/mute.js"
import {
  getRuntimeBotGroupMessageStreak,
  getRuntimeLastGroupMessage,
} from "../../../Bot/runtime-last-message.js"

const NORMAL_MAX_STRIKES = 3
const BOT_REPEAT_MAX_STRIKES = 4
const NORMAL_DURATIONS = [60, 10 * 60, 30 * 60]
const BOT_REPEAT_DURATIONS = [0, 60, 10 * 60, 30 * 60]

// groupId -> { sig, senderId, isMaster, isBot }
const lastByGroup = new Map()
// groupId -> { ts, isAdmin }
const botAdminCache = new Map()
const BOT_ADMIN_CACHE_TTL_MS = 5 * 60 * 1000

function getRuntimePrevMessage(groupId) {
  const gid = normalizeId(groupId)
  if (!gid) return null
  const rec = getRuntimeLastGroupMessage(gid)
  if (!rec || !Array.isArray(rec.message)) return null

  const senderId = normalizeId(rec.senderId)
  const selfId = normalizeId(rec.selfId)
  return {
    sig: signatureFromSegments(rec.message),
    senderId,
    isMaster: Boolean(rec.isMaster),
    isBot: Boolean(rec.isBot || (senderId && selfId && senderId === selfId)),
    ts: Number(rec.ts) || 0,
  }
}

function getRuntimeBotPrevMessages(groupId) {
  const gid = normalizeId(groupId)
  if (!gid) return []
  const list = getRuntimeBotGroupMessageStreak(gid)
  if (!Array.isArray(list) || !list.length) return []

  return list
    .filter(rec => rec && Array.isArray(rec.message))
    .map(rec => {
      const senderId = normalizeId(rec.senderId)
      const selfId = normalizeId(rec.selfId)
      return {
        sig: signatureFromSegments(rec.message),
        senderId,
        isMaster: Boolean(rec.isMaster),
        isBot: Boolean(rec.isBot || (senderId && selfId && senderId === selfId)),
        ts: Number(rec.ts) || 0,
      }
    })
    .filter(rec => rec.sig && rec.isBot)
}

function getBotSelfId(ctx) {
  const raw = ctx?.self_id ?? globalThis.Bot?.uin ?? globalThis.Bot?.user_id ?? globalThis.Bot?.self_id ?? 0
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function unwrapMemberInfo(info) {
  if (!info || typeof info !== "object") return null
  return info?.member ?? info?.data?.member ?? info?.data ?? info
}

function hasAdminPrivilege(info) {
  const member = unwrapMemberInfo(info)
  if (!member || typeof member !== "object") return null

  const role = String(
    member?.role ??
      member?.permission ??
      member?.member_role ??
      member?.memberRole ??
      member?._info?.role ??
      "",
  ).toLowerCase()
  if (role === "owner" || role === "admin") return true
  if (role === "member") return false

  const flags = [
    member?.is_admin,
    member?.isAdmin,
    member?.admin,
    member?.is_owner,
    member?.isOwner,
    member?.owner,
  ]
  if (flags.some(Boolean)) return true
  if (flags.some(v => v === false)) return false
  return null
}

async function resolveBotIsAdmin(ctx, groupId) {
  const gid = normalizeId(groupId)
  if (!gid) return null

  const now = Date.now()
  const cached = botAdminCache.get(gid)
  if (cached && now - cached.ts < BOT_ADMIN_CACHE_TTL_MS) return Boolean(cached.isAdmin)

  if (!ctx) return null

  const selfId = getBotSelfId(ctx)
  if (!selfId) return null

  try {
    if (typeof ctx.getGroupMemberInfo === "function") {
      let info = null
      try {
        info = await ctx.getGroupMemberInfo(gid, selfId)
      } catch {
        info = await ctx.getGroupMemberInfo({ group_id: gid, user_id: selfId }).catch(() => null)
      }
      const remoteResult = hasAdminPrivilege(info)
      if (remoteResult !== null) {
        botAdminCache.set(gid, { ts: now, isAdmin: remoteResult })
        return remoteResult
      }
    }

    const localInfo =
      ctx?.group?.pickMember?.(selfId)?.info ??
      ctx?.group?.pickMember?.(selfId)?._info ??
      null
    const localResult = hasAdminPrivilege(localInfo)
    if (localResult !== null) {
      botAdminCache.set(gid, { ts: now, isAdmin: localResult })
      return localResult
    }
  } catch {}

  return null
}

function localDayKey(ts = Date.now()) {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function formatDuration(seconds) {
  const sec = Math.max(0, Math.floor(Number(seconds) || 0))
  if (sec >= 3600) return `${Math.floor(sec / 3600)}小时`
  if (sec >= 60) return `${Math.floor(sec / 60)}分钟`
  return `${sec}秒`
}

function signatureFromSegments(segments) {
  if (!Array.isArray(segments) || !segments.length) return ""

  const tryMilkyResourceSha1 = resourceId => {
    const raw = String(resourceId || "").trim()
    if (!raw) return ""
    try {
      const buf = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64")
      if (buf.length >= 22 && buf[0] === 0x12 && buf[1] === 0x14) {
        return buf.slice(2, 22).toString("hex").toUpperCase()
      }
    } catch {}
    return ""
  }

  const normalizeHttpUrl = raw => {
    const url = String(raw || "").trim()
    if (!url) return ""
    try {
      const u = new URL(url)
      u.hash = ""
      const params = u.searchParams
      for (const k of Array.from(params.keys())) {
        const kl = String(k).toLowerCase()
        if (kl === "rkey" || kl === "reky") params.delete(k)
      }

      const entries = Array.from(params.entries()).sort((a, b) => {
        const keyOrder = String(a[0]).localeCompare(String(b[0]))
        if (keyOrder !== 0) return keyOrder
        return String(a[1]).localeCompare(String(b[1]))
      })
      const stable = new URLSearchParams(entries).toString()
      u.search = stable ? `?${stable}` : ""
      return u.toString()
    } catch {
      return url
        .replace(/([?&])(rkey|reky)=[^&]*/gi, "$1")
        .replace(/\?&/, "?")
        .replace(/&&+/, "&")
        .replace(/[?&]$/, "")
    }
  }

  const normalizeMediaKey = raw => {
    const text = String(raw || "").trim()
    if (!text) return ""
    if (text.startsWith("base64://")) return `base64:${text.length}`
    if (text.startsWith("file://")) return `file:${text.slice("file://".length)}`
    if (text.startsWith("http://") || text.startsWith("https://")) return normalizeHttpUrl(text)
    return text
  }

  const parts = []
  for (const seg of segments) {
    if (!seg || typeof seg !== "object") continue
    const type = String(seg.type || "")
    const data = seg.data || {}

    switch (type) {
      case "text": {
        const content = String(data.content ?? "")
          .replace(/\s+/g, " ")
          .trim()
        if (content) parts.push(`t:${content}`)
        break
      }
      case "mention": {
        const target = data.target !== undefined ? String(data.target) : ""
        if (target) parts.push(`@:${target}`)
        break
      }
      case "mentionAll":
        parts.push("@all")
        break
      case "face":
      case "emoji": {
        const id = data.id !== undefined ? String(data.id) : ""
        parts.push(id ? `face:${id}` : "face")
        break
      }
      case "image": {
        const milkySha1 = tryMilkyResourceSha1(data.fileId)
        const key = milkySha1
          ? `milkysha1:${milkySha1}`
          : normalizeMediaKey(data.fileId || data.url || data.path || "")
        parts.push(key ? `img:${key}` : "img")
        break
      }
      case "file": {
        const key = data.fileId || data.url || data.name || ""
        parts.push(key ? `file:${key}` : "file")
        break
      }
      case "reply": {
        const key = data.msgId || data.seq || ""
        parts.push(key ? `reply:${key}` : "reply")
        break
      }
      default: {
        const safe = (() => {
          try {
            return JSON.stringify(data).slice(0, 120)
          } catch {
            return ""
          }
        })()
        parts.push(`${type}:${safe}`)
        break
      }
    }
  }

  return parts.join("|").trim()
}

function durationByStrike(strike, { botMessage = false } = {}) {
  const durations = botMessage ? BOT_REPEAT_DURATIONS : NORMAL_DURATIONS
  const maxStrikes = botMessage ? BOT_REPEAT_MAX_STRIKES : NORMAL_MAX_STRIKES
  const idx = Math.max(1, Math.min(maxStrikes, Math.floor(Number(strike) || 1))) - 1
  return durations[idx] ?? durations[durations.length - 1]
}

function pickRandom(list) {
  const arr = Array.isArray(list) ? list : []
  if (!arr.length) return ""
  return arr[Math.floor(Math.random() * arr.length)] || ""
}

function cuteWarnText({ strike, durationSeconds }) {
  const durationText = formatDuration(durationSeconds)
  const templates = {
    1: [
      `哎呀，不要复读啦，先冷静 ${durationText} 好不好？`,
      `捕捉到一只复读机，罚你安静 ${durationText}～`,
      `复读会把可爱值扣光的，先安静 ${durationText} 哦。`,
    ],
    2: [
      `又复读啦，我都记住你了，这次冷静 ${durationText}。`,
      `复读 +1，这次要安静 ${durationText}。`,
      `别再复读啦，真的会被抓住的，禁言 ${durationText}。`,
    ],
    3: [
      `第三次啦，只好把你抱去小黑屋 ${durationText}。`,
      `复读三连击，可爱惩罚是禁言 ${durationText}。`,
      `再复读我就要生气啦，这次安静 ${durationText}。`,
    ],
  }

  const cappedStrike = Math.min(NORMAL_MAX_STRIKES, Math.max(1, Number(strike) || 1))
  const text = pickRandom(templates[cappedStrike])
  return text
    ? `${text}（今天第 ${strike} 次复读）`
    : `检测到复读：禁言 ${durationText}（今天第 ${strike} 次）`
}

function cuteBotRepeatText({ strike, durationSeconds = 0, muted = false }) {
  const durationText = durationSeconds > 0 ? formatDuration(durationSeconds) : ""
  const templates = {
    1: [
      "学我说话是吧，哼，这次先记下来。",
      "不许模仿我说话啦，我要鼓起脸生气一下下了。",
      "哼哼，怎么连我的话都要复读，先原谅你这一次。",
    ],
    2: [
      `还学我说话，罚你冷静 ${durationText}。`,
      `第二次啦，我真的要生气了，先安静 ${durationText} 吧。`,
      `再学我说话就要挨罚啦，这次禁言 ${durationText}。`,
    ],
    3: [
      `又来学我说话，脸都气鼓了，冷静 ${durationText}。`,
      `第三次复读机器人台词，罚你安静 ${durationText}。`,
      `哼，我说一句你学一句是吧？这次 ${durationText}。`,
    ],
    4: [
      `还复读我，这次要认真生气了，禁言 ${durationText}。`,
      `第四次了，不可以再学我说话，老实冷静 ${durationText}。`,
      `我真的生气啦，把你抱去小黑屋 ${durationText}。`,
    ],
  }

  const cappedStrike = Math.min(BOT_REPEAT_MAX_STRIKES, Math.max(1, Number(strike) || 1))
  const text = pickRandom(templates[cappedStrike])
  if (text) return `${text}（今天第 ${strike} 次复读机器人消息）`
  if (!muted) return `不可以复读机器人消息哦（今天第 ${strike} 次）`
  return `复读机器人消息：禁言 ${durationText}（今天第 ${strike} 次）`
}

function isBotSender(ctx, senderId) {
  const selfId = normalizeId(getBotSelfId(ctx))
  return Boolean(selfId) && selfId === normalizeId(senderId)
}

function getTodayStrikeCount(user) {
  const today = localDayKey()
  const userDay = typeof user.strikeDay === "string" ? user.strikeDay : ""
  let strikesToday = Number(user.strikesToday)
  if (!Number.isFinite(strikesToday) || strikesToday < 0) strikesToday = 0
  strikesToday = Math.floor(strikesToday)

  if (userDay !== today) {
    const legacyStrikes = Math.floor(Number(user.strikes || 0))
    const legacyDay = user.lastStrikeAt ? localDayKey(user.lastStrikeAt) : ""
    strikesToday =
      legacyDay === today && Number.isFinite(legacyStrikes) && legacyStrikes > 0 ? legacyStrikes : 0
  }

  return { today, strikesToday }
}

function bumpNormalStrike(user) {
  const { today, strikesToday } = getTodayStrikeCount(user)
  const nextStrike = Math.min(NORMAL_MAX_STRIKES, strikesToday + 1)
  user.strikeDay = today
  user.strikesToday = nextStrike
  user.strikes = nextStrike
  user.lastStrikeAt = Date.now()
  return { today, nextStrike }
}

function bumpBotRepeatStrike(user) {
  const today = localDayKey()
  const userDay = typeof user.botRepeatDay === "string" ? user.botRepeatDay : ""
  let strikesToday = Number(user.botRepeatToday)
  if (!Number.isFinite(strikesToday) || strikesToday < 0) strikesToday = 0
  strikesToday = userDay === today ? Math.floor(strikesToday) : 0

  const nextStrike = Math.min(BOT_REPEAT_MAX_STRIKES, strikesToday + 1)
  user.botRepeatDay = today
  user.botRepeatToday = nextStrike
  user.lastBotRepeatAt = Date.now()
  return { today, nextStrike }
}

function buildMuteFailureText(
  errMsg,
  { botMessage = false, strike = 1, durationSeconds = 0, adminState = null } = {},
) {
  const suffix = adminState === false ? " 当前检测结果显示 bot 可能没有禁言权限。" : ""
  if (botMessage) {
    return `${cuteBotRepeatText({ strike, durationSeconds, muted: true })} 不过这次禁言失败了：${errMsg || "未知错误"}${suffix}`
  }
  return `检测到复读，但禁言失败：${errMsg || "未知错误"}${suffix}`
}

async function replyMuteFailure(
  ctx,
  senderId,
  errMsg,
  { botMessage = false, strike = 1, durationSeconds = 0 } = {},
) {
  const text = botMessage
    ? `${cuteBotRepeatText({ strike, durationSeconds, muted: true })} 不过这次禁言失败了：${errMsg || "未知错误"}`
    : `检测到复读，但禁言失败：${errMsg || "未知错误"}`
  return await ctx.reply(text, false, { at: senderId })
}

function shouldIgnoreForRepeat(ctx) {
  const msg = String(ctx?.msg || "").trim()
  if (!msg) return false
  if (msg.startsWith("解禁") || msg.startsWith("全部解禁")) return true
  return false
}

function parseUnbanTargetFromText(ctx) {
  const msg = String(ctx?.msg || "").trim()
  const m = msg.match(/^解禁\s*(\d{4,13})$/)
  return m ? m[1] : ""
}

async function cmdUnban(ctx) {
  if (!ctx?.isGroup) return false
  if (!ctx?.isMaster) return await ctx.reply("无权限：仅主人可解禁")

  const msg = String(ctx?.msg || "").trim()
  const isAll = /^解禁\s*全部$/.test(msg) || msg === "全部解禁"

  const groupId = normalizeId(ctx.group_id)
  if (!groupId) return await ctx.reply("缺少 group_id")

  const db = loadDb()
  const group = getOrCreateGroup(db, groupId)
  if (!group) return await ctx.reply("群数据初始化失败")

  if (isAll) {
    const muted = group.muted || {}
    const ids = Object.keys(muted)
    if (!ids.length) return await ctx.reply("本群没有记录在案的禁言")

    group.muted = {}
    saveDb(db)

    let ok = 0
    let fail = 0
    for (const uid of ids) {
      try {
        const res = await setGroupMemberMute(ctx, { groupId, userId: uid, durationSeconds: 0 })
        if (res && res.ok === false) fail++
        else ok++
      } catch {
        fail++
      }
    }

    return await ctx.reply(`已全部解禁：成功 ${ok}，失败 ${fail}`)
  }

  const targetId = normalizeId(ctx.at || parseUnbanTargetFromText(ctx))
  if (!targetId) return await ctx.reply("用法：解禁 @某人 / 解禁 123456 / 解禁全部")

  if (group.muted && group.muted[targetId]) delete group.muted[targetId]
  saveDb(db)

  const res = await setGroupMemberMute(ctx, { groupId, userId: targetId, durationSeconds: 0 })
  if (res && res.ok === false) {
    return await ctx.reply(`解禁失败：${res.error || "未知错误"}`)
  }

  return await ctx.reply("已解禁", false, { at: targetId })
}

async function applyRepeatMute(
  ctx,
  { db, group, groupId, senderId, strike, today, botMessage = false } = {},
) {
  const duration = durationByStrike(strike, { botMessage })

  if (duration <= 0) {
    saveDb(db)
    return await ctx.reply(cuteBotRepeatText({ strike, muted: false }), false, { at: senderId })
  }

  if (false && !(await resolveBotIsAdmin(ctx, groupId))) {
    if (botMessage) {
      saveDb(db)
      return await ctx.reply(
        `${cuteBotRepeatText({ strike, durationSeconds: duration, muted: true })} 可惜我现在没有禁言权限。`,
        false,
        { at: senderId },
      )
    }
    return false
  }

  if (!group.muted || typeof group.muted !== "object") group.muted = {}
  group.muted[senderId] = {
    mutedAt: Date.now(),
    until: Date.now() + duration * 1000,
    duration,
    strike,
    day: today,
    reason: botMessage ? "repeat_bot" : "repeat",
  }
  saveDb(db)

  let muteRes
  try {
    muteRes = await setGroupMemberMute(ctx, {
      groupId,
      userId: senderId,
      durationSeconds: duration,
    })
  } catch (err) {
    return await replyMuteFailure(ctx, senderId, err?.message || "未知错误", {
      botMessage,
      strike,
      durationSeconds: duration,
    })
  }

  if (muteRes && muteRes.ok === false) {
    return await replyMuteFailure(ctx, senderId, muteRes.error || "未知错误", {
      botMessage,
      strike,
      durationSeconds: duration,
    })
  }

  const replyText = botMessage
    ? cuteBotRepeatText({ strike, durationSeconds: duration, muted: true })
    : cuteWarnText({ strike, durationSeconds: duration })
  return await ctx.reply(replyText, false, { at: senderId })
}

async function handleRepeat(ctx) {
  if (!ctx?.isGroup) return false
  if (!ctx?.group_id) return false
  if (shouldIgnoreForRepeat(ctx)) return false

  const groupId = normalizeId(ctx.group_id)
  const senderId = normalizeId(ctx.user_id ?? ctx.sender_id)
  if (!groupId || !senderId) return false

  const sig = signatureFromSegments(ctx.message)
  if (!sig) return false

  const current = {
    sig,
    senderId,
    isMaster: Boolean(ctx?.isMaster),
    isBot: isBotSender(ctx, senderId),
  }
  const botPrevList = getRuntimeBotPrevMessages(groupId)
  const prev = getRuntimePrevMessage(groupId) || lastByGroup.get(groupId)

  if (current.isMaster || current.isBot) {
    lastByGroup.set(groupId, current)
    return false
  }

  if (botPrevList.some(item => item.sig === sig)) {
    const db = loadDb()
    const group = getOrCreateGroup(db, groupId)
    if (!group) return false
    const user = getOrCreateUser(group, senderId)
    if (!user) return false

    const { today, nextStrike } = bumpBotRepeatStrike(user)
    return await applyRepeatMute(ctx, {
      db,
      group,
      groupId,
      senderId,
      strike: nextStrike,
      today,
      botMessage: true,
    })
  }

  if (!prev) {
    lastByGroup.set(groupId, current)
    return false
  }

  if (prev.sig !== sig) {
    lastByGroup.set(groupId, current)
    return false
  }

  const db = loadDb()
  const group = getOrCreateGroup(db, groupId)
  if (!group) return false
  const user = getOrCreateUser(group, senderId)
  if (!user) return false

  if (prev.isBot) {
    const { today, nextStrike } = bumpBotRepeatStrike(user)
    return await applyRepeatMute(ctx, {
      db,
      group,
      groupId,
      senderId,
      strike: nextStrike,
      today,
      botMessage: true,
    })
  }

  lastByGroup.set(groupId, current)
  const { today, nextStrike } = bumpNormalStrike(user)
  return await applyRepeatMute(ctx, {
    db,
    group,
    groupId,
    senderId,
    strike: nextStrike,
    today,
    botMessage: false,
  })
}

export function register(bot) {
  if (!bot || typeof bot.registerCommand !== "function") return

  bot.registerCommand(["^(解禁\\s*全部|全部解禁|解禁(\\s*\\d{4,13})?)$", 900], async ctx => {
    return await cmdUnban(ctx)
  })

  bot.registerCommand(["", 200], async ctx => {
    try {
      return await handleRepeat(ctx)
    } catch (err) {
      console.error("[fudu-ban] error:", err)
      return false
    }
  })
}

export function onBotEvent(event) {
  return event
}
