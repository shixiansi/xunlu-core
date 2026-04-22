import * as handlers from "./controllers/handlers.js"
import definePlugin from "../define-plugin.js"

export default definePlugin({
  name: "help",
  title: "帮助",
  shortName: "帮",
  aliases: ["帮助", "帮"],
  register: handlers.register,
  onBotEvent: handlers.onBotEvent,
})
