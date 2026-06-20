import {
  getRuntimeBotOrNull,
  getRawMethod,
  toInt,
  toKeyMap,
} from "../../Bot/api/universal-bot-api-utils.js"

export function registerGroupActions(dispatcher) {
  dispatcher.register("getGroupList", {
    milky: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const raw = getRawMethod(runtimeBot, "getGroupList")
      if (!raw) throw new Error("[getGroupList] API not available")
      return toKeyMap(await raw.call(runtimeBot), "group_id")
    },
    onebotv11: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const raw = getRawMethod(runtimeBot, "getGroupList")
      if (!raw) throw new Error("[getGroupList] API not available")
      const res = await raw.call(runtimeBot, {})
      return toKeyMap(res?.groups ?? res, "group_id")
    },
    icqq: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const raw = getRawMethod(runtimeBot, "getGroupList")
      if (!raw) throw new Error("[getGroupList] API not available")
      const res = await raw.call(runtimeBot)
      return res instanceof Map ? res : toKeyMap(res?.groups ?? res, "group_id")
    },
  })

  dispatcher.register("getGroupInfo", {
    milky: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const gid = toInt(params.group_id ?? params.groupId ?? ctx?.group_id)
      if (gid === undefined) throw new Error("[getGroupInfo] requires group_id")
      const raw = getRawMethod(runtimeBot, "getGroupInfo")
      if (!raw) throw new Error("[getGroupInfo] API not available")
      const res = await raw.call(runtimeBot, { group_id: gid, no_cache: Boolean(params.no_cache) })
      return res?.group ?? res
    },
    onebotv11: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const gid = toInt(params.group_id ?? params.groupId ?? ctx?.group_id)
      if (gid === undefined) throw new Error("[getGroupInfo] requires group_id")
      const raw = getRawMethod(runtimeBot, "getGroupInfo")
      if (!raw) throw new Error("[getGroupInfo] API not available")
      const res = await raw.call(runtimeBot, { group_id: gid, no_cache: Boolean(params.no_cache) })
      return res?.group ?? res
    },
    icqq: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const gid = toInt(params.group_id ?? params.groupId ?? ctx?.group_id)
      if (gid === undefined) throw new Error("[getGroupInfo] requires group_id")
      const raw = getRawMethod(runtimeBot, "getGroupInfo")
      if (!raw) throw new Error("[getGroupInfo] API not available")
      return await raw.call(runtimeBot, gid, Boolean(params.no_cache))
    },
  })

  dispatcher.register("setGroupName", {
    milky: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const gid = toInt(params.group_id ?? params.groupId ?? ctx?.group_id)
      if (gid === undefined) throw new Error("[setGroupName] requires group_id")
      const raw = getRawMethod(runtimeBot, "setGroupName")
      if (!raw) throw new Error("[setGroupName] API not available")
      return await raw.call(runtimeBot, { group_id: gid, new_group_name: String(params.group_name ?? params.groupName) })
    },
    onebotv11: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const gid = toInt(params.group_id ?? params.groupId ?? ctx?.group_id)
      if (gid === undefined) throw new Error("[setGroupName] requires group_id")
      const raw = getRawMethod(runtimeBot, "setGroupName")
      if (!raw) throw new Error("[setGroupName] API not available")
      return await raw.call(runtimeBot, { group_id: gid, group_name: String(params.group_name ?? params.groupName) })
    },
    icqq: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const gid = toInt(params.group_id ?? params.groupId ?? ctx?.group_id)
      if (gid === undefined) throw new Error("[setGroupName] requires group_id")
      const raw = getRawMethod(runtimeBot, "setGroupName")
      if (!raw) throw new Error("[setGroupName] API not available")
      return await raw.call(runtimeBot, gid, String(params.group_name ?? params.groupName))
    },
  })

  dispatcher.register("setGroupWholeMute", {
    milky: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const gid = toInt(params.group_id ?? params.groupId ?? ctx?.group_id)
      const enable = params.enable ?? params.is_mute ?? params.isMute
      if (gid === undefined) throw new Error("[setGroupWholeMute] requires group_id")
      const raw = getRawMethod(runtimeBot, "setGroupWholeMute")
      if (!raw) throw new Error("[setGroupWholeMute] API not available")
      return await raw.call(runtimeBot, { group_id: gid, is_mute: Boolean(enable) })
    },
    onebotv11: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const gid = toInt(params.group_id ?? params.groupId ?? ctx?.group_id)
      const enable = params.enable ?? params.is_mute ?? params.isMute
      if (gid === undefined) throw new Error("[setGroupWholeMute] requires group_id")
      const raw = getRawMethod(runtimeBot, "setGroupWholeMute")
      if (!raw) throw new Error("[setGroupWholeMute] API not available")
      return await raw.call(runtimeBot, { group_id: gid, enable: Boolean(enable) })
    },
    icqq: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const gid = toInt(params.group_id ?? params.groupId ?? ctx?.group_id)
      const enable = params.enable ?? params.is_mute ?? params.isMute
      if (gid === undefined) throw new Error("[setGroupWholeMute] requires group_id")
      const raw = getRawMethod(runtimeBot, "setGroupWholeBan", "setGroupWholeMute")
      if (!raw) throw new Error("[setGroupWholeMute] API not available")
      return await raw.call(runtimeBot, gid, Boolean(enable))
    },
  })

  dispatcher.register("quitGroup", {
    milky: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const gid = toInt(params.group_id ?? params.groupId ?? ctx?.group_id)
      if (gid === undefined) throw new Error("[quitGroup] requires group_id")
      const raw = getRawMethod(runtimeBot, "quitGroup")
      if (!raw) throw new Error("[quitGroup] API not available")
      return await raw.call(runtimeBot, { group_id: gid })
    },
    onebotv11: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const gid = toInt(params.group_id ?? params.groupId ?? ctx?.group_id)
      if (gid === undefined) throw new Error("[quitGroup] requires group_id")
      const raw = getRawMethod(runtimeBot, "quitGroup")
      if (!raw) throw new Error("[quitGroup] API not available")
      return await raw.call(runtimeBot, { group_id: gid, ...(params.is_dismiss !== undefined ? { is_dismiss: Boolean(params.is_dismiss) } : {}) })
    },
    icqq: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const gid = toInt(params.group_id ?? params.groupId ?? ctx?.group_id)
      if (gid === undefined) throw new Error("[quitGroup] requires group_id")
      const raw = getRawMethod(runtimeBot, "setGroupLeave", "quitGroup")
      if (!raw) throw new Error("[quitGroup] API not available")
      return await raw.call(runtimeBot, gid)
    },
  })

  dispatcher.register("acceptGroupRequest", {
    milky: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const raw = getRawMethod(runtimeBot, "acceptGroupRequest")
      if (!raw) throw new Error("[acceptGroupRequest] milky API not available")
      return await raw.call(runtimeBot, {
        group_id: String(params.group_id), user_id: String(params.user_id),
        is_filtered: Boolean(params.is_filtered ?? false), ...(params.reason ? { reason: String(params.reason) } : {}),
      })
    },
    onebotv11: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const raw = getRawMethod(runtimeBot, "acceptGroupRequest")
      if (!raw) throw new Error("[acceptGroupRequest] onebotv11 API not available")
      return await raw.call(runtimeBot, { flag: String(params.flag), sub_type: params.sub_type ?? "add", ...(params.reason ? { reason: String(params.reason) } : {}) })
    },
    icqq: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const raw = getRawMethod(runtimeBot, "setGroupAddRequest", "acceptGroupRequest")
      if (!raw) throw new Error("[acceptGroupRequest] icqq API not available")
      return await raw.call(runtimeBot, String(params.flag), true, params.reason ?? "", params.sub_type ?? "add")
    },
  })

  dispatcher.register("rejectGroupRequest", {
    milky: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const raw = getRawMethod(runtimeBot, "rejectGroupRequest")
      if (!raw) throw new Error("[rejectGroupRequest] milky API not available")
      return await raw.call(runtimeBot, {
        group_id: String(params.group_id), user_id: String(params.user_id),
        is_filtered: Boolean(params.is_filtered ?? false), ...(params.reason ? { reason: String(params.reason) } : {}),
      })
    },
    onebotv11: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const raw = getRawMethod(runtimeBot, "rejectGroupRequest")
      if (!raw) throw new Error("[rejectGroupRequest] onebotv11 API not available")
      return await raw.call(runtimeBot, { flag: String(params.flag), sub_type: params.sub_type ?? "add", reason: params.reason ?? "" })
    },
    icqq: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const raw = getRawMethod(runtimeBot, "setGroupAddRequest", "rejectGroupRequest")
      if (!raw) throw new Error("[rejectGroupRequest] icqq API not available")
      return await raw.call(runtimeBot, String(params.flag), false, params.reason ?? "", params.sub_type ?? "add")
    },
  })
}
