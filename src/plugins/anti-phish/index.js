import * as handlers from "./controllers/handlers.js"
import definePlugin from "../define-plugin.js"

export default definePlugin({
  name: "anti-phish",
  title: "恶意网址识别",
  shortName: "恶意网址",
  aliases: ["恶意网址", "反钓鱼"],
  register: handlers.register,
  onBotEvent: handlers.onBotEvent,
})
