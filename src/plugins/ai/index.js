import * as handlers from "./controllers/handlers.js";

export default {
  name: "ai-plugin",
  register: handlers.register,
  apiRoutes: handlers.apiRoutes,
  onBotEvent: handlers.onBotEvent,
  // 新增接口：插件初始化和销毁
  onPluginInit: handlers.onPluginInit,
  onPluginDestroy: handlers.onPluginDestroy,
};
