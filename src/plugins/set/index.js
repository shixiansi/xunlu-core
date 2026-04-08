/**
 * @Author: 时先思
 * @Date: 2025-12-13 14:29:10
 * @LastEditTime: 2026-02-10 21:55:48
 * @LastEditors: 时先思
 * @Description:
 * @FilePath: \xunlu-core\src\plugins\update\index.js
 * @版权声明
 **/
import * as handlers from "./controllers/handlers.js"
import { createRouter } from "./routes/index.js"

export default {
  name: "set",
  title: "设置",
  shortName: "设置",
  aliases: ["设置"],
  register: handlers.register,
  apiRoutes(router) {
    router.use(createRouter({ name: "set" }))
  },
  onBotEvent: handlers.onBotEvent,
}
