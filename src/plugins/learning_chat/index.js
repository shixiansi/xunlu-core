import * as handlers from "./controllers/handlers.js"
import { createRouter } from "./routes/index.js"
import definePlugin from "../define-plugin.js"

export default definePlugin({
  name: "learning_chat",
  title: "学习聊天",
  shortName: "学聊",
  aliases: ["学习聊天", "学聊"],
  register: handlers.register,
  apiRoutes(router) {
    router.use(createRouter({ name: "learning_chat" }))
  },
  onBotEvent: handlers.onBotEvent,
})
