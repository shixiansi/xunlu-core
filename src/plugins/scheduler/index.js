import { register } from "./controllers/handlers.js"

export default {
  name: "scheduler",
  title: "定时任务",
  shortName: "定时",
  aliases: ["定时任务", "定时"],
  register,
}
