import * as handlers from "./controllers/handlers.js"
import definePlugin from "../define-plugin.js"

export default definePlugin({
  name: "ai-dispatch",
  title: "AI调度",
  shortName: "调度",
  aliases: ["AI调度", "调度"],
  register: handlers.register,
})
