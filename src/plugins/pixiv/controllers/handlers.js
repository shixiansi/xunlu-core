import { segment } from "../../../Bot/segment.js"
import fetch from "node-fetch"
import lodash from "lodash"
import huanyin from "../model/phantomtank.js"
import Downloader from "../../../utils/download.js"
import env from "../../../lib/env.js"
import Filemage from "../../../utils/Filemage.js"
const savePath = env.RootPath + "/src/plugins/pixiv/temp/"
const downloader = new Downloader(savePath)
const fileMage = new Filemage(env.RootPath + "/src/plugins/pixiv")
fileMage.CreatDir("/temp")
// 配置项：设置最大重试次数，避免无限递归
const MAX_RETRY_COUNT = 3 // 最多重试3次，可根据需求调整

/**
 * 公共工具函数：校验图片链接是否有效（是否404等错误）
 * @param {string} imgUrl 待校验的图片链接
 * @returns {boolean} 图片链接是否有效（200-299状态码为有效）
 */
async function isImgUrlValid(imgUrl) {
  try {
    if (!imgUrl) return false
    // 使用HEAD请求，仅获取响应头，不下载图片内容，更高效
    const response = await fetch(imgUrl, { method: "HEAD", timeout: 5000 })
    // 2xx状态码表示请求成功，图片链接有效
    return response.ok
  } catch (error) {
    // 网络错误、超时等均视为链接无效
    console.log(`[图片校验失败] 链接：${imgUrl}，错误：${error.message}`)
    return false
  }
}

/**
 * 公共工具函数：处理图片链接替换（统一替换域名，适配可访问地址）
 * @param {object} pic 接口返回的图片数据对象
 * @returns {string} 处理后的图片链接
 */
function processImgUrl(pic) {
  if (!pic || !pic.urls) return ""
  // 优先使用原图链接，无原图则处理large链接
  return (
    pic.urls.original?.replace("pximg.net", "pixiv.re") ||
    pic.urls.large
      .replace("pximg.net", "pixiv.re")
      .replace("c/600x1200_90/img-master", "img-original")
      .replace("_master1200", "")
  )
}

/**
 * 公共工具函数：处理色图图片链接替换（适配色图接口域名）
 * @param {object} pic 色图接口返回的图片数据对象
 * @returns {string} 处理后的图片链接
 */
function processSetuImgUrl(pic) {
  if (!pic || !pic.urls) return ""
  return (
    pic.urls.original?.replace("i.pximg.net", "i.pixiv.re") ||
    pic.urls.large
      .replace("i.pximg.net", "i.pixiv.re")
      .replace("c/600x1200_90/img-master", "img-original")
      .replace("_master1200", "")
  )
}

/**
 * 获取有效Pixiv随机图（带图片校验和重试）
 * @param {number} retryCount 当前重试次数（默认0，内部递归使用）
 * @returns {object|null} 有效图片数据对象，重试耗尽返回null
 */
async function getValidPixivPic(retryCount = 0) {
  // 超过最大重试次数，终止递归
  if (retryCount >= MAX_RETRY_COUNT) {
    console.log(`[获取Pixiv随机图] 已耗尽最大重试次数（${MAX_RETRY_COUNT}次），获取失败`)
    return null
  }

  try {
    // 原逻辑获取图片数据
    const picData = await (
      await fetch(
        `https://shithink.xyz/api/pixivRandombg?mode=${lodash.random(1, 2) === 1 ? "pc" : "app"}`,
      )
    ).json()

    const { data: pic } = picData
    if (!pic) throw new Error("接口返回无图片数据")

    // 处理图片链接
    const imgUrl = processImgUrl(pic)
    console.log(imgUrl)

    if (!imgUrl) throw new Error("无法提取有效图片链接")

    // 校验图片链接是否有效
    const isImgValid = await isImgUrlValid(imgUrl)
    if (isImgValid) {
      // 图片有效，返回图片数据
      return pic
    } else {
      console.log(
        `[获取Pixiv随机图] 图片链接无效（404或其他错误），正在进行第${retryCount + 1}次重试`,
      )
      // 图片无效，递归重试，重试次数+1
      return await getValidPixivPic(retryCount + 1)
    }
  } catch (error) {
    console.log(`[获取Pixiv随机图] 第${retryCount + 1}次请求失败，错误：${error.message}，正在重试`)
    // 接口请求失败，递归重试
    return await getValidPixivPic(retryCount + 1)
  }
}

/**
 * 获取有效色图（带图片校验和重试）
 * @param {string} tag 色图标签
 * @param {number} retryCount 当前重试次数（默认0，内部递归使用）
 * @returns {object|null} 有效色图数据对象，重试耗尽返回null
 */
async function getValidSetuPic(tag, retryCount = 0) {
  // 超过最大重试次数，终止递归
  if (retryCount >= MAX_RETRY_COUNT) {
    console.log(`[获取色图] 标签：${tag}，已耗尽最大重试次数（${MAX_RETRY_COUNT}次），获取失败`)
    return null
  }

  try {
    // 请求色图接口
    const response = await fetch(
      `http://127.0.0.1:2333/api/setu?type=json&tag=${encodeURIComponent(tag)}`,
    )
    console.log(response)

    if (!response.ok) throw new Error(`接口返回错误：HTTP ${response.status}`)

    const setuData = await response.json()
    const { data: pic } = setuData
    if (!pic) throw new Error("接口返回无色图数据")

    // 处理色图图片链接
    const imgUrl = processSetuImgUrl(pic)
    console.log(imgUrl)

    if (!imgUrl) throw new Error("无法提取有效色图链接")

    // 校验图片链接是否有效
    const isImgValid = await isImgUrlValid(imgUrl)
    if (isImgValid) {
      // 图片有效，返回色图数据
      return pic
    } else {
      console.log(`[获取色图] 标签：${tag}，图片链接无效，正在进行第${retryCount + 1}次重试`)
      // 图片无效，递归重试
      return await getValidSetuPic(tag, retryCount + 1)
    }
  } catch (error) {
    console.log(
      `[获取色图] 标签：${tag}，第${retryCount + 1}次请求失败，错误：${error.message}，正在重试`,
    )
    // 接口请求失败，递归重试
    return await getValidSetuPic(tag, retryCount + 1)
  }
}

// 原逻辑：获取Pixiv随机图（保留，兼容原有调用，推荐使用getValidPixivPic）
async function getpixivPic() {
  return await (
    await fetch(
      `https://shithink.xyz/api/pixivRandombg?mode=${lodash.random(1, 2) === 1 ? "pc" : "app"}`,
    )
  ).json()
}

export function register(bot) {
  if (!bot || !bot.registerCommand) return

  // 命令1：随机图（优化后，带图片有效性校验和重试）
  bot.registerCommand(["随机图"], async ctx => {
    // 获取有效图片
    const pic = await getValidPixivPic()
    if (!pic) {
      return await ctx.reply(`😭 抱歉，已尝试${MAX_RETRY_COUNT}次，仍无法获取有效图片，请稍后再试`)
    }

    // 处理图片链接（用于发送）
    const imgUrl = processImgUrl(pic)
    // 发送消息
    const imglist = []

    for (let i = 0; i < pic.pageCount; i++) {
      imglist.push(segment.image(imgUrl.replace("p0", `p${i}`)))
    }
    let res = await ctx.reply(
      await ctx.makeForwardMsg(
        ctx,
        [
          `id：${pic.id} \n画师：${pic.user.name}（${pic.user.id}）\n是否ai：${pic.aiType ? "是" : "否"}\n标题：${pic.title}\n上传时间：${pic.updateTime}\n♥：${pic.bookmarkCount}\n👁：${pic.viewCount}\ntag：${pic.tags}\n原图链接：${imgUrl}`,
          ...imglist,
        ],
        "这就是涩图",
        true,
      ),
      false,
      { recallMsg: 120 },
    )
    console.log(res)
    return res
  })

  // 命令2：来张xx色图（优化后，带图片校验、重试、安全递归）
  bot.registerCommand(["^来张(.*)色图$"], async ctx => {
    if (!ctx.isMaster) return true

    // 修正原逻辑的tag提取瑕疵：原条件永远无法满足，优化标签处理
    let tag = ctx.msg.replace(/^来张(.+)色图$/, "$1").trim()
    // 若提取后为空（直接发送"来张色图"），默认设置为"萝莉"
    if (tag == "来张色图") tag = "萝莉"
    console.log(`[色图请求] 主人请求标签：${tag}`)

    // 获取有效色图
    const pic = await getValidSetuPic(tag)
    if (!pic) {
      return await ctx.reply(
        `😭 抱歉，标签「${tag}」已尝试${MAX_RETRY_COUNT}次，仍无法获取有效色图，请稍后再试或更换标签`,
      )
    }

    // 处理色图图片链接（用于发送和替换分页）
    const imgUrl = processSetuImgUrl(pic)
    // 构建多页图片列表
    let imglist = [segment.image(imgUrl)]
    // for (let i = 0; i < pic.pageCount; i++) {
    //   imglist.push(segment.image(imgUrl.replace("p0", `p${i}`)))
    // }
    // for (let i = 0; i < 1; i++) {
    //   imglist.push({
    //     url: imgUrl.replace("p0", `p${i}`),
    //     type: "image",
    //     savePath: `${pic.id}_p${i}.jpg`,
    //   })
    // }
    // await downloader.batchDownload(imglist, true)
    // imglist = imglist.map(item => segment.image(savePath + item.savePath))
    // 发送合并转发消息（带撤回机制）
    return await ctx.reply(
      await ctx.makeForwardMsg(
        ctx,
        [
          `id：${pic.id} \n画师：${pic.user.name}（${pic.user.id}）\n是否ai：${pic.aiType ? "是" : "否"}\n标题：${pic.title}\n上传时间：${pic.updateTime}\n♥：${pic.bookmarkCount}\n👁：${pic.viewCount}\ntag：${pic.tags}\n原图链接：${imgUrl}`,
          ...imglist,
        ],
        "这就是涩图",
        true,
      ),
      false,
      { recallMsg: 120 },
    )
  })

  console.log("[example-plugin] registered with bot shim")
}

export function onBotEvent(event) {
  console.log("[example-plugin] received bot event:", event)
}
