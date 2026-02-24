import { segment } from "../../../Bot/segment.js"
import Blogin from "../model/Blogin.js"
import Bili from "../model/Bilili.js"
import lodash from "lodash"
import Filemage from "../../../utils/Filemage.js"
import moment from "moment"
const filemage = new Filemage()
filemage.CreatDir("src/plugins/bilibili/data")
filemage.CreatDir("src/plugins/bilibili/data/medallist/")
filemage.CreatDir("src/plugins/bilibili/data/group")
const dynamicType = {
  live: "直播",
  text: "文字",
  draw: "图文",
  av: "视频",
  forward: "转发",
  article: "专栏",
  raffle: "抽奖",
}

function writeBiliData(groupId, uid, data) {
  console.log(groupId, uid, data)

  let gdata = getBiliData(groupId) || {}
  gdata[uid] = data
  if (data == null) {
    delete gdata[uid]
  }
  filemage.writeFileJsonData(`src/plugins/bilibili/data/group/${groupId}.json`, gdata)
  logger.debug(
    `[Bilibili] 更新直播状态，群ID：${groupId}，用户ID：${uid}，状态：${data?.live_status === 1 ? "直播中" : "下播"}`,
  )
}

function getUpList(groupId) {
  let gdata = getBiliData(groupId)
  return Object.keys(gdata) || []
}

function getBiliData(groupId, uid) {
  let gdata = {}
  try {
    gdata = filemage.getFileDataToJson(`src/plugins/bilibili/data/group/${groupId}.json`) || {}
  } catch (e) {
    filemage.writeFileJsonData(`src/plugins/bilibili/data/group/${groupId}.json`, gdata)
  }
  return uid ? gdata[uid] : gdata
}

function writeLiveData(groupId, uid, data) {
  let gdata = getBiliData(groupId) || {}
  gdata[uid].live = data
  writeBiliData(groupId, uid, gdata[uid])
}

export function register(bot) {
  if (!bot || !bot.registerCommand) return

  bot.registerCommand(
    "^#订阅(UP|up|)(直播|文字|图文|视频|转发|抽奖|专栏|)(动态|)(uid:|UID:|)",
    async ctx => {
      let dtype = ctx.msg.match(/直播|文字|图文|视频|转发|抽奖|专栏/g)?.[0] || "全部"
      let mid = ctx.msg.replace(new RegExp(ctx.reg), "").trim() //纯数字
      if (!mid) {
        return ctx.reply("订阅不能为空，请输入用户id或者用户昵称！")
      }
      if (isNaN(mid)) {
        let data = await Bili.getSearchUser(mid)
        if (!data) {
          return ctx.reply("没有找到该用户呢！")
        }
        mid = data.mid
      }
      let reslut = await Bili.getUpdateDynamic(mid)
      let updata = getBiliData(ctx.group_id, mid) || {}
      if (reslut?.code && reslut.code != 0) {
        if (reslut.code == -352) {
          return ctx.reply("请先设置b站ck进行订阅！使用“b站扫码”命令进行登录！")
        }
        return ctx.reply(reslut.message || reslut.msg)
      }
      let data, type
      type = Object.entries(dynamicType).find(item => item[1] == dtype)?.[0]

      data = {
        nickname: reslut?.author?.nickname,
        upuid: reslut?.id || 0,
        uid: mid,
        img: reslut?.author?.img,
        pendantImg: reslut?.author?.pendantImg,
        dynamicType: updata?.dynamicType ? [...updata?.dynamicType, type] : [type],
      }

      if (reslut?.code == 0) {
        let authorInfo = await Bili.getUserBaseInfo(mid)
        data = {
          ...data,
          nickname: authorInfo?.name,
          img: authorInfo?.face,
          pendantImg: authorInfo?.pendant?.image,
          dynamicType: updata?.dynamicType ? [...updata?.dynamicType, type] : [type],
        }
      }

      if (!type) {
        delete data.dynamicType
        type = "all"
      }
      console.log("订阅的:ctx", ctx)

      updata = data
      writeBiliData(ctx.group_id, mid, updata)
      return ctx.reply([
        segment.image(data.img),
        `昵称：${data.nickname}\n`,
        type == "all"
          ? `订阅Up主${data.nickname}成功！`
          : `已订阅Up主${data.nickname}的${dynamicType[type]}推送！`,
      ])
    },
  )

  bot.registerCommand(
    "^#取消订阅(UP|up|)(直播|文字|图文|视频|转发|抽奖|专栏|)(动态|)(uid:|UID:|)",
    async ctx => {
      let dtype = ctx.msg.match(/直播|文字|图文|视频|转发|抽奖|专栏/g)?.[0]
      let mid = ctx.msg.replace(new RegExp(ctx.reg), "")
      if (!mid) {
        return ctx.reply("请输入B站用户id或者用户昵称！")
      }
      if (isNaN(mid)) {
        let data = await Bili.getSearchUser(mid)
        if (!data) {
          return ctx.reply("没有找到该用户呢！")
        }
        mid = `${data.mid}`
      }
      let updata = getBiliData(ctx.group_id, mid)
      let result = { ...updata }

      let type = Object.entries(dynamicType).find(item => item[1] == dtype)?.[0] || "all"
      if (!getUpList(ctx.group_id).includes(mid)) {
        return ctx.reply("暂未订阅该up主！")
      } else if (type == "all") {
        updata = null
      } else {
        updata = {
          ...updata,
          unpush: updata?.unpush ? [...updata?.unpush, type] : [type],
        }
      }
      console.log(type, updata)

      writeBiliData(ctx.group_id, mid, updata)
      return ctx.reply(
        type == "all"
          ? `取消订阅Up主${result?.nickname}成功！`
          : `已取消Up主${result?.nickname}的${dynamicType[type]}推送！`,
      )
    },
  )

  bot.registerCommand(["", 100], async ctx => {
    console.log("b站解析", ctx)
    if (!ctx.json && !ctx.url) return false
    let url = ctx.url
    let urllist = ["b23.tv", "m.bilibili.com", "www.bilibili.com"]
    let reg2 = new RegExp(`${urllist[0]}|${urllist[1]}|${urllist[2]}`)
    if (ctx.json) {
      let json = ctx.json
      url = json.meta.detail_1?.qqdocurl || json.meta.news?.jumpUrl
    }
    if (!url || !url.match(reg2)) return false
    let bilireg = /(BV.*?).{10}/
    let bv = url.match(bilireg)
    if (bv) {
      //存在bv长链接
      bv = bv[0]
    } else {
      //不存在长链接
      let curl = await Bili.getCompleteUrl(url)
      console.log(curl)

      bv = curl.match(bilireg)[0]
    }

    return await ctx.reply(`正在查询${bv}相关信息，请稍后...`)
  })

  bot.registerCommand("^(|#)b站扫码$", async ctx => {
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

  bot.registerCommand("^#查询灯牌", async ctx => {
    let card = ctx.msg.replace(new RegExp(ctx.reg), "")
    if (!card) {
      return await ctx.reply("请输入要查询的直播的灯牌！")
    }
    let result
    await ctx.reply("正在查询中，请稍后...")
    try {
      let list = await Bili.getSearchFans(card)
      if (list.length > 0) {
        result = list[0]
      } else {
        throw new Error("没有找到该直播的灯牌！")
      }
    } catch (error) {
      console.log(error)
      return await ctx.reply("查询失败！")
    }
    if (result) {
      let authorInfo = await Bili.getUserBaseInfo(result.anchor_uid)
      result = {
        ...result,
        img: authorInfo?.face,
      }
      return await ctx.reply([
        segment.image(result.img),
        `查询的灯牌结果如下：\n昵称：${result.anchor_name}\nuid：${result.anchor_uid}\n直播间：https://live.bilibili.com/${result.room_id}`,
      ])
    } else {
      return await ctx.reply("没有找到该直播的灯牌！")
    }
  })

  bot.registerCommand("#查询up最新动态", async ctx => {
    if (!ctx.isGroup) return false
    let mid = ctx.msg.replace("#查询up最新动态", "")
    let result = await Bili.getFirstDynamic(mid)

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
    let glist = filemage.GetfileList("src/plugins/bilibili/data/group")
    if (glist.length == 0) return
    for (let g of glist.map(i => i.replace(".json", ""))) {
      let flist = filemage.getFileDataToJson(`src/plugins/bilibili/data/group/${g}.json`)
      for (let u in flist) {
        if (!flist[u]) continue
        let result = await Bili.getRoomInfobyMid(u)
        if (!result) continue
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
            console.log(g)

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
