import * as handlers from "./controllers/handlers.js"

export default {
  name: "anti-phish",
  title: "恶意网址识别",
  shortName: "恶意网址",
  aliases: ["恶意网址", "反钓鱼"],
  register: handlers.register,
  onBotEvent: handlers.onBotEvent,
}
