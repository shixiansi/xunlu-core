import * as handlers from "./controllers/handlers.js"
import definePlugin from "../define-plugin.js"

export default definePlugin({
  name: "yangmao",
  title: "羊毛日报",
  shortName: "羊毛",
  aliases: ["羊毛", "羊毛日报", "AI羊毛", "白嫖"],
  register: handlers.register,
})
