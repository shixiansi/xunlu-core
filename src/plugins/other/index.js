/**
 * @Author: 时先思
 * @Date: 2025-12-13 14:29:10
 * @LastEditTime: 2026-02-05 20:17:53
 * @LastEditors: 时先思
 * @Description:
 * @FilePath: \Miao-Yunzai\plugins\xunlu-core\src\plugins\other\index.js
 * @版权声明
 **/
import * as handlers from "./controllers/handlers.js"
import { createRouter } from "./routes/index.js"

export default {
  name: "other",
  title: "其他功能",
  shortName: "其他",
  aliases: ["其他功能", "其他"],
  register: handlers.register,
  apiRoutes(router) {
    router.use(createRouter({ name: "other" }))
  },
  onBotEvent: handlers.onBotEvent,
}
