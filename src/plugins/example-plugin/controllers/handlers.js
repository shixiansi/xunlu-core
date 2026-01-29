/**
 * @Author: 时先思
 * @Date: 2025-12-13 14:29:17
 * @LastEditTime: 2025-12-21 01:29:56
 * @LastEditors: 时先思
 * @Description:
 * @FilePath: \plugin-api\src\plugins\example-plugin\controllers\handlers.js
 * @版权声明
 **/
export function register(bot) {
  if (!bot || !bot.registerCommand) return;
  //第一个参数是数组第一个是命令，第二个是事件，第三个是优先级（第二个和第三个都可以省略）
  bot.registerCommand(["示例"], async (ctx) => {
    console.log(ctx);
    console.log("这是示例插件的响应");
    console.log(ctx.reply.toString());

    await ctx.reply("这是示例插件的响应");
  });
}

export function onBotEvent(event) {
  console.log("[example-plugin] received bot event:", event);
}
