import _ from "lodash";
const groupPass = {};

function randomWithDigits(digits) {
  if (!Number.isInteger(digits) || digits <= 0) {
    throw new Error("位数必须是正整数");
  }
  const min = Math.pow(10, digits - 1); // 最小值，例如 3 位数 -> 100
  const max = Math.pow(10, digits) - 1; // 最大值，例如 3 位数 -> 999
  return _.random(min, max);
}

export function register(bot) {
  if (!bot || !bot.registerCommand) return;
  //第一个参数是数组第一个是命令，第二个是事件，第三个是优先级（第二个和第三个都可以省略）
  bot.registerCommand(["", "request.group.add"], async (ctx) => {
    const user_id = ctx.initiator_id;
    let userInfo = await ctx.getUserInfo({ user_id });
    let passID = randomWithDigits(10);
    groupPass[passID] = {
      notification_seq: ctx.notification_seq,
      notification_type: "join_request",
      group_id: ctx.group_id,
      is_filtered: false,
    };
    ctx.reply([
      {
        type: "text",
        data: {
          text: `这个吊毛要进来了\n${userInfo.nickname}（${user_id}）\n临时通行证ID:${passID}`,
        },
      },
      {
        type: "image",
        data: {
          uri: `https://q1.qlogo.cn/g?b=qq&nk=${user_id}}&s=100`,
        },
      },
      {
        type: "text",
        data: {
          text: ctx.comment,
        },
      },
    ]);
  });
  bot.registerCommand(["(开门|关门)"], async (ctx) => {
    if (ctx.segments[0]?.type == "reply") {
      const replyMsg = ctx.segments[0]?.data?.message_seq;
      let msgInfo = await ctx.getMsg({
        message_scene: ctx.message_scene,
        peer_id: ctx.peer_id,
        message_seq: replyMsg,
      });

      let msglist = msgInfo.message.segments;
      if (msglist[0].data?.text.includes("临时通行证ID")) {
        let passID = msglist[0].data?.text.split("ID:")[1].trim();
        if (groupPass[passID] && ctx.msg == "开门") {
          ctx.acceptGroupRequest(groupPass[passID]);
          return ctx.reply("已开门！");
        } else {
          ctx.rejectGroupRequest(groupPass[passID]);
          return ctx.reply("已经把这个家伙拒之门外了！");
        }
      }
    } else return ctx.reply("未获取到申请信息");
  });
  bot.registerCommand(["", "notice.group.increase"], async (ctx) => {
    console.log(ctx);
    let userInfo = await ctx.getUserInfo({ user_id: ctx.user_id });
    bot.callFnc("tts-plugin-1", {
      ...ctx,
      msg: `可莉说欢迎${userInfo.nickname || "不知名的家伙"}入群`,
    });
  });

  // bot.callFnc("test", { group_id: 434343, user_id: 232332 });
}

export function onBotEvent(event) {
  console.log("[example-plugin] received bot event:", event);
}
