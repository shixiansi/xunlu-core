import * as handlers from "./controllers/handlers.js"

export default {
  name: "fudu-ban",
  register: handlers.register,
  onBotEvent: handlers.onBotEvent,
}

