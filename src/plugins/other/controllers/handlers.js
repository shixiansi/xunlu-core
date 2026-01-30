import lodash from "lodash";
export function register(bot) {
  if (!bot || !bot.registerCommand) return;
  //第一个参数是数组第一个是命令，第二个是事件,如果是其他事件就是事件列表中的事件名称，第二个是方法，第三个是下文函数
  bot.registerCommand(["", 1000], async (ctx) => {
    if (ctx.isMaster && ctx.msg) {
      let rlist = ["277"];
      for (let i of rlist) {
        ctx.sendGroupMessageReaction({
          group_id: ctx.group_id,
          message_seq: ctx.message_seq,
          reaction: i,
        });
      }
    }
  });

  bot.registerCommand(["一会做什么", 1000], async (ctx) => {
    console.log("被调用的ctx", ctx);

    if (ctx.isMaster) {
      let rlist = ["重构项目", "打原神", "看小说", "学习"];
      ctx.reply(rlist[lodash.random(0, rlist.length - 1)]);
    }
  });

  bot.registerCommand(["调用", 1000], async (ctx) => {
    if (ctx.isMaster) {
      ctx.reply("我将会调用语音合成发送：可莉说你是个几把");
      bot.callFnc("tts-plugin-1", { ...ctx, msg: "可莉说你是个几把" });
    }
  });

  bot.registerCommand(["", "notice.group.poke"], (ctx) => {
    ctx.reply("戳一戳");
  });

  bot.setTask("0 27 16 * * *", () => {
    Bot.sendMsg(
      {
        group_id: 428596438,
      },
      "这tm是一条16点27分发送的定时消息！我将会调用一会干什么这个指令",
    );
    bot.callFnc("pixiv-1", {
      user_id: 1765629830,
      group_id: 428596438,
      isMaster: true,
      msg: "随机图",
    });
  });
}
