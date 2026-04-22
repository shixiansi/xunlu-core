import * as handlers from "./controllers/handlers.js"
import definePlugin from "../define-plugin.js"

export default definePlugin({
  name: "diange",
  title: "点歌",
  shortName: "点歌",
  aliases: ["点歌", "歌曲"],
  register: handlers.register,
  onBotEvent: handlers.onBotEvent,
})
