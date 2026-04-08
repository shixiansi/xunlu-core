import * as handlers from "./controllers/handlers.js"

export default {
  name: "qun-daily",
  title: "群日报",
  shortName: "日报",
  aliases: ["群日报", "日报"],
  register: handlers.register,
  onBotEvent: handlers.onBotEvent,
}
