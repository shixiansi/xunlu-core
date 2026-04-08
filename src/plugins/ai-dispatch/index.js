import * as handlers from "./controllers/handlers.js"

export default {
  name: "ai-dispatch",
  title: "AI调度",
  shortName: "调度",
  aliases: ["AI调度", "调度"],
  register: handlers.register,
}
