/**
 * @Author: 时先思
 * @Date: 2025-12-13 14:29:10
 * @LastEditTime: 2026-02-05 22:05:50
 * @LastEditors: 时先思
 * @Description:
 * @FilePath: \Miao-Yunzai\plugins\xunlu-core\src\plugins\weibo\index.js
 * @版权声明
 **/
import * as handlers from "./controllers/handlers.js"
import { createRouter } from "./routes/index.js"

export default {
  name: "weibo",
  register: handlers.register,
  apiRoutes(router) {
    router.use(createRouter({ name: "other" }))
  },
  onBotEvent: handlers.onBotEvent,
}
