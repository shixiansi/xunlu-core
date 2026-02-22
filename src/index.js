//如果是插件就通过全局BOT获取机器人实例，否则就选择作为api或者本体机器人
function getQQFromArray(arr) {
  // QQ号规则：纯数字、长度4-13位、不以0开头
  const qqReg = /^[1-9]\d{3,12}$/;
  // 遍历数组，找到第一个匹配的QQ号
  const qqItem = arr.find((item) => qqReg.test(item));
  return qqItem || "未找到有效QQ号";
}
async function getBotInstance() {
  try {
    if (Bot) {
      //插件环境下通过全局BOT获取机器人实例
      console.log("云崽环境");
      let timer = setInterval(async () => {
        let qq = getQQFromArray(Object.keys(Bot));
        if (qq != "未找到有效QQ号") {
          clearInterval(timer);
          // console.log(bot);
          const { ListenerLoader } =
            await import("./Bot/icqq/EventListener.js");
          Bot.botQQ = qq;
          process.env.xunLuEnv = "QQBot-ICQQYunZai";

          new ListenerLoader().load(Bot);
        }
      }, 10000);
    }
  } catch (error) {
    //作为api或者本体机器人时，选择合适的机器人实例
    await loadEnv();
    loadLLbot().catch(async (err) => {
      console.error("加载LLbot失败:", err);
      console.log("开始加载api服务器");
      try {
        await import("./Bot/onebotV11/event/index.js");
        process.env.xunLuEnv = "QQBot-onebotV11";
        console.log(process.env.xunLuEnv);
      } catch (error) {
        const { startServer } = await import("./lib/server.js");
        startServer();
        process.env.xunLuEnv = "API-Server";
        console.log(process.env.xunLuEnv);
      }
    });
    console.log(process.env.xunLuEnv);
  }
}

async function loadLLbot() {
  const { default: EventListener } =
    await import("./Bot/llonebot/event/index.js");
  await new EventListener().load();
  process.env.xunLuEnv = "QQBot-LLoneBot";
  console.log(process.env.xunLuEnv);
}

async function loadEnv() {
  const { default: logjs } = await import("./component/logger/log.js");
  await logjs();
  const { default: startRedis } = await import("./component/redis/redis.js");
  await startRedis();
}

getBotInstance();

export default {};
