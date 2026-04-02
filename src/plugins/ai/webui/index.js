import cfg from "../../../lib/config.js"

function getAiValues() {
  const config = cfg.getConfig("ai") || {}
  const caimiao = config?.caimiao && typeof config.caimiao === "object" ? config.caimiao : {}

  return {
    caimiao: {
      "x-token": String(caimiao["x-token"] || ""),
      proxy: String(caimiao.proxy || ""),
    },
  }
}

function getAiSummary() {
  const values = getAiValues()
  return [
    `彩喵令牌 ${values.caimiao["x-token"] ? "已配置" : "未配置"}`,
    `代理 ${values.caimiao.proxy || "未设置"}`,
  ].join(" | ")
}

function saveAiValues(values = {}) {
  const next = {
    caimiao: {
      "x-token": String(values?.caimiao?.["x-token"] ?? "").trim(),
      proxy: String(values?.caimiao?.proxy ?? "").trim(),
    },
  }

  cfg.getConfigReader("ai").setData(next)
  return next
}

export default {
  meta: {
    title: "AI",
    description: "统一管理 ai 插件当前使用的彩喵鉴权和代理配置。",
    order: 15,
    tags: ["ai", "token"],
  },

  definition: {
    sections: [
      {
        id: "caimiao",
        scope: "global",
        title: "彩喵配置",
        fields: [
          {
            path: "caimiao.x-token",
            label: "x-token",
            type: "text",
            allowEmpty: true,
            description: "用于调用 anuneko / 彩喵接口的访问令牌。",
          },
          {
            path: "caimiao.proxy",
            label: "代理地址",
            type: "text",
            allowEmpty: true,
            placeholder: "http://127.0.0.1:7890",
            description: "可选。留空表示直连。",
          },
        ],
      },
    ],
  },

  async getValues() {
    return {
      values: getAiValues(),
      meta: {
        summary: getAiSummary(),
      },
    }
  },

  async updateValues({ values = {} } = {}) {
    saveAiValues(values)
    return {
      values: getAiValues(),
      meta: {
        summary: getAiSummary(),
      },
      message: "ai 配置已保存",
    }
  },
}
