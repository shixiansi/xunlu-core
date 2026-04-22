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
import definePlugin from "../define-plugin.js"

export default definePlugin({
  name: "update",
  title: "更新",
  shortName: "更新",
  aliases: ["更新"],
  register: handlers.register,
  apiRoutes(router) {
    router.use(createRouter({ name: "example" }))
  },
  onBotEvent: handlers.onBotEvent,
})
