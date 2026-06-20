import {
  getBotNoticeConfig,
  getGlobalNoticeConfig,
  getGroupNoticeConfig,
  getSystemNoticeConfig,
  loadNoticeStore,
  setBotNoticeConfig,
  setGlobalNoticeConfig,
  setGroupNoticeConfig,
  setSystemNoticeConfig,
} from "../model/notice-store.js"

function normalizeId(value) {
  return String(value ?? "").trim()
}

function countEnabledFlags(config = {}) {
  return Object.values(config).filter(Boolean).length
}

function sortByNumericString(a, b) {
  return String(a).localeCompare(String(b), "zh-Hans-CN", { numeric: true })
}

function normalizeGroupItems(raw) {
  if (raw instanceof Map) return Array.from(raw.entries()).map(([id, info]) => ({ id, info }))
  if (Array.isArray(raw)) {
    return raw.map(item => ({
      id: item?.group_id ?? item?.groupId ?? item?.id,
      info: item,
    }))
  }
  if (raw && typeof raw === "object") {
    if (raw.groups instanceof Map) return normalizeGroupItems(raw.groups)
    if (Array.isArray(raw.groups)) return normalizeGroupItems(raw.groups)
  }
  return []
}

function normalizeBotIds() {
  const store = loadNoticeStore()
  const ids = new Set(Object.keys(store?.bots || {}).map(normalizeId).filter(Boolean))
  const runtimeBot = globalThis.xunluCore?.bot?.getRuntimeBot?.() || globalThis.__xunlu_runtime_bot

  for (const value of [runtimeBot?.uin, runtimeBot?.self_id, runtimeBot?.user_id]) {
    const id = normalizeId(value)
    if (id) ids.add(id)
  }

  return Array.from(ids).sort(sortByNumericString)
}

async function listGroupScopes() {
  const store = loadNoticeStore()
  const groups = new Map()

  for (const groupId of Object.keys(store?.groups || {})) {
    const id = normalizeId(groupId)
    if (!id) continue
    groups.set(id, {
      id,
      label: id,
      description: "已有通知覆盖",
    })
  }

  const runtimeBot = globalThis.xunluCore?.bot?.getRuntimeBot?.() || globalThis.__xunlu_runtime_bot
  if (runtimeBot?.gl instanceof Map) {
    for (const [groupId, info] of runtimeBot.gl.entries()) {
      const id = normalizeId(groupId)
      if (!id) continue
      const name = String(info?.group_name ?? info?.groupName ?? "").trim()
      const previous = groups.get(id)
      groups.set(id, {
        id,
        label: name ? `${id} · ${name}` : id,
        description: previous?.description || "来自运行时群列表",
      })
    }
  }

  if (typeof runtimeBot?.getGroupList === "function") {
    try {
      const raw = await runtimeBot.getGroupList()
      for (const item of normalizeGroupItems(raw)) {
        const id = normalizeId(item.id)
        if (!id) continue
        const name = String(item.info?.group_name ?? item.info?.groupName ?? "").trim()
        const previous = groups.get(id)
        groups.set(id, {
          id,
          label: name ? `${id} · ${name}` : id,
          description: previous?.description || "来自运行时群列表",
        })
      }
    } catch {}
  }

  return Array.from(groups.values()).sort((a, b) => sortByNumericString(a.id, b.id))
}

function listBotScopes() {
  return normalizeBotIds().map(botId => ({
    id: botId,
    label: botId,
    description: "机器人账号通知配置",
  }))
}

function getGlobalValues() {
  return {
    system: getSystemNoticeConfig(),
    global: getGlobalNoticeConfig(),
  }
}

function getBotValues(botId) {
  return {
    config: getBotNoticeConfig(botId),
  }
}

function getGroupValues(groupId) {
  return {
    config: getGroupNoticeConfig(groupId),
  }
}

function getGlobalSummary() {
  const system = getSystemNoticeConfig()
  const globalConfig = getGlobalNoticeConfig()
  return [
    `通知全部主人 ${system.notify_all_masters ? "开启" : "关闭"}`,
    `去重缓存 TTL ${system.cache_ttl_sec} 秒`,
    `好友列表变动 ${globalConfig.friend_list_change ? "开启" : "关闭"}`,
  ].join(" | ")
}

function getBotSummary(botId) {
  const config = getBotNoticeConfig(botId)
  return [`Bot ${botId}`, `已启用 ${countEnabledFlags(config)}/4 项`].join(" | ")
}

function getGroupSummary(groupId) {
  const config = getGroupNoticeConfig(groupId)
  return [`群 ${groupId}`, `已启用 ${countEnabledFlags(config)}/8 项`].join(" | ")
}

export default {
  meta: {
    title: "群通知",
    description: "统一管理 group 插件的系统、机器人和群级通知开关。",
    order: 35,
    tags: ["group", "notice"],
  },

  definition: {
    sections: [
      {
        id: "system",
        scope: "global",
        title: "系统通知",
        fields: [
          {
            path: "system.notify_all_masters",
            label: "通知全部主人",
            type: "boolean",
            description: "关闭时仅通知第一个主人账号。",
          },
          {
            path: "system.cache_ttl_sec",
            label: "去重缓存 TTL",
            type: "number",
            min: 1,
            description: "相同通知在该秒数内只发送一次。",
          },
        ],
      },
      {
        id: "global",
        scope: "global",
        title: "全局通知",
        fields: [
          {
            path: "global.friend_list_change",
            label: "好友列表变动",
            type: "boolean",
          },
        ],
      },
      {
        id: "bot",
        scope: "bot",
        title: "机器人级通知",
        emptyText: "当前还没有可选 Bot 账号。启动 Bot 后，这里会自动出现运行中的 self_id。",
        fields: [
          { path: "config.friend_message", label: "好友消息", type: "boolean" },
          { path: "config.friend_recall", label: "好友撤回", type: "boolean" },
          { path: "config.friend_request", label: "好友申请", type: "boolean" },
          { path: "config.group_invite", label: "群邀请", type: "boolean" },
        ],
      },
      {
        id: "group",
        scope: "group",
        title: "群级通知",
        emptyText: "当前没有可选群号。Bot 接入群列表后，这里会展示运行时群号和已有覆盖。",
        fields: [
          { path: "config.group_message", label: "群消息", type: "boolean" },
          { path: "config.group_temp_message", label: "群临时消息", type: "boolean" },
          { path: "config.group_recall", label: "群撤回", type: "boolean" },
          { path: "config.group_join_request", label: "入群申请", type: "boolean" },
          { path: "config.group_member_change", label: "群成员变动", type: "boolean" },
          { path: "config.group_admin_change", label: "管理员变动", type: "boolean" },
          { path: "config.bot_muted", label: "Bot 被禁言", type: "boolean" },
          { path: "config.group_list_change", label: "群列表变动", type: "boolean" },
        ],
      },
    ],
  },

  async listScopes({ scope }) {
    if (scope === "bot") return listBotScopes()
    if (scope === "group") return await listGroupScopes()
    return []
  },

  async getValues({ scope = "global", scopeId = "" } = {}) {
    if (scope === "bot") {
      const botId = normalizeId(scopeId)
      if (!botId) return { values: {}, meta: {} }
      return {
        values: getBotValues(botId),
        meta: {
          summary: getBotSummary(botId),
        },
      }
    }

    if (scope === "group") {
      const groupId = normalizeId(scopeId)
      if (!groupId) return { values: {}, meta: {} }
      return {
        values: getGroupValues(groupId),
        meta: {
          summary: getGroupSummary(groupId),
        },
      }
    }

    return {
      values: getGlobalValues(),
      meta: {
        summary: getGlobalSummary(),
      },
    }
  },

  async updateValues({ scope = "global", scopeId = "", values = {} } = {}) {
    if (scope === "bot") {
      const botId = normalizeId(scopeId)
      if (!botId) throw new Error("missing bot scope id")
      setBotNoticeConfig(botId, values?.config || {})
      return {
        values: getBotValues(botId),
        meta: {
          summary: getBotSummary(botId),
        },
        message: `group Bot ${botId} 通知配置已保存`,
      }
    }

    if (scope === "group") {
      const groupId = normalizeId(scopeId)
      if (!groupId) throw new Error("missing group scope id")
      setGroupNoticeConfig(groupId, values?.config || {})
      return {
        values: getGroupValues(groupId),
        meta: {
          summary: getGroupSummary(groupId),
        },
        message: `group 群 ${groupId} 通知配置已保存`,
      }
    }

    setSystemNoticeConfig(values?.system || {})
    setGlobalNoticeConfig(values?.global || {})
    return {
      values: getGlobalValues(),
      meta: {
        summary: getGlobalSummary(),
      },
      message: "group 全局通知配置已保存",
    }
  },
}
