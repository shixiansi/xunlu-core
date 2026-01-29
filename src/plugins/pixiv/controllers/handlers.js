/**
 * @Author: 时先思
 * @Date: 2025-12-13 14:29:17
 * @LastEditTime: 2026-01-29 17:33:37
 * @LastEditors: 时先思
 * @Description:
 * @FilePath: \plugin-api\src\plugins\pixiv\controllers\handlers.js
 * @版权声明
 **/
import fetch from "node-fetch";
import lodash from "lodash";
import huanyin from "../model/phantomtank.js";
async function getpixivPic() {
  return await (
    await fetch(
      `https://shithink.xyz/api/pixivRandombg?mode=${lodash.random(1, 2) == 1 ? "pc" : "app"}`,
    )
  ).json();
}

export function register(bot) {
  if (!bot || !bot.registerCommand) return;
  //第一个参数是数组第一个是命令，第二个是事件，第三个是定时函数，如果是其他事件就是事件列表中的事件名称，第二个是方法，第三个是下文函数
  bot.registerCommand(["随机图"], async (ctx) => {
    let { data: pic } = await getpixivPic();
    console.log(pic);
    //https://i.pximg.org/img-original/img/2026/01/25/01/47/34/140340597_p0.jpg
    //https://i.pximg.net/c/600x1200_90/img-master/img/2021/10/31/00/00/07/93790806_p0_master1200.jpg
    await ctx.reply([
      {
        type: "text",
        data: {
          text: `id：${pic.id} \n画师：${pic.user.name}（${pic.user.id}）\n是否ai：${pic.aiType ? "是" : "否"}\n标题：${pic.title}\n上传时间：${pic.updateTime}\n♥：${pic.bookmarkCount}\n👁：${pic.viewCount}\ntag：${pic.tags}`,
        },
      },
      {
        type: "image",
        data: {
          uri:
            pic.urls.original?.replace("pximg.net", "pixiv.re") ||
            pic.urls.large
              .replace("pximg.net", "pixiv.re")
              .replace("c/600x1200_90/img-master", "img-original")
              .replace("_master1200", ""),
        },
      },
    ]);
  });
  bot.registerCommand(["^来张(.*)色图$"], async (ctx) => {
    let tag = ctx.msg.replace(/^来张(.+)色图$/, "$1");
    if (tag == "来张色图") tag = "萝莉";
    console.log(tag);
    let imgUrl, pic;
    const SynthesisImg = async () => {
      let { data } = await (
        await fetch(`http://localhost:2333/api/setu?type=json&tag=${tag}`)
      ).json();
      pic = data;
      if (!pic) {
        return await ctx.reply("未找到相关色图");
      }
      imgUrl =
        pic.urls.original?.replace("i.pximg.net", "img.shithink.xyz") ||
        pic.urls.large
          .replace("i.pximg.net", "img.shithink.xyz")
          .replace("c/600x1200_90/img-master", "img-original")
          .replace("_master1200", "");

      try {
        await huanyin(undefined, imgUrl, undefined);
      } catch (e) {
        if (e.message && e.message.includes("HTTP 404 Not Found")) {
          // ctx.reply("原来的图片被怪兽吃掉了，人家正在重新找...");
          await SynthesisImg();
        }
      }
    };
    await SynthesisImg();
    return ctx.reply(
      [
        {
          type: "text",
          data: {
            text: `id：${pic.id} \n画师：${pic.user.name}（${pic.user.id}）\n是否ai：${pic.aiType ? "是" : "否"}\n标题：${pic.title}\n上传时间：${pic.updateTime}\n♥：${pic.bookmarkCount}\n👁：${pic.viewCount}\ntag：${pic.tags}\n原图链接：${imgUrl}`,
          },
        },
        {
          type: "image",
          data: {
            uri: "file://" + process.cwd() + "/mirage_tank_web.png",
          },
        },
      ],
      false,
      { recallMsg: 120 },
    );
  });
  console.log("[example-plugin] registered with bot shim");
}

export function onBotEvent(event) {
  console.log("[example-plugin] received bot event:", event);
}
