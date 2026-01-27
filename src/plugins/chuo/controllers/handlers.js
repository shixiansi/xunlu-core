/**
 * @Author: 时先思
 * @Date: 2025-12-13 14:29:17
 * @LastEditTime: 2026-01-27 12:48:22
 * @LastEditors: 时先思
 * @Description:
 * @FilePath: \plugin-api\src\plugins\chuo\controllers\handlers.js
 * @版权声明
 **/
export function register(bot) {
  if (!bot || !bot.registerCommand) return;
  //第一个参数是数组第一个是命令，第二个是事件，第三个是定时函数，如果是其他事件就是事件列表中的事件名称，第二个是方法，第三个是下文函数
  // bot.registerCommand(["", ""], async (ctx) => {
  //   console.log(ctx);
  //   console.log("这是示例插件的响应");
  //   console.log(ctx.reply.toString());

  //   await ctx.reply("这是示例插件的响应");
  // });
  console.log("[example-plugin] registered with bot shim");
}

export function onBotEvent(event) {
  console.log("[example-plugin] received bot event:", event);
}
