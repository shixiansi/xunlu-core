import * as handlers from "./controllers/handlers.js"
import definePlugin from "../define-plugin.js"

export default definePlugin({
  name: "diaoyu",
  title: "钓鱼",
  shortName: "鱼",
  aliases: ["钓鱼", "鱼"],
  register: handlers.register,
  onBotEvent: handlers.onBotEvent,
})
