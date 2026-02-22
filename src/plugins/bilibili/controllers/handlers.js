import { segment } from "../../../Bot/segment.js"
import Blogin from "../model/Blogin.js"
import Bili from "../model/Bilili.js"
import lodash from "lodash"
import Filemage from "../../../utils/Filemage.js"
import moment from "moment"
const filemage = new Filemage()
filemage.CreatDir("src/plugins/bilibili/data")

function writeLiveData(groupId, uid, data) {
  let gdata = filemage.getFileDataToJson(`src/plugins/bilibili/data/${groupId}.json`) || {}
  gdata[uid].live = data
  filemage.writeFileJsonData(`src/plugins/bilibili/data/${groupId}.json`, gdata)
  logger.debug(
    `[Bilibili] 更新直播状态，群ID：${groupId}，用户ID：${uid}，状态：${data?.live_status === 1 ? "直播中" : "下播"}`,
  )
}

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

  //直播推送   群名称 属性名是uid
  bot.setTask("0 * * * * *", async ctx => {
    let glist = filemage.GetfileList("src/plugins/bilibili/data")
    if (glist.length == 0) return
    for (let g of glist.map(i => i.replace(".json", ""))) {
      let flist = filemage.getFileDataToJson(`src/plugins/bilibili/data/${g}.json`)
      for (let u in flist) {
        if (!flist[u]) continue
        let result = await Bili.getRoomInfobyMid(u)
        let { room_id } = result
        if (room_id == 0) continue
        let roomInfo = await Bili.getRoomInfo(room_id)
        if (roomInfo && roomInfo?.live_status == 1 && !flist[u]?.live?.live_time) {
          let { title, user_cover, area_name, live_time } = roomInfo
          let content = [
            `${flist[u].nickname}开播啦！小伙伴们快去围观吧！`,
            segment.image(user_cover),
            `标题：${title}\n分区：${area_name}\n开播时间：${live_time}\n直播间地址：https://live.bilibili.com/${room_id}`,
          ]
          try {
            let res = await Bot.sendMessage({ group_id: g }, content)
            if (!res) throw new Error("直播推送消息失败")
            logger.info(`[Bilibili] 直播推送成功，房间ID：${room_id}，群ID：${g}`)
            writeLiveData(g, u, roomInfo)
          } catch (e) {
            logger.error(e)
          }
        } else if (roomInfo?.live_status == 0 && flist[u]?.live?.live_time) {
          let { title, user_cover, area_name, live_time } = flist[u]?.live
          const liveTime = moment() - moment(live_time)
          if (liveTime < 60 * 60 * 1000) {
            try {
              await Bot.sendMessage({ group_id: g }, [
                segment.image(user_cover),
                `\n标题：${title}\n分区：${area_name}\n开播时间：${live_time}\n已结束直播，直播时长：${moment.utc(liveTime).format("HH:mm:ss")}`,
              ])
              writeLiveData(g, u, {})
              logger.info(`[Bilibili] 直播结束推送成功，房间ID：${room_id}，群ID：${g}`)
            } catch (e) {
              logger.error(e)
            }
          }
        }
      }
    }
  })
}

export function onBotEvent(event) {
  console.log("[example-plugin] received bot event:", event)
}
