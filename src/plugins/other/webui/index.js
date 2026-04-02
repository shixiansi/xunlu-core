import cfg from "../../../lib/config.js"
import { getUserReactionConfig, loadReactionStore, setUserReactionConfig } from "../model/reaction-store.js"

function normalizeId(value) {
  return String(value ?? "").trim()
}

function normalizeReactionIds(list) {
  const seen = new Set()
  const out = []
  for (const item of Array.isArray(list) ? list : []) {
    const num = Number(item)
    if (!Number.isFinite(num)) continue
    const id = Math.floor(num)
    if (id <= 0 || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

function getMasterIds() {
  const botConfig = cfg.getConfig("bot") || {}
  return Array.isArray(botConfig.masterQQ)
    ? botConfig.masterQQ.map(normalizeId).filter(Boolean)
    : []
}

function hasStoredOverride(userId) {
  const store = loadReactionStore()
  return Boolean(store?.users?.[userId])
}

function getUserDefaults(userId) {
  const masterIds = new Set(getMasterIds())
  return {
    enabled: masterIds.has(userId),
    reactions: [277],
    source: masterIds.has(userId) ? "主人默认启用" : "普通用户默认关闭",
  }
}

function listUserScopes() {
  const store = loadReactionStore()
  const ids = new Set([
    ...Object.keys(store?.users || {}).map(normalizeId).filter(Boolean),
    ...getMasterIds(),
  ])

  return Array.from(ids)
    .sort((a, b) => String(a).localeCompare(String(b), "zh-Hans-CN", { numeric: true }))
    .map(userId => ({
      id: userId,
      label: userId,
      description: hasStoredOverride(userId) ? "已有用户覆盖" : getUserDefaults(userId).source,
    }))
}

function getUserValues(userId) {
  const stored = getUserReactionConfig(userId)
  const defaults = getUserDefaults(userId)
  const reactions = normalizeReactionIds(
    stored?.reactions ?? (stored?.reaction !== undefined ? [stored.reaction] : defaults.reactions),
  )

  return {
    config: {
      enabled: stored ? Boolean(stored.enabled) : defaults.enabled,
      reactions: reactions.length ? reactions : defaults.reactions,
    },
  }
}

function getUserSummary(userId) {
  const stored = getUserReactionConfig(userId)
  const values = getUserValues(userId)
  const reactions = values?.config?.reactions || []
  return [
    `用户 ${userId}`,
    values?.config?.enabled ? "已启用" : "已关闭",
    `表情 ${reactions.join(", ") || "277"}`,
    stored ? "来源：存储覆盖" : `来源：${getUserDefaults(userId).source}`,
  ].join(" | ")
}

export default {
  meta: {
    title: "消息表情回应",
    description: "统一管理 other 插件里的用户级 reaction 覆盖。",
    order: 55,
    tags: ["reaction", "user"],
  },

  definition: {
    sections: [
      {
        id: "user",
        scope: "user",
        title: "用户覆盖",
        emptyText: "这里只展示已有用户覆盖和主人账号。普通用户可先通过聊天指令配置一次，再来这里精调。",
        fields: [
          {
            path: "config.enabled",
            label: "启用表情回应",
            type: "boolean",
          },
          {
            path: "config.reactions",
            label: "表情 ID 列表",
            type: "array",
            rows: 6,
            description: "每行一个表情 ID。留空保存时会自动回落到默认值 277。",
          },
        ],
      },
    ],
  },

  async listScopes({ scope }) {
    if (scope !== "user") return []
    return listUserScopes()
  },

  async getValues({ scope = "user", scopeId = "" } = {}) {
    if (scope !== "user") return { values: {}, meta: {} }
    const userId = normalizeId(scopeId)
    if (!userId) return { values: {}, meta: {} }
    return {
      values: getUserValues(userId),
      meta: {
        summary: getUserSummary(userId),
      },
    }
  },

  async updateValues({ scope = "user", scopeId = "", values = {} } = {}) {
    if (scope !== "user") throw new Error("unsupported scope")
    const userId = normalizeId(scopeId)
    if (!userId) throw new Error("missing user scope id")

    setUserReactionConfig(userId, {
      enabled: Boolean(values?.config?.enabled),
      reactions: values?.config?.reactions || [],
    })

    return {
      values: getUserValues(userId),
      meta: {
        summary: getUserSummary(userId),
      },
      message: `other 用户 ${userId} 表情回应配置已保存`,
    }
  },
}
