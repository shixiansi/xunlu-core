import * as handlers from "./controllers/handlers.js"

export default {
  name: "douyin-plugin",
  title: "抖音",
  shortName: "抖音",
  aliases: ["抖音", "douyin"],
  register: handlers.register,
  onBotEvent: handlers.onBotEvent,
}
