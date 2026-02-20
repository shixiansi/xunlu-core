/**
 * @Author: 时先思
 * @Date: 2026-02-03 23:12:03
 * @LastEditTime: 2026-02-03 23:12:04
 * @LastEditors: 时先思
 * @Description:
 * @FilePath: \Miao-Yunzai\plugins\xunlu-core\src\plugins\bilibili\index.js
 * @版权声明
 **/
import * as handlers from "./controllers/handlers.js"

export default {
  name: "bilibili-plugin",
  register: handlers.register,
  onBotEvent: handlers.onBotEvent,
  // 新增接口：插件初始化和销毁
}
