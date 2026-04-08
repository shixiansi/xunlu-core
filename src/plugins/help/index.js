import * as handlers from "./controllers/handlers.js"

export default {
  name: "help",
  title: "帮助",
  shortName: "帮",
  aliases: ["帮助", "帮"],
  register: handlers.register,
  onBotEvent: handlers.onBotEvent,
}
