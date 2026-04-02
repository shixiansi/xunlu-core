import {
  getEffectiveRepeatMuteEnabled,
  getGlobalRepeatMuteEnabled,
  getGroupRepeatMuteOverride,
  getOrCreateGroup,
  loadDb,
  saveDb,
  setGlobalRepeatMuteEnabled,
  setGroupRepeatMuteEnabled,
} from "../model/store.js"

function toTriState(value) {
  if (value === undefined || value === null) return "inherit"
  return value ? "true" : "false"
}

function fromTriState(value) {
  if (value === undefined || value === null || value === "" || value === "inherit") return null
  return value === true || value === "true"
}

function listGroupScopes() {
  const db = loadDb()
  return Object.keys(db?.groups || {})
    .sort((a, b) => String(a).localeCompare(String(b)))
    .map(groupId => {
      const group = db.groups[groupId] || {}
      const userCount = Object.keys(group.users || {}).length
      return {
        id: String(groupId),
        label: String(groupId),
        description: userCount ? `已记录 ${userCount} 个用户` : "",
      }
    })
}

function getGlobalValues() {
  const db = loadDb()
  return {
    settings: {
      enabled: getGlobalRepeatMuteEnabled(db),
    },
  }
}

function getGroupValues(groupId) {
  const db = loadDb()
  const group = getOrCreateGroup(db, groupId)
  return {
    config: {
      enabled: toTriState(getGroupRepeatMuteOverride(group)),
    },
  }
}

function getGroupSummary(groupId) {
  const db = loadDb()
  const group = getOrCreateGroup(db, groupId)
  const effective = getEffectiveRepeatMuteEnabled(db, groupId)
  const users = Object.keys(group?.users || {}).length
  const muted = Object.keys(group?.muted || {}).length
  return [
    `当前群号 ${groupId}`,
    `生效状态 ${effective ? "开启" : "关闭"}`,
    `用户记录 ${users}`,
    `禁言记录 ${muted}`,
  ].join(" | ")
}

export default {
  meta: {
    title: "复读禁言",
    description: "统一管理 fudu-ban 的全局开关和群级覆盖。",
    order: 40,
    tags: ["moderation", "mute"],
  },

  definition: {
    sections: [
      {
        id: "global",
        scope: "global",
        title: "全局配置",
        fields: [
          {
            path: "settings.enabled",
            label: "启用复读禁言",
            type: "boolean",
          },
        ],
      },
      {
        id: "group",
        scope: "group",
        title: "群级覆盖",
        emptyText: "还没有群级记录。等插件处理过至少一个群消息后，这里就会出现群号。",
        fields: [
          {
            path: "config.enabled",
            label: "群级开关",
            type: "select",
            options: [
              { label: "跟随全局", value: "inherit" },
              { label: "开启", value: "true" },
              { label: "关闭", value: "false" },
            ],
          },
        ],
      },
    ],
  },

  async listScopes({ scope }) {
    if (scope !== "group") return []
    return listGroupScopes()
  },

  async getValues({ scope = "global", scopeId = "" } = {}) {
    if (scope === "group") {
      const groupId = String(scopeId || "").trim()
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
      meta: {},
    }
  },

  async updateValues({ scope = "global", scopeId = "", values = {} } = {}) {
    const db = loadDb()

    if (scope === "group") {
      const groupId = String(scopeId || "").trim()
      const group = getOrCreateGroup(db, groupId)
      setGroupRepeatMuteEnabled(group, fromTriState(values?.config?.enabled))
      saveDb(db)
      return {
        values: getGroupValues(groupId),
        meta: {
          summary: getGroupSummary(groupId),
        },
        message: `fudu-ban 群 ${groupId} 配置已保存`,
      }
    }

    setGlobalRepeatMuteEnabled(db, Boolean(values?.settings?.enabled))
    saveDb(db)
    return {
      values: getGlobalValues(),
      meta: {},
      message: "fudu-ban 全局配置已保存",
    }
  },
}
