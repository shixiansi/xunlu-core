import * as handlers from "./controllers/handlers.js";
import definePlugin from "../define-plugin.js"

export default definePlugin({
  name: "tts-plugin",
  title: "语音合成",
  shortName: "TTS",
  aliases: ["语音合成", "TTS", "tts"],
  register: handlers.register,
  apiRoutes: handlers.apiRoutes,
  onBotEvent: handlers.onBotEvent,
  // 新增接口：插件初始化和销毁
  onPluginInit: handlers.onPluginInit,
  onPluginDestroy: handlers.onPluginDestroy,
});
