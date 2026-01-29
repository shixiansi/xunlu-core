export function register(bot) {
  if (!bot || !bot.registerCommand) return;
  //第一个参数是数组第一个是命令，第二个是事件,如果是其他事件就是事件列表中的事件名称，第二个是方法，第三个是下文函数
  bot.registerCommand(["", 1000], async (ctx) => {
    if (ctx.isMaster) {
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
  console.log(bot);

  bot.setTask("0 30 0 * * *", () => {
    // Bot.sendMsg(
    //   {
    //     group_id: 428596438,
    //   },
    //   "这tm是一条0点30分发送的定时消息！",
    // );
  });
}
