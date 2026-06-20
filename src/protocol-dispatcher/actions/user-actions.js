import {
  getRuntimeBotOrNull,
  getRuntimeBotFallback,
  getRawMethod,
  toInt,
  toKeyMap,
} from "../../Bot/api/universal-bot-api-utils.js"

export function registerUserActions(dispatcher) {
  dispatcher.register("getLoginInfo", {
    milky: async () => {
      const runtimeBot = getRuntimeBotOrNull()
      const user_id = toInt(runtimeBot?.uin) ?? 0
      const nickname = runtimeBot?.nickname ? String(runtimeBot.nickname) : ""
      return { user_id, nickname }
    },
    onebotv11: async () => {
      const runtimeBot = getRuntimeBotOrNull()
      const raw = getRawMethod(runtimeBot, "getLoginInfo")
      if (raw) return await raw.call(runtimeBot)
      // fallback: icqq style
      const user_id = toInt(runtimeBot?.uin) ?? 0
      const nickname = runtimeBot?.nickname ? String(runtimeBot.nickname) : ""
      return { user_id, nickname }
    },
    icqq: async () => {
      const runtimeBot = getRuntimeBotOrNull()
      const user_id = toInt(runtimeBot?.uin) ?? 0
      const nickname = runtimeBot?.nickname ? String(runtimeBot.nickname) : ""
      return { user_id, nickname }
    },
  })

  dispatcher.register("getFriendList", {
    milky: async () => {
      const runtimeBot = getRuntimeBotOrNull()
      const raw = getRawMethod(runtimeBot, "getFriendList")
      if (!raw) throw new Error("[getFriendList] API not available")
      const res = await raw.call(runtimeBot, {})
      return toKeyMap(res?.friends ?? res, "user_id")
    },
    onebotv11: async () => {
      const runtimeBot = getRuntimeBotOrNull()
      const raw = getRawMethod(runtimeBot, "getFriendList")
      if (!raw) throw new Error("[getFriendList] API not available")
      const res = await raw.call(runtimeBot, {})
      return toKeyMap(res?.friends ?? res, "user_id")
    },
    icqq: async () => {
      const runtimeBot = getRuntimeBotOrNull()
      const raw = getRawMethod(runtimeBot, "getFriendList")
      if (!raw) throw new Error("[getFriendList] API not available")
      const res = await raw.call(runtimeBot)
      return res instanceof Map ? res : toKeyMap(res?.friends ?? res, "user_id")
    },
  })

  dispatcher.register("getFriendInfo", {
    milky: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const uid = toInt(params.user_id ?? params.userId ?? ctx?.user_id ?? ctx?.sender_id)
      if (uid === undefined) throw new Error("[getFriendInfo] requires user_id")
      const raw = getRawMethod(runtimeBot, "getFriendInfo")
      if (!raw) throw new Error("[getFriendInfo] API not available")
      const res = await raw.call(runtimeBot, { user_id: uid, no_cache: Boolean(params.no_cache) })
      return res?.friend ?? res
    },
    onebotv11: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const uid = toInt(params.user_id ?? params.userId ?? ctx?.user_id ?? ctx?.sender_id)
      if (uid === undefined) throw new Error("[getFriendInfo] requires user_id")
      const raw = getRawMethod(runtimeBot, "getFriendInfo")
      if (raw) {
        try { return await raw.call(runtimeBot, { user_id: uid, no_cache: Boolean(params.no_cache) }) } catch {}
      }
      // fallback: use pickUser directly (icqq getStrangerInfo 内部在 takeover 下会因 proxy 而崩溃)
      if (runtimeBot?.pickUser) {
        const user = runtimeBot.pickUser(uid)
        if (user && typeof user === "object") return user
      }
      throw new Error("[getFriendInfo] API not available")
    },
    icqq: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const uid = toInt(params.user_id ?? params.userId ?? ctx?.user_id ?? ctx?.sender_id)
      if (uid === undefined) throw new Error("[getFriendInfo] requires user_id")

      // pickUser 优先于 getStrangerInfo（后者在 takeover 下因 proxy 而崩溃）
      if (runtimeBot?.pickUser) {
        const user = runtimeBot.pickUser(uid)
        if (user && typeof user === "object") return user
      }

      const rawGetStranger = runtimeBot?.__xunlu_raw_getStrangerInfo || runtimeBot?.getStrangerInfo
      if (rawGetStranger) {
        try { return await rawGetStranger.call(runtimeBot, uid) } catch {}
      }

      const raw = getRawMethod(runtimeBot, "getFriendInfo")
      if (!raw) throw new Error("[getFriendInfo] icqq API not available")
      const res = await raw.call(runtimeBot, { user_id: uid, no_cache: Boolean(params.no_cache) })
      return res?.friend ?? res
    },
  })

  dispatcher.register("getUserInfo", {
    milky: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const uid = toInt(params.user_id ?? params.userId ?? ctx?.user_id ?? ctx?.sender_id)
      if (uid === undefined) throw new Error("[getUserInfo] requires user_id")
      if (runtimeBot?.getUserProfile) {
        try { return await runtimeBot.getUserProfile({ user_id: uid }) } catch {}
      }
      return { user_id: uid, nickname: String(uid) }
    },
    onebotv11: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const uid = toInt(params.user_id ?? params.userId ?? ctx?.user_id ?? ctx?.sender_id)
      if (uid === undefined) throw new Error("[getUserInfo] requires user_id")
      if (runtimeBot?.getFriendInfo) {
        try { return await runtimeBot.getFriendInfo({ user_id: uid, no_cache: Boolean(params.no_cache) }) } catch {}
      }
      return { user_id: uid, nickname: String(uid) }
    },
    icqq: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const uid = toInt(params.user_id ?? params.userId ?? ctx?.user_id ?? ctx?.sender_id)
      if (uid === undefined) throw new Error("[getUserInfo] requires user_id")
      if (runtimeBot?.getStrangerInfo) {
        try { return await runtimeBot.getStrangerInfo(uid) } catch {}
      }
      if (runtimeBot?.getFriendInfo) {
        try { return await runtimeBot.getFriendInfo({ user_id: uid }) } catch {}
      }
      return { user_id: uid, nickname: String(uid) }
    },
  })

  dispatcher.register("sendProfileLike", {
    milky: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const uid = toInt(params.user_id ?? params.userId ?? ctx?.user_id)
      if (uid === undefined) throw new Error("[sendProfileLike] requires user_id")
      const raw = getRawMethod(runtimeBot, "sendProfileLike")
      if (!raw) throw new Error("[sendProfileLike] milky API not available")
      const times = params.times ?? 1
      return await raw.call(runtimeBot, { user_id: uid, times: Number(times) })
    },
    onebotv11: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const fallbackBot = getRuntimeBotFallback()
      const uid = toInt(params.user_id ?? params.userId ?? ctx?.user_id)
      if (uid === undefined) throw new Error("[sendProfileLike] requires user_id")
      const times = Number(params.times ?? 1)
      const rtT = typeof runtimeBot
      const fbT = typeof fallbackBot
      console.error("[sendProfileLike] entry", { uid, times, runtimeBot: rtT, fallbackBot: fbT, same: runtimeBot === fallbackBot })
      console.error("[sendProfileLike] rt.methods:", { sendApi: typeof runtimeBot?.sendApi, callApi: typeof runtimeBot?.callApi, thumbUp: typeof runtimeBot?.thumbUp, pickFriend: typeof runtimeBot?.pickFriend })
      if (fallbackBot) {
        console.error("[sendProfileLike] fb.methods:", { sendApi: typeof fallbackBot.sendApi, callApi: typeof fallbackBot.callApi, thumbUp: typeof fallbackBot.thumbUp, pickFriend: typeof fallbackBot.pickFriend, pickUser: typeof fallbackBot.pickUser, raw_sendApi: typeof fallbackBot.__xunlu_raw_sendApi })
      }

      let lastErr = null
      const extractMsg = e => e?.error?.message || e?.wording || e?.message || ''
      const toErr = e => { const msg = extractMsg(e); return msg ? new Error(msg) : (e instanceof Error ? e : new Error(String(e))) }
      const logErr = (label, e) => { lastErr = toErr(e); console.error("[sendProfileLike] " + label + " failed:", lastErr.message) }

      // 1) raw sendProfileLike
      if (typeof runtimeBot?.sendProfileLike === "function") {
        const raw = runtimeBot.__xunlu_raw_sendProfileLike ?? runtimeBot.sendProfileLike
        if (raw !== runtimeBot.sendProfileLike?.__xunlu_universal) {
          try { return await raw.call(runtimeBot, { user_id: uid, times }) } catch (e) { logErr("raw.sendProfileLike", e) }
        } else {
          try { return await runtimeBot.sendProfileLike({ user_id: uid, times }) } catch (e) { logErr("raw.sendProfileLike(call)", e) }
        }
      }

      // 2) runtimeBot icqq (standalone)
      if (runtimeBot?.pickFriend) {
        try {
          const friend = runtimeBot.pickFriend(uid)
          if (friend?.thumbUp) { const r = await friend.thumbUp(times); if (r !== undefined) return r }
        } catch (e) { logErr("rt.pickFriend.thumbUp", e) }
      }
      if (runtimeBot?.thumbUp) {
        try { const r = await runtimeBot.thumbUp(uid, times); if (r !== undefined) return r } catch (e) { logErr("rt.thumbUp", e) }
      }
      if (runtimeBot?.pickUser) {
        try {
          const user = runtimeBot.pickUser(uid)
          if (user?.sendLike) { const r = await user.sendLike(times); if (r !== undefined) return r }
        } catch (e) { logErr("rt.pickUser.sendLike", e) }
      }

      // 3) fallbackBot icqq (takeover mode)
      if (fallbackBot && fallbackBot !== runtimeBot) {
        if (typeof fallbackBot.thumbUp === "function") {
          try { const r = await fallbackBot.thumbUp(uid, times); if (r !== undefined) return r } catch (e) { logErr("fb.thumbUp", e) }
        }
        if (typeof fallbackBot.pickFriend === "function") {
          try {
            const friend = fallbackBot.pickFriend(uid)
            if (friend && typeof friend.thumbUp === "function") { const r = await friend.thumbUp(times); if (r !== undefined) return r }
          } catch (e) { logErr("fb.pickFriend.thumbUp", e) }
        }
        if (typeof fallbackBot.pickUser === "function") {
          try {
            const user = fallbackBot.pickUser(uid)
            if (user && typeof user.sendLike === "function") { const r = await user.sendLike(times); if (r !== undefined) return r }
          } catch (e) { logErr("fb.pickUser.sendLike", e) }
        }
      }

      // 4) native sendApi / callApi (try raw backups first, then native, skip universal)
      const trySend = async (label, fn, ...args) => {
        if (typeof fn !== "function") { console.error("[sendProfileLike] " + label + ": fn not available"); return }
        if (fn.__xunlu_universal) {
          const raw = runtimeBot?.__xunlu_raw_sendApi ?? runtimeBot?.__xunlu_raw_callApi
          if (typeof raw === "function" && !raw.__xunlu_universal) {
            try { const r = await raw(...args); if (r !== undefined) return r } catch (e) { logErr(label + "(raw)", e); return }
          }
          console.error("[sendProfileLike] " + label + ": universal wrapper, no raw backup")
          return
        }
        try { const r = await fn(...args); if (r !== undefined) return r } catch (e) { logErr(label + "(native)", e) }
      }
      let r
      r = await trySend("sendApi(two-arg)", runtimeBot?.sendApi, "send_like", { user_id: uid, times }); if (r !== undefined) return r
      r = await trySend("sendApi(route)", runtimeBot?.sendApi, { action: "send_like", params: { user_id: uid, times } }); if (r !== undefined) return r
      r = await trySend("callApi(two-arg)", runtimeBot?.callApi, "send_like", { user_id: uid, times }); if (r !== undefined) return r
      r = await trySend("callApi(route)", runtimeBot?.callApi, { action: "send_like", params: { user_id: uid, times } }); if (r !== undefined) return r

      // 5) fallbackBot raw sendApi
      if (fallbackBot && fallbackBot !== runtimeBot && fallbackBot?.__xunlu_raw_sendApi) {
        try { const r = await fallbackBot.__xunlu_raw_sendApi({ action: "send_like", params: { user_id: uid, times } }); if (r !== undefined) return r } catch (e) { logErr("fb.raw_sendApi(route)", e) }
      }

      // 6) takeover state adapter callApi
      if (runtimeBot?.__xunlu_takeover_state?.adapter?.callApi) {
        try { const r = await runtimeBot.__xunlu_takeover_state.adapter.callApi("send_like", { user_id: uid, times }); if (r !== undefined) return r } catch (e) { logErr("takeover.adapter.callApi", e) }
      }

      if (lastErr) { console.error("[sendProfileLike] all fallbacks failed, throwing lastErr:", lastErr.message); throw lastErr }
      console.error("[sendProfileLike] no fallback available, throwing generic")
      throw new Error("[sendProfileLike] onebotv11 API not available")
    },
    icqq: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const uid = toInt(params.user_id ?? params.userId ?? ctx?.user_id)
      if (uid === undefined) throw new Error("[sendProfileLike] requires user_id")
      if (runtimeBot?.pickUser) {
        const user = runtimeBot.pickUser(uid)
        if (user?.sendLike) return await user.sendLike(Number(params.times ?? 1))
      }
      const raw = getRawMethod(runtimeBot, "sendProfileLike")
      if (!raw) throw new Error("[sendProfileLike] icqq API not available")
      const times = params.times ?? 1
      return await raw.call(runtimeBot, uid, Number(times))
    },
  })

  dispatcher.register("acceptFriendRequest", {
    milky: async (params) => {
      const runtimeBot = getRuntimeBotOrNull()
      const raw = getRawMethod(runtimeBot, "acceptFriendRequest")
      if (!raw) throw new Error("[acceptFriendRequest] milky API not available")
      return await raw.call(runtimeBot, { initiator_uid: String(params.initiator_uid), is_filtered: Boolean(params.is_filtered ?? false), ...(params.reason ? { reason: String(params.reason) } : {}) })
    },
    onebotv11: async (params) => {
      const runtimeBot = getRuntimeBotOrNull()
      const raw = getRawMethod(runtimeBot, "acceptFriendRequest")
      if (!raw) throw new Error("[acceptFriendRequest] onebotv11 API not available")
      return await raw.call(runtimeBot, { flag: String(params.flag), ...(params.remark ? { remark: String(params.remark) } : {}) })
    },
    icqq: async (params) => {
      const runtimeBot = getRuntimeBotOrNull()
      const raw = getRawMethod(runtimeBot, "setFriendAddRequest", "acceptFriendRequest")
      if (!raw) throw new Error("[acceptFriendRequest] icqq API not available")
      return await raw.call(runtimeBot, String(params.flag), true, params.remark ?? "", params.block)
    },
  })

  dispatcher.register("rejectFriendRequest", {
    milky: async (params) => {
      const runtimeBot = getRuntimeBotOrNull()
      const raw = getRawMethod(runtimeBot, "rejectFriendRequest")
      if (!raw) throw new Error("[rejectFriendRequest] milky API not available")
      return await raw.call(runtimeBot, { initiator_uid: String(params.initiator_uid), is_filtered: Boolean(params.is_filtered ?? false), ...(params.reason ? { reason: String(params.reason) } : {}) })
    },
    onebotv11: async (params) => {
      const runtimeBot = getRuntimeBotOrNull()
      const raw = getRawMethod(runtimeBot, "rejectFriendRequest")
      if (!raw) throw new Error("[rejectFriendRequest] onebotv11 API not available")
      return await raw.call(runtimeBot, { flag: String(params.flag), remark: params.remark ?? "" })
    },
    icqq: async (params) => {
      const runtimeBot = getRuntimeBotOrNull()
      const raw = getRawMethod(runtimeBot, "setFriendAddRequest", "rejectFriendRequest")
      if (!raw) throw new Error("[rejectFriendRequest] icqq API not available")
      return await raw.call(runtimeBot, String(params.flag), false, params.remark ?? "", params.block)
    },
  })
}
