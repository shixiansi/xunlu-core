export default {
  name: "pixiv",
  register(bot) {
    bot.registerCommand(["^随机图$", 1000], async ctx => {
      return await ctx.reply("fixture pixiv")
    })

    // 为 smoke test 提供一个稳定的定时任务入口，避免依赖生产插件里的偶然实现。
    if (typeof bot?.setTask === "function") {
      bot.setTask("0 * * * * *", async ctx => {
        if (typeof ctx?.sendMessage === "function") {
          return await ctx.sendMessage(
            { group_id: ctx?.group_id || 0 },
            `fixture scheduled:${ctx?.group_id || "unknown"}`,
          )
        }
        if (typeof ctx?.reply === "function") {
          return await ctx.reply(`fixture scheduled:${ctx?.group_id || "unknown"}`)
        }
        return false
      })
    }
  },
}
