import * as handlers from "./controllers/handlers.js"
import definePlugin from "../define-plugin.js"

export default definePlugin({
  name: "fudu-ban",
  title: "复读禁言",
  shortName: "复读",
  aliases: ["复读禁言", "复读"],
  register: handlers.register,
  onBotEvent: handlers.onBotEvent,
})
