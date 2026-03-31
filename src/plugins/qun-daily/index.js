import * as handlers from "./controllers/handlers.js"

export default {
  name: "qun-daily",
  register: handlers.register,
  onBotEvent: handlers.onBotEvent,
}
