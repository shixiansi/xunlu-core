import {
  getRuntimeBotOrNull,
  getRawMethod,
  toInt,
  toMemberMap,
} from "../../Bot/api/universal-bot-api-utils.js"

export function registerMemberActions(dispatcher) {
  dispatcher.register("getGroupMemberList", {
    milky: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const gid = toInt(params.group_id ?? ctx?.group_id)
      if (gid === undefined) throw new Error("[getGroupMemberList] requires group_id")
      const raw = getRawMethod(runtimeBot, "getGroupMemberList")
      if (raw) return toMemberMap(await raw.call(runtimeBot, { group_id: gid }))
      throw new Error("[getGroupMemberList] milky API not available")
    },
    onebotv11: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const gid = toInt(params.group_id ?? ctx?.group_id)
      if (gid === undefined) throw new Error("[getGroupMemberList] requires group_id")
      let lastError = null
      // try onebotv11 style first
      const raw = getRawMethod(runtimeBot, "getGroupMemberList")
      if (raw) {
        try { return toMemberMap(await raw.call(runtimeBot, { group_id: gid })) } catch (err) { lastError = err }
        try { return toMemberMap(await raw.call(runtimeBot, gid)) } catch (err) { lastError = err }
      }
      // fallback: icqq style
      if (runtimeBot?.pickGroup) {
        try {
          const group = runtimeBot.pickGroup(gid)
          if (group?.getMemberMap) return await group.getMemberMap()
        } catch (err) { lastError = err }
      }
      throw lastError || new Error("[getGroupMemberList] API not available")
    },
    icqq: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const gid = toInt(params.group_id ?? ctx?.group_id)
      if (gid === undefined) throw new Error("[getGroupMemberList] requires group_id")
      let lastError = null
      if (runtimeBot?.pickGroup) {
        try {
          const group = runtimeBot.pickGroup(gid)
          if (group?.getMemberMap) return await group.getMemberMap()
        } catch (err) { lastError = err }
      }
      const raw = getRawMethod(runtimeBot, "getGroupMemberList")
      if (raw) {
        try { return toMemberMap(await raw.call(runtimeBot, gid)) }
        catch (err) { lastError = err }
        try { return toMemberMap(await raw.call(runtimeBot, { group_id: gid })) }
        catch {}
      }
      throw lastError || new Error("[getGroupMemberList] API not available")
    },
  })

  dispatcher.register("getGroupMemberInfo", {
    milky: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const gid = toInt(params.group_id ?? ctx?.group_id)
      const uid = toInt(params.user_id ?? ctx?.user_id ?? ctx?.sender_id)
      if (gid === undefined || uid === undefined) throw new Error("[getGroupMemberInfo] requires group_id/user_id")
      const raw = getRawMethod(runtimeBot, "getGroupMemberInfo")
      if (raw) return await raw.call(runtimeBot, { group_id: gid, user_id: uid, no_cache: Boolean(params.no_cache) })
      throw new Error("[getGroupMemberInfo] milky API not available")
    },
    onebotv11: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const gid = toInt(params.group_id ?? ctx?.group_id)
      const uid = toInt(params.user_id ?? ctx?.user_id ?? ctx?.sender_id)
      if (gid === undefined || uid === undefined) throw new Error("[getGroupMemberInfo] requires group_id/user_id")
      const raw = getRawMethod(runtimeBot, "getGroupMemberInfo")
      if (raw) {
        try { return await raw.call(runtimeBot, { group_id: gid, user_id: uid, no_cache: Boolean(params.no_cache) }) } catch {}
      }
      // fallback: icqq style
      if (runtimeBot?.pickGroup) {
        const group = runtimeBot.pickGroup(gid)
        if (group?.pickMember) return group.pickMember(uid)
      }
      throw new Error("[getGroupMemberInfo] onebotv11 API not available")
    },
    icqq: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const gid = toInt(params.group_id ?? ctx?.group_id)
      const uid = toInt(params.user_id ?? ctx?.user_id ?? ctx?.sender_id)
      if (gid === undefined || uid === undefined) throw new Error("[getGroupMemberInfo] requires group_id/user_id")
      if (runtimeBot?.pickGroup) {
        const group = runtimeBot.pickGroup(gid)
        if (group?.pickMember) {
          const member = group.pickMember(uid)
          if (member) return member
        }
      }
      const raw = getRawMethod(runtimeBot, "getGroupMemberInfo")
      if (raw) return await raw.call(runtimeBot, gid, uid, Boolean(params.no_cache))
      throw new Error("[getGroupMemberInfo] icqq API not available")
    },
  })

  dispatcher.register("setGroupMemberCard", {
    milky: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const gid = toInt(params.group_id ?? ctx?.group_id)
      const uid = toInt(params.user_id ?? ctx?.user_id ?? ctx?.sender_id)
      if (gid === undefined || uid === undefined) throw new Error("[setGroupMemberCard] requires group_id/user_id")
      const raw = getRawMethod(runtimeBot, "setGroupMemberCard")
      if (!raw) throw new Error("[setGroupMemberCard] milky API not available")
      return await raw.call(runtimeBot, { group_id: gid, user_id: uid, card: String(params.card) })
    },
    onebotv11: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const gid = toInt(params.group_id ?? ctx?.group_id)
      const uid = toInt(params.user_id ?? ctx?.user_id ?? ctx?.sender_id)
      if (gid === undefined || uid === undefined) throw new Error("[setGroupMemberCard] requires group_id/user_id")
      const raw = getRawMethod(runtimeBot, "setGroupMemberCard")
      if (raw) {
        try { return await raw.call(runtimeBot, { group_id: gid, user_id: uid, card: String(params.card) }) } catch {}
      }
      // fallback: icqq style
      if (runtimeBot?.pickGroup) {
        const group = runtimeBot.pickGroup(gid)
        if (group?.setCard) return await group.setCard(uid, String(params.card))
      }
      throw new Error("[setGroupMemberCard] onebotv11 API not available")
    },
    icqq: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const gid = toInt(params.group_id ?? ctx?.group_id)
      const uid = toInt(params.user_id ?? ctx?.user_id ?? ctx?.sender_id)
      if (gid === undefined || uid === undefined) throw new Error("[setGroupMemberCard] requires group_id/user_id")
      const raw = getRawMethod(runtimeBot, "setGroupCard", "setGroupMemberCard")
      if (!raw) throw new Error("[setGroupMemberCard] icqq API not available")
      return await raw.call(runtimeBot, gid, uid, String(params.card))
    },
  })

  dispatcher.register("setGroupMemberAdmin", {
    milky: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const gid = toInt(params.group_id ?? ctx?.group_id)
      const uid = toInt(params.user_id ?? ctx?.user_id ?? ctx?.sender_id)
      const enable = params.enable ?? params.is_set ?? params.isSet
      if (gid === undefined || uid === undefined) throw new Error("[setGroupMemberAdmin] requires group_id/user_id")
      const raw = getRawMethod(runtimeBot, "setGroupMemberAdmin")
      if (!raw) throw new Error("[setGroupMemberAdmin] milky API not available")
      return await raw.call(runtimeBot, { group_id: gid, user_id: uid, is_set: Boolean(enable) })
    },
    onebotv11: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const gid = toInt(params.group_id ?? ctx?.group_id)
      const uid = toInt(params.user_id ?? ctx?.user_id ?? ctx?.sender_id)
      const enable = params.enable ?? params.is_set ?? params.isSet
      if (gid === undefined || uid === undefined) throw new Error("[setGroupMemberAdmin] requires group_id/user_id")
      const raw = getRawMethod(runtimeBot, "setGroupMemberAdmin")
      if (raw) {
        try { return await raw.call(runtimeBot, { group_id: gid, user_id: uid, enable: Boolean(enable) }) } catch {}
      }
      // fallback: icqq style
      if (runtimeBot?.pickGroup) {
        const group = runtimeBot.pickGroup(gid)
        if (group?.setAdmin) return await group.setAdmin(uid, Boolean(enable))
      }
      throw new Error("[setGroupMemberAdmin] onebotv11 API not available")
    },
    icqq: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const gid = toInt(params.group_id ?? ctx?.group_id)
      const uid = toInt(params.user_id ?? ctx?.user_id ?? ctx?.sender_id)
      const enable = params.enable ?? params.is_set ?? params.isSet
      if (gid === undefined || uid === undefined) throw new Error("[setGroupMemberAdmin] requires group_id/user_id")
      const raw = getRawMethod(runtimeBot, "setGroupAdmin", "setGroupMemberAdmin")
      if (!raw) throw new Error("[setGroupMemberAdmin] icqq API not available")
      return await raw.call(runtimeBot, gid, uid, Boolean(enable))
    },
  })

  dispatcher.register("setGroupMemberSpecialTitle", {
    milky: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const gid = toInt(params.group_id ?? ctx?.group_id)
      const uid = toInt(params.user_id ?? ctx?.user_id ?? ctx?.sender_id)
      if (gid === undefined || uid === undefined) throw new Error("[setGroupMemberSpecialTitle] requires group_id/user_id")
      const raw = getRawMethod(runtimeBot, "setGroupMemberSpecialTitle")
      if (!raw) throw new Error("[setGroupMemberSpecialTitle] milky API not available")
      return await raw.call(runtimeBot, { group_id: gid, user_id: uid, special_title: String(params.special_title) })
    },
    onebotv11: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const gid = toInt(params.group_id ?? ctx?.group_id)
      const uid = toInt(params.user_id ?? ctx?.user_id ?? ctx?.sender_id)
      if (gid === undefined || uid === undefined) throw new Error("[setGroupMemberSpecialTitle] requires group_id/user_id")
      const raw = getRawMethod(runtimeBot, "setGroupMemberSpecialTitle")
      if (raw) {
        try { return await raw.call(runtimeBot, { group_id: gid, user_id: uid, special_title: String(params.special_title), ...(params.duration !== undefined ? { duration: Number(params.duration) } : {}) }) } catch {}
      }
      // fallback: icqq style
      if (runtimeBot?.pickGroup) {
        const group = runtimeBot.pickGroup(gid)
        if (group?.setSpecialTitle) return await group.setSpecialTitle(uid, String(params.special_title), params.duration ?? 0)
      }
      throw new Error("[setGroupMemberSpecialTitle] onebotv11 API not available")
    },
    icqq: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const gid = toInt(params.group_id ?? ctx?.group_id)
      const uid = toInt(params.user_id ?? ctx?.user_id ?? ctx?.sender_id)
      if (gid === undefined || uid === undefined) throw new Error("[setGroupMemberSpecialTitle] requires group_id/user_id")
      const raw = getRawMethod(runtimeBot, "setGroupSpecialTitle", "setGroupMemberSpecialTitle")
      if (!raw) throw new Error("[setGroupMemberSpecialTitle] icqq API not available")
      return await raw.call(runtimeBot, gid, uid, String(params.special_title), params.duration)
    },
  })

  dispatcher.register("setGroupMemberMute", {
    milky: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const gid = toInt(params.group_id ?? ctx?.group_id)
      const uid = toInt(params.user_id ?? ctx?.user_id ?? ctx?.sender_id)
      const duration = params.duration ?? params.mute_duration ?? 600
      if (gid === undefined || uid === undefined) throw new Error("[setGroupMemberMute] requires group_id/user_id")
      const raw = getRawMethod(runtimeBot, "setGroupMemberMute")
      if (!raw) throw new Error("[setGroupMemberMute] milky API not available")
      return await raw.call(runtimeBot, { group_id: gid, user_id: uid, mute_duration: Number(duration) })
    },
    onebotv11: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const gid = toInt(params.group_id ?? ctx?.group_id)
      const uid = toInt(params.user_id ?? ctx?.user_id ?? ctx?.sender_id)
      const duration = params.duration ?? params.mute_duration ?? 600
      if (gid === undefined || uid === undefined) throw new Error("[setGroupMemberMute] requires group_id/user_id")
      const raw = getRawMethod(runtimeBot, "setGroupMemberMute")
      if (raw) {
        try { return await raw.call(runtimeBot, { group_id: gid, user_id: uid, duration: Number(duration) }) } catch {}
      }
      // fallback: icqq style
      if (runtimeBot?.pickGroup) {
        const group = runtimeBot.pickGroup(gid)
        if (group?.muteMember) return await group.muteMember(uid, Number(duration))
      }
      throw new Error("[setGroupMemberMute] onebotv11 API not available")
    },
    icqq: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const gid = toInt(params.group_id ?? ctx?.group_id)
      const uid = toInt(params.user_id ?? ctx?.user_id ?? ctx?.sender_id)
      const duration = params.duration ?? params.mute_duration ?? 600
      if (gid === undefined || uid === undefined) throw new Error("[setGroupMemberMute] requires group_id/user_id")
      if (runtimeBot?.pickGroup) {
        const group = runtimeBot.pickGroup(gid)
        if (group?.muteMember) return await group.muteMember(uid, Number(duration))
      }
      const raw = getRawMethod(runtimeBot, "setGroupMemberMute")
      if (!raw) throw new Error("[setGroupMemberMute] icqq API not available")
      return await raw.call(runtimeBot, gid, uid, Number(duration))
    },
  })

  dispatcher.register("kickGroupMember", {
    milky: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const gid = toInt(params.group_id ?? ctx?.group_id)
      const uid = toInt(params.user_id ?? ctx?.user_id ?? ctx?.sender_id)
      if (gid === undefined || uid === undefined) throw new Error("[kickGroupMember] requires group_id/user_id")
      const raw = getRawMethod(runtimeBot, "kickGroupMember")
      if (!raw) throw new Error("[kickGroupMember] milky API not available")
      return await raw.call(runtimeBot, { group_id: gid, user_id: uid })
    },
    onebotv11: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const gid = toInt(params.group_id ?? ctx?.group_id)
      const uid = toInt(params.user_id ?? ctx?.user_id ?? ctx?.sender_id)
      const rejectAdd = params.reject_add_request ?? params.rejectAddRequest
      if (gid === undefined || uid === undefined) throw new Error("[kickGroupMember] requires group_id/user_id")
      const raw = getRawMethod(runtimeBot, "kickGroupMember")
      if (raw) {
        try { return await raw.call(runtimeBot, { group_id: gid, user_id: uid, ...(rejectAdd !== undefined ? { reject_add_request: Boolean(rejectAdd) } : {}) }) } catch {}
      }
      // fallback: icqq style
      if (runtimeBot?.pickGroup) {
        const group = runtimeBot.pickGroup(gid)
        if (group?.kickMember) return await group.kickMember(uid, Boolean(rejectAdd))
      }
      throw new Error("[kickGroupMember] onebotv11 API not available")
    },
    icqq: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const gid = toInt(params.group_id ?? ctx?.group_id)
      const uid = toInt(params.user_id ?? ctx?.user_id ?? ctx?.sender_id)
      const rejectAdd = params.reject_add_request ?? params.rejectAddRequest
      if (gid === undefined || uid === undefined) throw new Error("[kickGroupMember] requires group_id/user_id")
      const raw = getRawMethod(runtimeBot, "setGroupKick", "kickGroupMember")
      if (!raw) throw new Error("[kickGroupMember] icqq API not available")
      return await raw.call(runtimeBot, gid, uid, Boolean(rejectAdd), params.message)
    },
  })
}
