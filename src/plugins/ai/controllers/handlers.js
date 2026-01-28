import CaimiaoAI from "../services/caimiao.js";
import Hobbyist from "../../tts/services/hobbyist.js";
import { Filemage } from "#utils";
const historyDialogue = {};
let caimiaoAI = new CaimiaoAI();
let hobbyist = new Hobbyist();
let selectedChatlist = [];
let file = new Filemage("./src/plugins/ai/resources/CharacterDesign/");
export function register(bot) {
  if (!bot || !bot.registerCommand) return;
  bot.registerCommand([""], async (ctx) => {
    console.log(ctx.segments);
    if (ctx.segments[0]?.type == "reply") {
      const replyMsg = ctx.segments[0]?.data?.message_seq;
      let msgInfo = await ctx.getMsg({
        message_scene: ctx.message_scene,
        peer_id: ctx.peer_id,
        message_seq: replyMsg,
      });
      console.log(msgInfo);
      let msglist = msgInfo.message.segments;
      console.log(msglist[0].data.text);

      if (
        msglist[0].data.text.includes("id") ||
        msglist[0].data.text.includes("画师")
      ) {
        return ctx.recallGroupMessage({
          group_id: ctx.group_id,
          message_seq: msgInfo.message.message_seq,
        });
      }
    }
    if (ctx.msg == "本地人设对话") {
      let setlist = file.GetfileList();
      ctx.reply(
        "本地人设对话列表：\n" +
          setlist
            .map((item, index) => `${index + 1}. ${item.replace(".txt", "")}`)
            .join("\n"),
      );
      console.log(ctx.msg);

      const selectedNum = await waitForUserChoice(bot, ctx, setlist.length);
      if (selectedNum === -1) return;
      ctx.reply(`你选择的是第${selectedNum + 1}个人设`);
      let setData = file.getFileData(setlist[selectedNum]);
      let selectedChat = await caimiaoAI.getNewChat();

      return await AiDialogueContinuous(bot, selectedChat, ctx, setData);
    }

    if (ctx.atBot) {
      console.log(selectedChatlist);

      if (selectedChatlist.length == 0 || !selectedChatlist) {
        let res = await caimiaoAI.getChatList();
        console.log(res);

        selectedChatlist = res.list;
      }
      console.log(selectedChatlist);

      return await aiDialogue(bot, selectedChatlist[0], ctx);
    }

    if (!ctx.msg.includes("蔡喵")) return;
    let { list } = await caimiaoAI.getChatList();
    selectedChatlist = list;
    if (list.length > 0) {
      ctx.reply(
        "检测到存在对话，请选择对话主题：\n" +
          list.map((item, index) => `${index + 1}. ${item.title}`).join("\n"),
      );

      const selectedNum = await waitForUserChoice(bot, ctx, list.length);

      if (selectedNum === -1) return; // 输入超时或无效

      const selectedChat = list[selectedNum];
      await ctx.reply(
        `已选择“${selectedChat.title}”，开始聊天吧！输入“#结束蔡喵对话”退出。`,
      );

      //开启ai对话（主动）
      await AiDialogueContinuous(bot, selectedChat, ctx);
    } else {
    }
    // ctx.reply("蔡喵AI正在思考...");
  });
  console.log("[example-plugin] registered with bot shim");
}

//自动发消息方法
async function autoSendAIMsg() {
  //重新设置一个群友一个人格
  let getgroupHistrory = await getHistorybyGroup(ctx.group_id);
}

async function aiDialogue(bot, selectedChat, ctx, setData) {
  const selectList = ["", ""];
  try {
    const response = await caimiaoAI.chat(
      selectedChat.chat_id,
      setData || ctx.msg,
      {
        onProgress: (chunk, fullText, choiceIndex) => {
          console.log(`候选 ${choiceIndex} 实时更新:`, chunk);
          if (chunk) {
            selectList[choiceIndex] += chunk;
          }
        },
      },
    );
    setData = "";
    console.log("触发了对话结果是：", response);
    console.log(selectList);
    let choices;
    if (response?.code) {
      await ctx.reply(response.detail);
      let { list } = await caimiaoAI.getmessageslist(selectedChat.chat_id);
      choices = list[0].choices;
      if (choices) {
        choices.map((c, index) => (selectList[index] = c.content));
      }
    }
    if (selectList[0] && selectList[1]) {
      await ctx.reply(
        "请选择:" +
          selectList
            .map((item, index) => `\n选项${index + 1}：${item}`)
            .join(""),
      );
      const selectedNum = await waitForUserChoice(bot, ctx, 2);
      if (selectedNum == -1) {
        selectedNum = 0;
        ctx.reply(`用户没有做出选择，已默认第一个选项！`);
      }
      if (choices) {
        response.msg_id = choices[selectedNum].msg_id;
      }
      await ctx.reply(`你选择的是第${selectedNum + 1}个选项`);
      await caimiaoAI.choice(selectedNum, response.msg_id);
      response.text = selectList[selectedNum];
    }
    await ctx.reply(response.text);
  } catch (error) {
    console.log(error);

    await ctx.reply("蔡喵AI出错了，请稍后再试！");
  }
}

async function AiDialogueContinuous(bot, selectedChat, ctx, setData) {
  if (!historyDialogue[ctx.group_id]) historyDialogue[ctx.group_id] = [];

  if (!historyDialogue[ctx.group_id].includes(ctx.user_id))
    historyDialogue[ctx.group_id].push(ctx.user_id);

  bot.contextReply(
    ctx,
    async (rep) => {
      if (rep.msg === "#结束蔡喵对话") return rep.reply("对话已结束", true);
      await aiDialogue(bot, selectedChat, rep, setData);
      setData = "";
    },
    "#结束蔡喵对话",
  );
}

async function waitForUserChoice(bot, ctx, maxOption) {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      resolve(-1); // 超时处理
    }, 30000);
    bot.contextReply(ctx, async (e) => {
      const num = parseInt(e.msg);

      if (num > 0 && num <= maxOption) {
        resolve(num - 1);
        clearTimeout(timeoutId);
        return true;
      } else {
        await e.reply(`请输入1-${maxOption}之间的数字`);
        return false;
      }
    });
  });
}

export function onBotEvent(event) {
  console.log("[example-plugin] received bot event:", event);
}
