import * as handlers from "./controllers/handlers.js"
import definePlugin from "../define-plugin.js"

export default definePlugin({
  name: "douyin-plugin",
  title: "抖音",
  shortName: "抖音",
  aliases: ["抖音", "douyin"],
  register: handlers.register,
  onBotEvent: handlers.onBotEvent,
})
