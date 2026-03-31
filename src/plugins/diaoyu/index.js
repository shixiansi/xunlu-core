import * as handlers from "./controllers/handlers.js"

export default {
  name: "diaoyu",
  register: handlers.register,
  onBotEvent: handlers.onBotEvent,
}

