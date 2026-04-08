/**
 * @Author: 时先思
 * @Date: 2025-12-13 14:29:10
 * @LastEditTime: 2026-01-26 23:13:59
 * @LastEditors: 时先思
 * @Description:
 * @FilePath: \plugin-api\src\plugins\pixiv\index.js
 * @版权声明
 **/
import * as handlers from "./controllers/handlers.js";
import { createRouter } from "./routes/index.js";

export default {
  name: "pixiv",
  title: "P站",
  shortName: "P站",
  aliases: ["P站", "Pixiv", "pixiv"],
  register: handlers.register,
  apiRoutes(router) {
    router.use(createRouter({ name: "pixiv" }));
  },
  onBotEvent: handlers.onBotEvent,
};
