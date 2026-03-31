import * as handlers from "./controllers/handlers.js"

export default {
  name: "help",
  register: handlers.register,
  onBotEvent: handlers.onBotEvent,
}

