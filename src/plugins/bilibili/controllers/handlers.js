/**
 * @Author: 时先思
 * @Date: 2025-12-13 14:29:17
 * @LastEditTime: 2025-12-20 14:53:46
 * @LastEditors: 时先思
 * @Description:
 * @FilePath: \plugin-api\src\plugins\bilibili\controllers\handlers.js
 * @版权声明
 **/
export function register(bot) {
  if (!bot || !bot.registerCommand) return;

  bot.registerCommand("示例", (ctx) => ctx.reply("这是示例插件的响应"));
  console.log("[example-plugin] registered with bot shim");
}

export function onBotEvent(event) {
  console.log("[example-plugin] received bot event:", event);
}
