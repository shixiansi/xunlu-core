import ToImageService from "./index.js";
import fs from "fs";
import path from "path";

const _res_path = path.resolve("./src/plugins/tts/resources");

const bgPath = path.join(_res_path, "img/bg/bg1.jpg");

// 读取图片并转换为 Base64
async function getBase64Image() {
  try {
    const imageBuffer = fs.readFileSync(bgPath);
    const base64Image = imageBuffer.toString("base64");
    const mimeType = "image/jpeg"; // 根据实际图片格式调整
    return `data:${mimeType};base64,${base64Image}`;
  } catch (error) {
    console.error("读取背景图失败:", error);
    return null; // 或提供一个回退颜色
  }
}

// 在渲染时使用
const backgroundImageUrl = await getBase64Image();
let times = Date.now();
console.log(times);
console.log();
const ttsList = [
  "中文女声-小雅",
  "英文男声-杰克",
  "二次元-洛天依",
  "方言-四川话",
  "中文女声-小雅",
  "英文男声-杰克",
  "二次元-洛天依",
  "方言-四川话",
  "中文女声-小雅",
  "英文男声-杰克",
  "二次元-洛天依",
  "方言-四川话",
  "中文女声-小雅",
  "英文男声-杰克",
  "二次元-洛天依",
  "方言-四川话",
  "中文女声-小雅",
  "英文男声-杰克",
  "二次元-洛天依",
  "方言-四川话",
  "中文女声-小雅",
  "英文男声-杰克",
  "二次元-洛天依",
  "方言-四川话",
  "中文女声-小雅",
  "英文男声-杰克",
  "二次元-洛天依",
  "方言-四川话",
  "中文女声-小雅",
  "英文男声-杰克",
  "二次元-洛天依",
  "方言-四川话",
  "中文女声-小雅",
  "英文男声-杰克",
  "二次元-洛天依",
  "方言-四川话",
  "中文女声-小雅",
  "英文男声-杰克",
  "二次元-洛天依",
  "方言-四川话",
  "中文女声-小雅",
  "英文男声-杰克",
  "二次元-洛天依",
  "方言-四川话",
  "中文女声-小雅",
  "英文男声-杰克",
  "二次元-洛天依",
  "方言-四川话",
  "中文女声-小雅",
  "英文男声-杰克",
  "二次元-洛天依",
  "方言-四川话",
  "中文女声-小雅",
  "英文男声-杰克",
  "二次元-洛天依",
  "方言-四川话",
  "中文女声-小雅",
  "英文男声-杰克",
  "二次元-洛天依",
  "方言-四川话",
  "中文女声-小雅",
  "英文男声-杰克",
  "二次元-洛天依",
  "方言-四川话",
];
const res = await new ToImageService().jsxToImage(
  fs.readFileSync("./src/plugins/tts/resources/html/tts.jsx", "utf-8"),
  {
    backgroundImageUrl: backgroundImageUrl, // 使用绝对路径
    ttsList,
    boxheight: (ttsList.length / 3) * 150 + 700,
  },
  {},
);
fs.writeFileSync("./test.png", res);
console.log("生成完毕，耗时", +Date.now() - times, "ms");
