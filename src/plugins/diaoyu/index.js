import * as handlers from "./controllers/handlers.js"

export default {
  name: "diaoyu",
  title: "钓鱼",
  shortName: "鱼",
  aliases: ["钓鱼", "鱼"],
  register: handlers.register,
  onBotEvent: handlers.onBotEvent,
}
