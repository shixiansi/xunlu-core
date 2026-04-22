/**
 * @Author: 时先思
 * @Date: 2025-12-13 14:29:10
 * @LastEditTime: 2026-02-20 14:58:32
 * @LastEditors: 时先思
 * @Description:
 * @FilePath: \xunlu-core\src\plugins\chuo\index.js
 * @版权声明
 **/
import * as handlers from "./controllers/handlers.js"
import definePlugin from "../define-plugin.js"

export default definePlugin({
  name: "chuo",
  title: "戳一戳",
  shortName: "戳",
  aliases: ["戳一戳", "戳"],
  register: handlers.register,
  onBotEvent: handlers.onBotEvent,
})
