import * as handlers from "./controllers/handlers.js"

export default {
  name: "yunzai-call",
  register: handlers.register,
  onBotEvent: handlers.onBotEvent,
}
