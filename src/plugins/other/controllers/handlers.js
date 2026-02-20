import lodash from "lodash"
import { segment } from "../../../Bot/segment.js"
let isStart = false
export function register(bot) {
  if (!bot || !bot.registerCommand) return
  //第一个参数是数组第一个是命令，第二个是事件,如果是其他事件就是事件列表中的事件名称，第二个是方法，第三个是下文函数
  bot.registerCommand(["", 1000], async ctx => {
    if (!isStart) {
      isStart = true
      ctx.reply(ctx.adapterType + "Bot启动成功！")
    }
    if (ctx.isMaster && ctx.msg) {
      let rlist = ["277"]
      for (let i of rlist) {
        ctx.sendGroupMessageReaction({
          group_id: ctx.group_id,
          message_id: ctx?.message_id,
          message_seq: ctx?.seq,
          reaction: i,
        })
      }
    }
  })

  bot.registerCommand(["一会做什么", 1000], async ctx => {
    console.log("被调用的ctx", ctx)

    if (ctx.isMaster) {
      let rlist = ["重构项目", "打原神", "看小说", "学习"]
      ctx.reply(rlist[lodash.random(0, rlist.length - 1)])
    }
  })

  bot.registerCommand(["调用", 1000], async ctx => {
    if (ctx.isMaster) {
      ctx.reply("我将会调用语音合成发送：可莉说你是个几把")
      bot.callFnc("tts-plugin-1", { ...ctx, msg: "可莉说你是个几把" })
    }
  })

  bot.registerCommand(["取直链", 1000], async ctx => {
    if (ctx.message[0]?.type != "reply" && !ctx?.source) return ctx.reply("请回复需要取直链的消息")

    const replyMsg_seq = ctx?.source.seq || ctx.message[0]?.data?.message_seq
    console.log(replyMsg_seq)

    let msgInfo = await ctx.getReplyMsg(replyMsg_seq)
    console.log("这是取直链的msgInfo", msgInfo)
    let msglist = msgInfo?.message?.message || msgInfo[0].message
    console.log("这是msglist", msglist)

    const image = msglist.find(i => i.type == "image")
    console.log("这是image", image)

    if (!image) return ctx.reply("该消息没有图片")
    return ctx.reply([segment.image(image.url), image.url])
  })

  bot.setTask("0 15 16 * * *", () => {
    Bot.sendMsg(
      {
        group_id: 428596438,
      },
      "这tm是一条16点15分发送的定时消息！我将会调用来张色图这个指令",
    )
    bot.callFnc("pixiv-1", {
      user_id: 1765629830,
      group_id: 428596438,
      isMaster: true,
      msg: "随机图",
    })
  })
}
