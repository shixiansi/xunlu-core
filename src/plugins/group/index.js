/**
 * @Author: 时先思
 * @Date: 2025-12-13 14:29:10
 * @LastEditTime: 2026-01-30 17:32:43
 * @LastEditors: 时先思
 * @Description:
 * @FilePath: \plugin-api\src\plugins\group\index.js
 * @版权声明
 **/
import * as handlers from "./controllers/handlers.js";
import { createRouter } from "./routes/index.js";

export default {
  name: "group",
  register: handlers.register,
  apiRoutes(router) {
    router.use(createRouter({ name: "group" }));
  },
  onBotEvent: handlers.onBotEvent,
};
