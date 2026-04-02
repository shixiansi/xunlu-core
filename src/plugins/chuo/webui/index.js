import { getChuoConfig, setChuoEnabled } from "../model/config.js"

function readValues() {
  const config = getChuoConfig()
  return {
    settings: {
      enabled: config.enabled !== false,
    },
  }
}

function buildSummary() {
  return readValues().settings.enabled ? "戳一戳回应已开启" : "戳一戳回应已关闭"
}

export default {
  meta: {
    title: "戳一戳回应",
    description: "统一管理 chuo 插件的总开关。",
    order: 60,
    tags: ["poke", "reply"],
  },

  definition: {
    sections: [
      {
        id: "global",
        scope: "global",
        title: "全局开关",
        fields: [
          {
            path: "settings.enabled",
            label: "启用戳一戳回应",
            type: "boolean",
          },
        ],
      },
    ],
  },

  async getValues() {
    return {
      values: readValues(),
      meta: {
        summary: buildSummary(),
      },
    }
  },

  async updateValues({ values = {} } = {}) {
    setChuoEnabled(Boolean(values?.settings?.enabled))
    return {
      values: readValues(),
      meta: {
        summary: buildSummary(),
      },
      message: "chuo 全局配置已保存",
    }
  },
}
