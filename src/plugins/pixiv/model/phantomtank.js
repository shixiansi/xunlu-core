import { Jimp } from "jimp";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import fsPromises from "fs/promises";
import { getRuntimePaths } from "../../../runtime/runtime-context.js";

// 基础配置（适配ES模块）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// 临时文件目录
const TEMP_DIR = getRuntimePaths().getPluginTempDir("pixiv", "mirage");

// ===================== 工具函数：目录/文件检查 =====================
/**
 * 确保目录存在（不存在则创建）
 * @param {string} dirPath 目录路径
 */
function ensureDirExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`📁 创建临时目录：${dirPath}`);
  }
}

/**
 * 检查文件是否存在
 * @param {string} filePath 文件路径
 * @returns {boolean} 是否存在
 */
function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

/**
 * 等比例缩放并居中裁剪图片（避免拉伸，修复输入输出同文件问题）
 * @param {string} inputPath 输入图片路径
 * @param {number} targetW 目标宽度
 * @param {number} targetH 目标高度
 * @returns {string} 裁剪后的新文件路径
 */
async function resizeAndCropImage(inputPath, targetW, targetH) {
  try {
    // 核心修复：生成新的输出路径，避免输入输出同文件
    const cropFileName = `cropped_${uuidv4()}.png`;
    const outputPath = path.join(TEMP_DIR, cropFileName);

    await sharp(inputPath)
      .resize(targetW, targetH, {
        fit: "cover", // 等比例缩放，超出部分裁剪
        position: "center", // 居中裁剪
        kernel: sharp.kernel.cubic,
      })
      .png()
      .toFile(outputPath);

    console.log(
      `✅ 图片自适应裁剪完成：${inputPath} → ${outputPath} (${targetW}×${targetH})`,
    );
    return outputPath;
  } catch (error) {
    console.error("❌ 图片裁剪失败：", error);
    throw error;
  }
}

/**
 * 彻底清理临时目录（删除所有缓存文件）
 */
async function cleanTempDir() {
  try {
    if (!fs.existsSync(TEMP_DIR)) return;

    const files = await fsPromises.readdir(TEMP_DIR);
    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      // 只删除png临时文件（避免误删其他文件）
      if (path.extname(file).toLowerCase() === ".png") {
        await fsPromises.unlink(filePath);
        console.log(`✅ 清理缓存文件：${filePath}`);
      }
    }
    console.log(`✅ 临时目录清理完成：${TEMP_DIR}`);
  } catch (error) {
    console.warn(`⚠️  临时目录清理不完全：${error.message}`);
  }
}

// ===================== 新增：网络图片下载工具（修复格式问题） =====================
/**
 * 下载网络图片并转换为PNG格式（解决格式不支持问题）
 * @param {string} url 网络图片URL
 * @returns {string} 临时文件路径（PNG格式）
 */
async function downloadImage(url) {
  try {
    // 确保临时目录存在
    ensureDirExists(TEMP_DIR);

    // 生成唯一临时文件名（强制PNG后缀）
    const tempFileName = `${uuidv4()}.png`;
    const tempPath = path.join(TEMP_DIR, tempFileName);

    // 下载图片并转换为PNG格式
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `下载失败：HTTP ${response.status} ${response.statusText}`,
      );
    }

    // 用sharp转换为PNG格式，避免格式不兼容
    const buffer = await response.buffer();
    await sharp(buffer)
      .png() // 强制转换为PNG
      .toFile(tempPath);

    console.log(`✅ 网络图片下载并转换完成：${url} → ${tempPath}`);
    return tempPath;
  } catch (error) {
    console.error("❌ 网络图片下载失败：", error);
    throw error;
  }
}

/**
 * 判断路径是否为网络图片URL
 * @param {string} pathOrUrl 路径/URL
 * @returns {boolean} 是否为网络URL
 */
function isNetworkImage(pathOrUrl) {
  return /^https?:\/\/.+$/.test(pathOrUrl?.trim() || "");
}

/**
 * 处理图片路径（网络URL自动下载，本地路径验证+格式转换）
 * @param {string} pathOrUrl 本地路径/网络URL
 * @returns {object} { filePath: 处理后的文件路径, isTemp: 是否为临时文件（需清理） }
 */
async function processImageSource(pathOrUrl) {
  console.log("处理图片源：", pathOrUrl);

  if (!pathOrUrl) {
    throw new Error("图片路径/URL不能为空");
  }

  if (isNetworkImage(pathOrUrl)) {
    // 网络图片：下载并转换为PNG
    const tempPath = await downloadImage(pathOrUrl);
    return { filePath: tempPath, isTemp: true };
  } else {
    // 本地图片：验证路径并转换为PNG
    const resolvedPath = path.resolve(__dirname, pathOrUrl);
    if (!fileExists(resolvedPath)) {
      throw new Error(`本地图片不存在：${resolvedPath}`);
    }

    // 本地图片也转换为PNG格式，统一处理
    const tempFileName = `local_${uuidv4()}.png`;
    const tempPngPath = path.join(TEMP_DIR, tempFileName);

    await sharp(resolvedPath)
      .png() // 强制转换为PNG
      .toFile(tempPngPath);

    return { filePath: tempPngPath, isTemp: true };
  }
}

// ===================== 核心：复刻网页工具函数（优化尺寸适配） =====================
/**
 * 复刻网页Desaturate（去色）逻辑：取RGB的max+mix平均
 * @param {object} img Jimp图片实例
 * @returns {object} 去色后的Jimp实例
 */
function desaturateLikeWeb(img) {
  const newImg = img.clone();
  newImg.scan(0, 0, newImg.bitmap.width, newImg.bitmap.height, (x, y) => {
    const hex = newImg.getPixelColor(x, y) >>> 0;
    // 解析RGB
    const r = (hex >> 24) & 0xff;
    const g = (hex >> 16) & 0xff;
    const b = (hex >> 8) & 0xff;

    // 网页核心逻辑：找max和mix
    let max, mix;
    if (r > g) {
      max = r;
      mix = g;
    } else {
      max = g;
      mix = r;
    }
    if (b > max) max = b;
    if (b < mix) mix = b;

    // 去色值 = (max + mix)/2
    const gray = Math.round((mix + max) / 2);
    const newHex = (gray << 24) | (gray << 16) | (gray << 8) | 255; // 不透明
    newImg.setPixelColor(newHex >>> 0, x, y);
  });
  return newImg;
}

/**
 * 复刻网页FindMixMax逻辑：找图片RGB的最小/最大值
 * @param {object} img Jimp图片实例
 * @returns {object} {Mix:最小值, Max:最大值}
 */
function findMixMaxLikeWeb(img) {
  let Mix = 255;
  let Max = 0;
  img.scan(0, 0, img.bitmap.width, img.bitmap.height, (x, y) => {
    const hex = img.getPixelColor(x, y) >>> 0;
    const r = (hex >> 24) & 0xff;
    const g = (hex >> 16) & 0xff;
    const b = (hex >> 8) & 0xff;

    // 更新最小/最大值
    if (r < Mix) Mix = r;
    if (r > Max) Max = r;
    if (g < Mix) Mix = g;
    if (g > Max) Max = g;
    if (b < Mix) Mix = b;
    if (b > Max) Max = b;
  });
  return { Mix, Max };
}

/**
 * 复刻网页Levels（色阶）逻辑：表图提亮、里图压暗
 * @param {object} img1 表图（去色后）
 * @param {object} img2 里图（去色后）
 * @returns {object} {output1:提亮后的表图, output2:压暗后的里图}
 */
function levelsLikeWeb(img1, img2) {
  // 1. 计算色阶调整值（网页核心公式）
  const img1_mix = findMixMaxLikeWeb(img1).Mix;
  const img1_change = 128 - img1_mix;
  const img2_max = findMixMaxLikeWeb(img2).Max;
  const img2_change = 127 - img2_max;

  // 2. 表图提亮（网页公式：R + (255-R)/255 * img1_change）
  const output1 = img1.clone();
  output1.scan(0, 0, output1.bitmap.width, output1.bitmap.height, (x, y) => {
    const hex = output1.getPixelColor(x, y) >>> 0;
    const r = (hex >> 24) & 0xff;
    const g = (hex >> 16) & 0xff;
    const b = (hex >> 8) & 0xff;

    // 提亮计算
    const newR = Math.round(r + ((255 - r) / 255) * img1_change);
    const newG = Math.round(g + ((255 - g) / 255) * img1_change);
    const newB = Math.round(b + ((255 - b) / 255) * img1_change);

    // 边界兜底
    const clamp = (v) => Math.max(0, Math.min(255, v));
    const newHex =
      (clamp(newR) << 24) | (clamp(newG) << 16) | (clamp(newB) << 8) | 255;
    output1.setPixelColor(newHex >>> 0, x, y);
  });

  // 3. 里图压暗（网页公式：R + R/255 * img2_change）
  const output2 = img2.clone();
  output2.scan(0, 0, output2.bitmap.width, output2.bitmap.height, (x, y) => {
    const hex = output2.getPixelColor(x, y) >>> 0;
    const r = (hex >> 24) & 0xff;
    const g = (hex >> 16) & 0xff;
    const b = (hex >> 8) & 0xff;

    // 压暗计算
    const newR = Math.round(r + (r / 255) * img2_change);
    const newG = Math.round(g + (g / 255) * img2_change);
    const newB = Math.round(b + (b / 255) * img2_change);

    // 边界兜底
    const clamp = (v) => Math.max(0, Math.min(255, v));
    const newHex =
      (clamp(newR) << 24) | (clamp(newG) << 16) | (clamp(newB) << 8) | 255;
    output2.setPixelColor(newHex >>> 0, x, y);
  });

  return { output1, output2 };
}

/**
 * 终极兼容版：复刻网页MirageTank合成逻辑（优化尺寸适配，避免拉伸）
 * @param {object} img1 表图（色阶后）
 * @param {object} img2 里图（色阶后）
 * @returns {object} 合成后的Jimp实例
 */
async function mirageTankLikeWeb(img1, img2) {
  // 网页逻辑：统一尺寸到img2的宽高
  const targetW = img2.bitmap.width;
  const targetH = img2.bitmap.height;

  // 步骤1：将img1保存为临时文件
  const tempImg1Path = path.join(TEMP_DIR, `temp_img1_${uuidv4()}.png`);
  await img1.write(tempImg1Path);

  // 步骤2：等比例裁剪适配里图尺寸（返回新路径，核心修复）
  const croppedImgPath = await resizeAndCropImage(
    tempImg1Path,
    targetW,
    targetH,
  );

  // 步骤3：读取裁剪后的图片
  const croppedImg1 = await Jimp.read(croppedImgPath);

  // 核心修复：用Bitmap创建画布（所有Jimp版本都支持）
  const outputBitmap = {
    data: Buffer.alloc(targetW * targetH * 4, 0), // 初始化透明黑色
    width: targetW,
    height: targetH,
  };
  const outputImg = Jimp.fromBitmap(outputBitmap);

  // 网页核心合成公式
  outputImg.scan(0, 0, targetW, targetH, (x, y) => {
    // 获取裁剪后的表图像素
    const hex1 = croppedImg1.getPixelColor(x, y) >>> 0;
    const r1 = (hex1 >> 24) & 0xff;
    const g1 = (hex1 >> 16) & 0xff;
    const b1 = (hex1 >> 8) & 0xff;
    const avg1 = (r1 + g1 + b1) / 3;

    // 获取里图像素
    const hex2 = img2.getPixelColor(x, y) >>> 0;
    const r2 = (hex2 >> 24) & 0xff;
    const g2 = (hex2 >> 16) & 0xff;
    const b2 = (hex2 >> 8) & 0xff;
    const avg2 = (r2 + g2 + b2) / 3;

    // 网页核心Alpha计算（关键：和之前的公式相反）
    let a3 = avg2 - avg1 + 255;
    if (a3 === 0) a3 = 0.0001; // 避免除零

    // 网页RGB计算：R3 = R2 * 255 / A3
    const r3 = Math.round((r2 * 255) / a3);
    const g3 = Math.round((g2 * 255) / a3);
    const b3 = Math.round((b2 * 255) / a3);

    // 边界兜底
    const clamp = (v) => Math.max(0, Math.min(255, v));
    const finalA = clamp(Math.round(a3));
    const finalHex =
      (clamp(r3) << 24) | (clamp(g3) << 16) | (clamp(b3) << 8) | finalA;
    outputImg.setPixelColor(finalHex >>> 0, x, y);
  });

  // 清理裁剪过程中的临时文件
  const tempFilesToClean = [tempImg1Path, croppedImgPath];
  for (const file of tempFilesToClean) {
    if (fileExists(file)) {
      try {
        fs.unlinkSync(file);
        console.log(`✅ 清理裁剪临时文件：${file}`);
      } catch (error) {
        console.warn(`⚠️  清理裁剪临时文件失败：${file} → ${error.message}`);
      }
    }
  }

  return outputImg;
}

// ===================== 图片预处理：优化格式兼容 =====================
async function preprocessImage(inputPath, outputPath, maxDim = 800) {
  try {
    // 先检查输入文件是否存在
    if (!fileExists(inputPath)) {
      throw new Error(`预处理文件不存在：${inputPath}`);
    }

    await sharp(inputPath)
      .resize({
        width: maxDim,
        height: maxDim,
        fit: "inside",
        withoutEnlargement: true,
        kernel: sharp.kernel.cubic,
      })
      .png({ compressionLevel: 1 })
      .toFile(outputPath);

    const stats = await sharp(outputPath).metadata();
    console.log(`预处理完成：${inputPath} → ${stats.width}×${stats.height}`);
    return outputPath;
  } catch (error) {
    console.error("预处理失败：", error);
    throw error;
  }
}

// ===================== 主函数：完整流程（优化尺寸+强化清理） =====================
/**
 * 完整复刻网页的幻影坦克生成流程（支持本地/网络图片，优化尺寸适配）
 * @param {string} surfacePathOrUrl 表图路径/URL（亮背景显示）
 * @param {string} innerPathOrUrl 里图路径/URL（暗背景显示）
 * @param {string} outputPath 输出路径
 */
async function createMirageTankWebVersion(
  surfacePathOrUrl = "./3.jpg",
  innerPathOrUrl = "./4.jpg",
  outputPath = "./mirage_tank_web.png",
) {
  // 初始化临时文件列表
  const tempFiles = [];
  let surfaceSource = null;
  let innerSource = null;
  let tempSurface = null;
  let tempInner = null;

  try {
    // 确保临时目录存在
    ensureDirExists(TEMP_DIR);

    // 步骤1：处理图片源（网络URL下载，本地路径转换为PNG）
    surfaceSource = await processImageSource(surfacePathOrUrl);
    innerSource = await processImageSource(innerPathOrUrl);
    tempFiles.push(surfaceSource.filePath, innerSource.filePath);

    // 步骤2：压缩图片（仅调整尺寸，不修改颜色）
    tempSurface = path.join(TEMP_DIR, `temp_surface_${uuidv4()}.png`);
    tempInner = path.join(TEMP_DIR, `temp_inner_${uuidv4()}.png`);
    tempFiles.push(tempSurface, tempInner);

    await Promise.all([
      preprocessImage(surfaceSource.filePath, tempSurface),
      preprocessImage(innerSource.filePath, tempInner),
    ]);

    // 步骤3：读取图片（Jimp）
    const [img1, img2] = await Promise.all([
      Jimp.read(tempSurface),
      Jimp.read(tempInner),
    ]);
    console.log("✅ 读取图片完成");

    // 步骤4：去色（复刻网页Desaturate）
    const quse1 = desaturateLikeWeb(img1);
    const quse2 = desaturateLikeWeb(img2);
    console.log("✅ 去色完成（匹配网页算法）");

    // 步骤5：色阶调整（复刻网页Levels）
    const { output1: sejie1, output2: sejie2 } = levelsLikeWeb(quse1, quse2);
    console.log("✅ 色阶调整完成（匹配网页算法）");

    // 步骤6：合成幻影坦克（优化尺寸适配）
    const finalImg = await mirageTankLikeWeb(sejie1, sejie2);
    console.log("✅ 合成完成（匹配网页算法）");

    // 步骤7：保存结果（PNG格式，确保效果）
    await finalImg.write(outputPath);
    console.log(`✅ 最终生成成功！文件路径：${outputPath}`);

    // 验证信息
    console.log("\n📊 生成验证：");
    console.log(`- 表图原始尺寸：${img1.bitmap.width}×${img1.bitmap.height}`);
    console.log(`- 里图尺寸：${img2.bitmap.width}×${img2.bitmap.height}`);
    console.log(
      `- 输出尺寸：${finalImg.bitmap.width}×${finalImg.bitmap.height}`,
    );
    console.log(`- 格式：PNG（必须保存为PNG格式才有效）`);

    // 生成成功后彻底清理缓存
    await cleanTempDir();

    return outputPath;
  } catch (error) {
    console.error("❌ 生成失败：", error);
    throw error;
  } finally {
    // 基础清理：删除临时文件列表中的文件
    console.log("\n🗑️  开始清理临时文件...");
    for (const file of tempFiles) {
      if (file && fileExists(file)) {
        try {
          fs.unlinkSync(file);
          console.log(`✅ 清理临时文件：${file}`);
        } catch (error) {
          console.warn(`⚠️  清理临时文件失败：${file} → ${error.message}`);
        }
      } else if (file) {
        console.log(`ℹ️  临时文件不存在，无需清理：${file}`);
      }
    }
  }
}

// 导出函数
export default createMirageTankWebVersion;
