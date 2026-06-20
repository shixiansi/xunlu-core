import {
  getRuntimeBotOrNull,
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
      const uid = toInt(params.user_id ?? params.userId ?? ctx?.user_id)
      if (uid === undefined) throw new Error("[sendProfileLike] requires user_id")
      const times = Number(params.times ?? 1)
      const raw = getRawMethod(runtimeBot, "sendProfileLike")
      if (raw) {
        try { return await raw.call(runtimeBot, { user_id: uid, times }) } catch {}
      }
      // fallback: pickFriend.thumbUp
      if (runtimeBot?.pickFriend) {
        try {
          const friend = runtimeBot.pickFriend(uid)
          if (friend?.thumbUp) return await friend.thumbUp(times)
        } catch {}
      }
      // fallback: runtimeBot.thumbUp
      if (runtimeBot?.thumbUp) {
        try { return await runtimeBot.thumbUp(uid, times) } catch {}
      }
      // fallback: pickUser.sendLike
      if (runtimeBot?.pickUser) {
        try {
          const user = runtimeBot.pickUser(uid)
          if (user?.sendLike) return await user.sendLike(times)
        } catch {}
      }
      // fallback: sendApi 走 adapter
      if (typeof runtimeBot?.sendApi === "function") {
        try { return await runtimeBot.sendApi("send_like", { user_id: uid, times }) } catch {}
      }
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
