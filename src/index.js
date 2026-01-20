//如果是插件就通过全局BOT获取机器人实例，否则就选择作为api或者本体机器人
import config from "./lib/config.js";
import { loadPlugins } from "./lib/pluginLoader.js";
import path from "path";
import { logger } from "#utils";
const __dirname = process.cwd();
if (!global.logger) global.logger = logger;
async function getBotInstance() {
  try {
    if (Bot) {
      //插件环境下通过全局BOT获取机器人实例
      return Bot;
    }
  } catch (error) {
    //作为api或者本体机器人时，选择合适的机器人实例
    loadLLbot().catch(async (err) => {
      console.error("加载LLbot失败:", err);
      console.log("开始加载api服务器");
      const { startServer } = await import("./lib/server.js");
      startServer();
      process.env.xunLuEnv = "API-Server";
      console.log(process.env.xunLuEnv);
    });
    console.log(process.env.xunLuEnv);
  }
}

async function loadLLbot() {
  // LLBot.on("message_receive", async (event) => {
  //   console.log(event.data.segments);
  //   event.reply = (msg) => {
  //     if (event.data.message_scene === "group") {
  //       LLBot.sendGroupMessage({
  //         message: [
  //           {
  //             type: "text",
  //             data: {
  //               text: msg,
  //             },
  //           },
  //         ],
  //         group_id: event.data.group?.group_id,
  //       });
  //     } else {
  //       LLBot.sendPrivateMessage({});
  //     }
  //   };
  //   const msg =
  //     event.data.segments
  //       .filter((i) => i.type == `text`)
  //       .map((i) => i.data.text)
  //       .join("") || "";
  //   console.log(msg);
  //   event.data.msg = msg;
  //   let reg = Object.keys(p).find((key) => msg.includes(key));
  //   if (reg && event.data.sender_id != event.self_id) {
  //     console.log(reg);

  //     p[reg](event);
  //   }
  // });

  const { default: EventListener } = await import(
    "./Bot/llonebot/event/index.js"
  );
  await new EventListener().load();
  process.env.xunLuEnv = "QQBot-LLoneBot";
  console.log(process.env.xunLuEnv);
}
getBotInstance();

export default {};
