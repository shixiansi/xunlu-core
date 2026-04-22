/**
 * @Author: 时先思
 * @Date: 2025-12-13 14:29:10
 * @LastEditTime: 2025-12-13 16:20:43
 * @LastEditors: 时先思
 * @Description:
 * @FilePath: \plugin-api\src\plugins\example-plugin\index.js
 * @版权声明
 **/
import * as handlers from "./controllers/handlers.js";
import { createRouter } from "./routes/index.js";
import definePlugin from "../define-plugin.js"

export default definePlugin({
  name: "example",
  title: "示例",
  shortName: "例",
  aliases: ["示例", "例"],
  register: handlers.register,
  apiRoutes(router) {
    router.use(createRouter({ name: "example" }));
  },
  onBotEvent: handlers.onBotEvent,
});
