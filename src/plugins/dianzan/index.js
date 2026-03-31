const CAP_CACHE_TTL_SEC = 86400
const memoryCapCache = new Map()

function nowMs() {
  return Date.now()
}

function toInt(value) {
  if (value === undefined || value === null) return undefined
  const v = typeof value === "string" ? value.trim() : value
  if (v === "") return undefined
  const num = Number(v)
  if (!Number.isFinite(num)) return undefined
  return Math.trunc(num)
}

function safeJsonParse(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function normalizeCap(value) {
  if (!value || typeof value !== "object") return null
  const vip = value.vip === true ? true : value.vip === false ? false : undefined
  const can50 = value.can50 === true ? true : value.can50 === false ? false : undefined
  const updatedAt = Number.isFinite(Number(value.updatedAt)) ? Number(value.updatedAt) : undefined
  if (vip === undefined && can50 === undefined) return null
  return { ...(vip !== undefined ? { vip } : {}), ...(can50 !== undefined ? { can50 } : {}), ...(updatedAt !== undefined ? { updatedAt } : {}) }
}

function capCacheKey(selfId) {
  return `xunlu:dianzan:like_cap:${selfId}`
}

async function readCapCache(selfId) {
  const sid = toInt(selfId)
  if (sid === undefined) return null
  const key = capCacheKey(sid)

  const mem = memoryCapCache.get(key)
  if (mem && mem.expireAt > nowMs()) return mem.value

  const client = globalThis.redis
  if (!client || typeof client.get !== "function") return null

  try {
    const raw = await client.get(key)
    const parsed = normalizeCap(safeJsonParse(raw))
    if (!parsed) return null
    memoryCapCache.set(key, { value: parsed, expireAt: nowMs() + CAP_CACHE_TTL_SEC * 1000 })
    return parsed
  } catch {
    return null
  }
}

async function writeCapCache(selfId, cap) {
  const sid = toInt(selfId)
  if (sid === undefined) return
  const normalized = normalizeCap(cap)
  if (!normalized) return
  const key = capCacheKey(sid)

  const payload = JSON.stringify({ ...normalized, updatedAt: nowMs() })
  memoryCapCache.set(key, { value: normalizeCap(safeJsonParse(payload)) || normalized, expireAt: nowMs() + CAP_CACHE_TTL_SEC * 1000 })

  const client = globalThis.redis
  if (!client || typeof client.set !== "function") return
  try {
    await client.set(key, payload, { EX: CAP_CACHE_TTL_SEC })
  } catch {}
}

async function resolveSelfId(ctx) {
  const sid = toInt(ctx?.self_id)
  if (sid !== undefined) return sid

  if (typeof ctx?.getLoginInfo === "function") {
    try {
      const info = await ctx.getLoginInfo()
      const id = toInt(info?.user_id ?? info?.uin ?? info?.self_id)
      if (id !== undefined) return id
    } catch {}
  }

  return undefined
}

function buildAttemptList({ isFriend, cap }) {
  const vip = cap?.vip
  if (!isFriend) return [20]
  if (vip === false) return [10]
  return [20, 10]
}

function deriveCapUpdate({ capBefore, attempts, successTimes }) {
  const prevVip = capBefore?.vip
  const prevCan50 = capBefore?.can50

  let vip = prevVip
  let can50 = prevCan50

  const idx50 = attempts.indexOf(50)
  const idx20 = attempts.indexOf(20)
  const idx10 = attempts.indexOf(10)

  if (successTimes === 50) {
    vip = true
    can50 = true
  } else if (successTimes === 20) {
    vip = true
    if (idx50 !== -1 && idx20 !== -1 && idx50 < idx20) {
      // 50 失败后 20 成功 => 50 不可用但 VIP 可用
      can50 = false
    }
  } else if (successTimes === 10) {
    if (idx20 !== -1 && idx10 !== -1 && idx20 < idx10) {
      // 20 失败后 10 成功 => 非 VIP（也无法 50）
      vip = false
      can50 = false
    }
  }

  if (vip === false) can50 = false

  const next = normalizeCap({ ...(vip !== undefined ? { vip } : {}), ...(can50 !== undefined ? { can50 } : {}) })
  if (!next) return null

  const changed = next.vip !== prevVip || next.can50 !== prevCan50
  return changed ? next : null
}

export default {
  name: "dianzan",
  register(botApi) {
    if (!botApi?.registerCommand) return

    botApi.registerCommand(
      [
        "^[#]?(点赞|赞我|给我点赞)$",
        1000,
        {
          example: ["#点赞", "#赞我", "#给我点赞"],
          desc: "资料卡点赞（陌生人固定20；好友VIP=20否则10）",
        },
      ],
      async ctx => {
        try {
          // 仅支持“赞我/给我点赞/点赞”：目标固定为触发者本人
          const user_id = toInt(ctx?.user_id)

          if (user_id === undefined) {
            return await ctx.reply("点赞失败：未能解析目标用户ID")
          }

          if (typeof ctx?.sendProfileLike !== "function") {
            return await ctx.reply("点赞失败：当前环境缺少 sendProfileLike（请更新 xunlu-core 通用 API）")
          }

          const selfId = await resolveSelfId(ctx)
          const capBefore = await readCapCache(selfId)

          let isFriend = false
          try {
            const friends = await ctx.getFriendList()
            if (friends instanceof Map) {
              isFriend = friends.has(user_id) || friends.has(String(user_id))
            }
          } catch {
            // getFriendList 不可用时按陌生人处理
            isFriend = false
          }

          const attempts = buildAttemptList({ isFriend, cap: capBefore })
          let lastError = null

          for (const times of attempts) {
            try {
              await ctx.sendProfileLike({ user_id, times })

              const capUpdate = deriveCapUpdate({ capBefore, attempts, successTimes: times })
              if (capUpdate) await writeCapCache(selfId, capUpdate)

              return await ctx.reply(`已给 ${user_id} 点赞 x${times}`)
            } catch (error) {
              lastError = error
            }
          }

          const msg = lastError?.message || String(lastError || "")
          const shortMsg = msg.length > 200 ? msg.slice(0, 200) + "..." : msg
          return await ctx.reply(`点赞失败：${shortMsg || "unknown error"}`)
        } catch (error) {
          const msg = error?.message || String(error)
          const shortMsg = msg.length > 200 ? msg.slice(0, 200) + "..." : msg
          return await ctx.reply(`点赞失败：${shortMsg}`)
        }
      },
    )
  },
}
