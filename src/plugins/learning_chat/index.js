import * as handlers from "./controllers/handlers.js"
import { createRouter } from "./routes/index.js"

export default {
  name: "learning_chat",
  register: handlers.register,
  apiRoutes(router) {
    router.use(createRouter({ name: "learning_chat" }))
  },
  onBotEvent: handlers.onBotEvent,
}

