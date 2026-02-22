import fs from "fs"
export function register(bot) {
  if (!bot || !bot.registerCommand) return
  //第一个参数是数组第一个是命令，第二个是事件，第三个是优先级（第二个和第三个都可以省略）
  bot.registerCommand(["^(|#)设置尾缀"], async ctx => {
    let suffix = ctx.msg.replace(/^(|#)设置尾缀/, "")
    if (ctx.message?.find(i => i.type == "face")) {
      suffix = ctx.message.map(i => {
        if (i.type == "text" && i?.text?.includes("设置尾缀")) {
          return i?.text.replace(/^(|#)设置尾缀/, "")
        }
        if (i.type == "face") {
          console.log("[face:" + i.id + "]")

          return "[face:" + i.id + "]"
        }
        return i?.text || i?.data?.text
      })
      console.log(suffix)
      suffix = suffix.join("")
    }
    cfg.setConfigValue("bot", "suffix_text", suffix)
    return ctx.reply(`尾缀已设置为: ${suffix}`)
  })

  bot.registerCommand(["^(|#)我是什么bot"], async ctx => {
    const name = JSON.parse(fs.readFileSync("./package.json")).name
    ctx.reply(`我是运行在${name}的${ctx.adapterType}_Bot`)
  })
}

export function onBotEvent(event) {
  console.log("[example-plugin] received bot event:", event)
}
