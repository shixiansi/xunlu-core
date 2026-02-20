/**
 * @Author: 时先思
 * @Date: 2025-12-13 14:29:10
 * @LastEditTime: 2026-02-05 13:42:21
 * @LastEditors: 时先思
 * @Description:
 * @FilePath: \Miao-Yunzai\plugins\xunlu-core\src\plugins\chuo\index.js
 * @版权声明
 **/
import * as handlers from "./controllers/handlers.js"
import { createRouter } from "./routes/index.js"

export default {
  name: "chuo",
  register: handlers.register,
  onBotEvent: handlers.onBotEvent,
}
