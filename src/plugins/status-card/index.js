import * as handlers from "./controllers/handlers.js"
import definePlugin from "../define-plugin.js"

export default definePlugin({
  name: "status-card",
  title: "状态卡片",
  shortName: "状态",
  aliases: ["状态卡片", "系统状态", "运行状态"],
  register: handlers.register,
  onBotEvent: handlers.onBotEvent,
})
