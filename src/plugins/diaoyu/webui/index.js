import { getDiaoyuConfig, saveDiaoyuConfig } from "../model/config.js"

function getSummary() {
  const config = getDiaoyuConfig()
  return [
    `初始金币 ${config.bootstrap.starting_coins}`,
    `鱼竿 Lv.${config.bootstrap.starting_rod_level}`,
    `鱼饵 ${config.bootstrap.starting_bait}/${config.bootstrap.starting_advanced_bait}`,
    `签到 ${config.sign.base_coins}+streak*${config.sign.streak_bonus_coins}`,
  ].join(" | ")
}

export default {
  meta: {
    title: "钓鱼",
    description: "统一管理 diaoyu 插件的新用户初始资源和签到奖励参数。",
    order: 58,
    tags: ["game", "economy"],
  },

  definition: {
    sections: [
      {
        id: "bootstrap",
        scope: "global",
        title: "新用户初始配置",
        fields: [
          { path: "bootstrap.starting_coins", label: "初始金币", type: "number", min: 0 },
          { path: "bootstrap.starting_rod_level", label: "初始鱼竿等级", type: "number", min: 1 },
          { path: "bootstrap.starting_bait", label: "初始普通鱼饵", type: "number", min: 0 },
          {
            path: "bootstrap.starting_advanced_bait",
            label: "初始高级鱼饵",
            type: "number",
            min: 0,
          },
        ],
      },
      {
        id: "sign",
        scope: "global",
        title: "签到奖励",
        fields: [
          { path: "sign.base_coins", label: "基础金币奖励", type: "number", min: 0 },
          {
            path: "sign.streak_bonus_coins",
            label: "连续签到每次额外金币",
            type: "number",
            min: 0,
          },
          { path: "sign.base_bait", label: "基础普通鱼饵奖励", type: "number", min: 0 },
          {
            path: "sign.bait_bonus_every_streak",
            label: "每多少连签额外加 1 个普通鱼饵",
            type: "number",
            min: 1,
          },
          {
            path: "sign.advanced_bait_every_streak",
            label: "每多少连签送 1 个高级鱼饵",
            type: "number",
            min: 1,
          },
        ],
      },
    ],
  },

  async getValues() {
    return {
      values: getDiaoyuConfig(),
      meta: {
        summary: getSummary(),
      },
    }
  },

  async updateValues({ values = {} } = {}) {
    saveDiaoyuConfig(values)
    return {
      values: getDiaoyuConfig(),
      meta: {
        summary: getSummary(),
      },
      message: "diaoyu 配置已保存",
    }
  },
}
