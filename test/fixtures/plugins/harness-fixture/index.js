import definePlugin from "../../../../src/plugins/define-plugin.js"

export default definePlugin({
  name: "harness-fixture",
  register(bot) {
    bot.registerCommand(["^fixture ping$", 1000], async ctx => {
      return await ctx.reply("pong")
    })

    bot.registerCommand(["^fixture render$", 1000], async ctx => {
      const img = await ctx.renderImg("fixture", { title: "fixture" }, { tpl: "fixture" })
      return await ctx.reply(img)
    })

    bot.registerCommand(["^fixture quote$", 1000], async ctx => {
      return await ctx.reply("quoted", true)
    })

    bot.registerCommand(["^fixture context$", 1000], async ctx => {
      bot.contextReply(
        ctx,
        async next => {
          const text = String(next?.msg || "").trim()
          await next.reply(`context:${text}`)
          return text === "结束"
        },
        "结束",
      )
      return await ctx.reply("context:start")
    })

    bot.registerCommand(["^fixture timeout$", 1000], async ctx => {
      bot.contextReply(ctx, async next => {
        await next.reply(`timeout:${String(next?.msg || "").trim()}`)
        return true
      })
      return await ctx.reply("timeout:start")
    })

    bot.registerCommand(["^fixture crash$", 1000], async () => {
      throw new Error("fixture crash")
    })

    bot.setTask("0 * * * * *", async () => {
      return await Bot.sendMessage({ group_id: 424242 }, "fixture scheduled")
    })
  },
})
