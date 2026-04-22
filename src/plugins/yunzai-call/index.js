import * as handlers from "./controllers/handlers.js"
import definePlugin from "../define-plugin.js"

export default definePlugin({
  name: "yunzai-call",
  title: "云崽调用",
  shortName: "云调",
  aliases: ["云崽调用", "云调"],
  register: handlers.register,
  onBotEvent: handlers.onBotEvent,
})
