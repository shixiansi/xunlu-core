export default {
  name: "pixiv",
  register(bot) {
    bot.registerCommand(["^随机图$", 1000], async ctx => {
      return await ctx.reply("fixture pixiv")
    })
  },
}
