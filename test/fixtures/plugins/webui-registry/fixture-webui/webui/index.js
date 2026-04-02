const state = {
  global: {
    settings: {
      enabled: true,
    },
  },
  groups: new Map([
    ["10001", { threshold: 3 }],
    ["10002", { threshold: 5 }],
  ]),
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

export default {
  meta: {
    title: "Fixture WebUI",
    description: "webui registry test fixture",
    order: 1,
  },

  definition: {
    sections: [
      {
        id: "global",
        scope: "global",
        title: "Global",
        fields: [
          { path: "settings.enabled", label: "Enabled", type: "boolean" },
        ],
      },
      {
        id: "group",
        scope: "group",
        title: "Group",
        fields: [
          { path: "threshold", label: "Threshold", type: "number" },
        ],
      },
    ],
  },

  async listScopes({ scope }) {
    if (scope !== "group") return []
    return Array.from(state.groups.keys()).map(id => ({ id, label: id }))
  },

  async getValues({ scope = "global", scopeId = "" } = {}) {
    if (scope === "group") {
      return {
        values: clone(state.groups.get(String(scopeId)) || {}),
        meta: {
          summary: `group ${scopeId}`,
        },
      }
    }
    return {
      values: clone(state.global),
      meta: {},
    }
  },

  async updateValues({ scope = "global", scopeId = "", values = {} } = {}) {
    if (scope === "group") {
      state.groups.set(String(scopeId), clone(values))
      return {
        values: clone(state.groups.get(String(scopeId))),
        meta: {
          summary: `group ${scopeId}`,
        },
      }
    }

    state.global = clone(values)
    return {
      values: clone(state.global),
      meta: {},
    }
  },
}
