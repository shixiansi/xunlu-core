import { segment } from "../../../Bot/segment.js"
import Blogin from "../model/Blogin.js"
import Bili from "../model/Bilili.js"
import lodash from "lodash"
import Filemage from "../../../utils/Filemage.js"
const filemage = new Filemage()
filemage.CreatDir("src/plugins/bilibili/data")
export function register(bot) {
  if (!bot || !bot.registerCommand) return

  bot.registerCommand("b站扫码", async ctx => {
    if (!ctx.isMaster) return false
    await Blogin.login()
    await ctx.reply(segment.image(Blogin.qrImagePath), false, { recallMsg: 120 })
    let timer = setInterval(async () => {
      let result = await Blogin.pollLoginStatus(Bili.getUserInfo.bind(Bili))
      if (result && result?.code == 200) {
        clearInterval(timer)
        await ctx.reply("登录成功！")
        let uinfo = result.userInfo
        let { name, face, fans, friend, sign, like_num, archive_count, level } =
          await Bili.getUserBaseInfo(uinfo.mid)
        await ctx.reply([
          segment.image(face),
          `昵称：${name}\n粉丝：${fans}\n关注：${friend}\n等级：${level}\n简介：${sign}\n投稿：${archive_count}\n点赞：${like_num}\n`,
        ])
      }
    }, 3000)
  })
  bot.registerCommand("#查询up最新动态", async ctx => {
    if (!ctx.isGroup) return false

    let mid = ctx.msg.replace("#查询up最新动态", "")
    let result = await Bili.getFirstDynamic(mid)
    console.log(result)

    if (result && !result?.code) {
      let bglist = filemage.GetfileList("src/plugins/bilibili/resources/html/bilibili/bg")
      let radom = bglist[lodash.random(0, bglist.length - 1)]
      await ctx.reply(await ctx.renderImg("bilibili", { radom, ...result }))
    } else {
      await ctx.reply(`查询失败！${result.message}`)
    }
  })
}

export function onBotEvent(event) {
  console.log("[example-plugin] received bot event:", event)
}
