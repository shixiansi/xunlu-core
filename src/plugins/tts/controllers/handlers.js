import { Filemage, Downloader } from "#utils";
import Hobbyist from "../services/hobbyist.js";
import env from "../../../lib/env.js";
let hobbyist = new Hobbyist();
const resPath = env.RootPath + "/src/plugins/tts/resources/";
let downloader = new Downloader(resPath);
let file = new Filemage(resPath);
/**
 * 从字符串数组中找到与输入字符串匹配度最高的项
 * @param {string} inputStr - 输入的目标字符串
 * @param {string[]} strArray - 待匹配的字符串数组
 * @returns {string|null} 匹配度最高的字符串，无匹配则返回null
 */

const downAudioFiles = async (url, name) => {
  if (!file.isDirectory("/audio")) {
    file.CreatDir("/audio");
  }
  await downloader.downloadFile(
    url,
    `audio/${file.sanitizeFilename(name)}.mp3`,
  );
  return downloader.rootPath + `audio/${file.sanitizeFilename(name)}.mp3`;
};

const dealCharacterName = (name) => {
  return dealCategoryName(
    name
      .replace("_JA", "")
      .replace("_ZH", "")
      .replace("_EN", "")
      .replace("_KO", "")
      .replace("-中文-", "")
      .replace("-日语-", "")
      .replace("-英语-", "")
      .replace("-韩语-", "")
      .replace("-.ipynb_checkpoints-", ""),
  );
};

const dealCategoryName = (name) => {
  let catelist = file.getFileDataToJson("category.json");
  catelist.forEach((c) => {
    name = name.replace(c, "");
  });
  return name;
};
function findHighestMatch(inputStr, strArray) {
  console.log(inputStr, strArray);

  // 第一步：优先查找完全匹配的项（最高优先级）
  const exactMatch = strArray.find((item) => item === inputStr);
  console.log(exactMatch);

  if (exactMatch) {
    return exactMatch;
  }

  // 第二步：查找前缀匹配的项（次优先级）
  const prefixMatches = strArray.filter((item) => item.includes(inputStr));
  console.log(prefixMatches);

  if (prefixMatches.length > 0) {
    // 前缀匹配中选最短的（比如输入"香"，"香火"和"香水"中选更短的，若长度相同则选第一个）
    return prefixMatches.reduce((shortest, current) => {
      return current.length < shortest.length ? current : shortest;
    }, prefixMatches[0]);
  }

  // 第三步：无匹配项
  return null;
}

export function register(bot) {
  if (!bot || !bot.registerCommand) return;
  bot.registerCommand(["^(.+)说"], async (ctx) => {
    let characterAudioList = file.getFileDataToJson("hobbyist.json");
    // console.log(characterAudioList);
    let strarr = ctx.msg.split("说");
    const characterList = Object.keys(characterAudioList).map((i) => {
      return {
        name: dealCharacterName(i),
        originalName: i,
      };
    });

    let model = findHighestMatch(
      strarr[0],
      characterList.map((i) => i.name),
    );
    model = characterList.find(
      (i) =>
        i.name === model &&
        (i.originalName.includes("ZH") || i.originalName.includes("中文")),
    )?.originalName;
    console.log(model);
    if (!model) {
      return false;
      await ctx.reply("未找到对应的语音模型");
    }

    if (model) {
      let audio = await hobbyist.getModelAudio(
        model,
        strarr[1].replace(/\（.*?\）/g, ""),
      );
      console.log(audio);
      if (audio?.msg && !audio.audio_url) {
        return await ctx.reply(audio?.msg);
      }
      let filePath = await downAudioFiles(
        audio.audio_url,
        `${model}-${strarr[1].slice(0, 10)}`,
      );
      return await ctx.reply([
        {
          type: "record",
          data: {
            uri: `file://${process.cwd()}/${filePath}`,
          },
        },
      ]);
    } else {
      return;
    }
  });

  bot.registerCommand(["#语音模型列表"], async (ctx) => {
    let characterAudioList = file.getFileDataToJson("hobbyist.json");
    let catelist = await hobbyist.getCategories();
    console.log(catelist);

    ctx.reply(
      "请选择需要查看的模型列表：\n" +
        catelist.map((item, index) => `【${index + 1}】${item}`).join("\n"),
    );
    bot.contextReply(ctx, async (rep) => {
      rep.msg = rep.msg.replace(/\D/g, "");
      let index = parseInt(rep.msg) - 1;
      if (index >= 0 && index < catelist.length) {
        let ttslist = [
          ...new Set(
            Object.keys(characterAudioList).map((item) => {
              if (item.includes(catelist[index])) {
                return dealCharacterName(item).replace(
                  `${catelist[index]}`,
                  "",
                );
              }
            }),
          ),
        ];
        return await rep.reply(
          await rep.renderImg("tts", { ttsList: ttslist }),
        );
      } else {
        ctx.reply("非法选择，请重新选择！");
      }
    });
  });

  bot.registerCommand(["tts帮助"], async (ctx) => {
    console.log(process.env.xunLuEnv);
    ctx.reply(
      "tts帮助:\n#语音模型列表（查看模型列表）\n模型名+说+内容（使用模型说话,如“可莉说你好”不需要加游戏名。只需要角色名即可）",
    );
  });
}

export function onBotEvent(event) {
  console.log("[example-plugin] received bot event:", event);
}
