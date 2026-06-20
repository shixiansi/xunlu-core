import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { segment } from "../../../Bot/message/index.js"
import { ensureDir, getPluginTempPath, removeFileQuietly } from "#utils"
import fetch from "node-fetch"
import lodash from "lodash"

import huanyin from "../model/phantomtank.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const pluginRoot = path.resolve(__dirname, "..")
const tempDir = getPluginTempPath("pixiv", "mirage")
const mirageSurfacePath = path.join(pluginRoot, "model", "3.jpg")

const LOLICON_SETU_API = "https://api.lolicon.app/setu/v2"
const MAX_RETRY_COUNT = 3
const FORWARD_DESC = "这就是涩图"
const RECALL_SECONDS = 120
const MIRAGE_FALLBACK_NOTICE = "原图发送失败使用幻影坦克发送"

const defaultDeps = {
  fetch,
  createMirageTank: huanyin,
  now: () => Date.now(),
  random: (...args) => lodash.random(...args),
  removeFile: removeFileQuietly,
}

const runtimeDeps = { ...defaultDeps }

ensureTempDir()

function ensureTempDir() {
  ensureDir(tempDir)
}

function getLogger() {
  return globalThis.xunluCore?.services?.logger || console
}

function normalizePixivProxyUrl(url = "") {
  return String(url || "")
    .trim()
    .replace(/i\.pximg\.net/g, "i.pixiv.re")
    .replace(/pximg\.net/g, "pixiv.re")
}

async function isImgUrlValid(imgUrl) {
  try {
    if (!imgUrl) return false
    const response = await runtimeDeps.fetch(imgUrl, { method: "HEAD", timeout: 5000 })
    return Boolean(response?.ok)
  } catch (error) {
    console.log(`[图片校验失败] 链接：${imgUrl}，错误：${error.message}`)
    return false
  }
}

function processImgUrl(pic) {
  if (!pic?.urls) return ""
  const originalUrl = normalizePixivProxyUrl(pic.urls.original)
  if (originalUrl) return originalUrl

  const largeUrl = String(pic.urls.large || "")
    .replace(/pximg\.net/g, "pixiv.re")
    .replace("c/600x1200_90/img-master", "img-original")
    .replace("_master1200", "")
  return normalizePixivProxyUrl(largeUrl)
}

function getSetuPreviewUrl(pic) {
  return normalizePixivProxyUrl(pic?.urls?.regular || pic?.urls?.original || "")
}

function getSetuOriginalUrl(pic) {
  return normalizePixivProxyUrl(pic?.urls?.original || pic?.urls?.regular || "")
}

function formatTags(tags) {
  if (Array.isArray(tags)) return tags.join(", ")
  return String(tags || "").trim() || "无"
}

function formatAiType(aiType) {
  const value = Number(aiType)
  if (value === 2) return "是"
  if (value === 1) return "否"
  return "未知"
}

function formatUploadDate(uploadDate) {
  const value = Number(uploadDate)
  if (!Number.isFinite(value) || value <= 0) return String(uploadDate || "未知")
  return new Date(value).toLocaleString("zh-CN", { hour12: false })
}

function buildRandomPixivMetaText(pic, imgUrl) {
  return [
    `id：${pic?.id || "未知"}`,
    `画师：${pic?.user?.name || "未知"}（${pic?.user?.id || "未知"}）`,
    `是否ai：${pic?.aiType ? "是" : "否"}`,
    `标题：${pic?.title || "未知"}`,
    `上传时间：${pic?.updateTime || "未知"}`,
    `♥：${pic?.bookmarkCount ?? "未知"}`,
    `👁：${pic?.viewCount ?? "未知"}`,
    `tag：${formatTags(pic?.tags)}`,
    `原图链接：${imgUrl || "无"}`,
  ].join("\n")
}

function buildSetuMetaText(pic) {
  const originalUrl = getSetuOriginalUrl(pic)
  return [
    `pid/p：${pic?.pid ?? "未知"}/${pic?.p ?? 0}`,
    `画师：${pic?.author || "未知"}（${pic?.uid ?? "未知"}）`,
    `标题：${pic?.title || "未知"}`,
    `R18：${pic?.r18 ? "是" : "否"}`,
    `是否AI：${formatAiType(pic?.aiType)}`,
    `上传时间：${formatUploadDate(pic?.uploadDate)}`,
    `尺寸：${pic?.width ?? "未知"}×${pic?.height ?? "未知"}`,
    `tag：${formatTags(pic?.tags)}`,
    `原图链接：${originalUrl || "无"}`,
  ].join("\n")
}

function buildRandomPixivImageUrls(pic) {
  const imgUrl = processImgUrl(pic)
  if (!imgUrl) return []

  const pageCount = Math.max(1, Number(pic?.pageCount) || 1)
  const hasPageIndex = /p\d+/.test(imgUrl)
  const urls = []

  if (!hasPageIndex) return [imgUrl]

  for (let i = 0; i < pageCount; i += 1) {
    urls.push(imgUrl.replace(/p\d+/, `p${i}`))
  }
  return urls
}

async function getValidPixivPic(retryCount = 0) {
  if (retryCount >= MAX_RETRY_COUNT) {
    console.log(`[获取Pixiv随机图] 已耗尽最大重试次数（${MAX_RETRY_COUNT}次），获取失败`)
    return null
  }

  try {
    const response = await runtimeDeps.fetch(
      `https://shipixiv.de5.net/api/pixivRandombg?mode=${runtimeDeps.random(1, 2) === 1 ? "pc" : "app"}`,
    )
    if (!response?.ok) throw new Error(`接口返回错误：HTTP ${response?.status ?? "unknown"}`)

    const picData = await response.json()
    const pic = picData?.data
    if (!pic) throw new Error("接口返回无图片数据")

    const imgUrl = processImgUrl(pic)
    if (!imgUrl) throw new Error("无法提取有效图片链接")

    if (await isImgUrlValid(imgUrl)) return pic

    console.log(`[获取Pixiv随机图] 图片链接无效，正在进行第${retryCount + 1}次重试`)
    return await getValidPixivPic(retryCount + 1)
  } catch (error) {
    console.log(`[获取Pixiv随机图] 第${retryCount + 1}次请求失败，错误：${error.message}，正在重试`)
    return await getValidPixivPic(retryCount + 1)
  }
}

async function requestSetuFromLolicon(tag) {
  const response = await runtimeDeps.fetch(LOLICON_SETU_API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      r18: 2,
      num: 1,
      tag: [tag],
      size: ["regular", "original"],
      excludeAI: false,
    }),
  })

  if (!response?.ok) {
    throw new Error(`接口返回错误：HTTP ${response?.status ?? "unknown"}`)
  }

  return await response.json()
}

async function getValidSetuPic(tag, retryCount = 0) {
  if (retryCount >= MAX_RETRY_COUNT) {
    console.log(`[获取色图] 标签：${tag}，已耗尽最大重试次数（${MAX_RETRY_COUNT}次），获取失败`)
    return null
  }

  try {
    const setuData = await requestSetuFromLolicon(tag)
    if (setuData?.error) throw new Error(setuData.error)

    const pic = Array.isArray(setuData?.data) ? setuData.data[0] : null
    if (!pic) throw new Error("接口返回无色图数据")

    const imgUrl = getSetuPreviewUrl(pic)
    if (!imgUrl) throw new Error("无法提取有效色图链接")

    if (await isImgUrlValid(imgUrl)) return pic

    console.log(`[获取色图] 标签：${tag}，图片链接无效，正在进行第${retryCount + 1}次重试`)
    return await getValidSetuPic(tag, retryCount + 1)
  } catch (error) {
    console.log(
      `[获取色图] 标签：${tag}，第${retryCount + 1}次请求失败，错误：${error.message}，正在重试`,
    )
    return await getValidSetuPic(tag, retryCount + 1)
  }
}

async function sendGroupForward(ctx, msgList, desc = FORWARD_DESC) {
  const forwardPayload = await ctx.makeGroupForwardMsg(ctx, msgList, desc, true)
  const replyResult = await ctx.reply(forwardPayload, false, { recallMsg: RECALL_SECONDS })
  if (!replyResult) {
    throw new Error("[pixiv] group forward send returned empty result")
  }
  return replyResult
}

function buildForwardFailureText(title, imageUrls = []) {
  const links = imageUrls
    .filter(Boolean)
    .map((url, index) => `${index + 1}. ${url}`)
    .join("\n")

  if (!links) {
    return `😭 ${title}转发发送失败，请稍后再试`
  }

  return `😭 ${title}转发发送失败，请直接使用以下链接查看：\n${links}`
}

function getReplyResultMeta(replyResult) {
  if (!replyResult || typeof replyResult !== "object") {
    return { messageId: "", messageSeq: undefined }
  }

  const rawMessageId =
    replyResult.message_id ??
    replyResult.messageId ??
    replyResult.seq ??
    replyResult.message_seq ??
    replyResult?.data?.message_id ??
    replyResult?.data?.messageId ??
    replyResult?.data?.message_seq

  const messageId =
    rawMessageId !== undefined && rawMessageId !== null ? String(rawMessageId).trim() : ""
  const rawMessageSeq = replyResult.seq ?? replyResult.message_seq ?? replyResult?.data?.message_seq
  const messageSeq = Number(rawMessageSeq)

  return {
    messageId,
    messageSeq: Number.isFinite(messageSeq) && messageSeq > 0 ? messageSeq : undefined,
  }
}

async function recallNoticeMessage(ctx, replyResult) {
  const { messageId, messageSeq } = getReplyResultMeta(replyResult)
  if (!messageId && messageSeq === undefined) return false

  try {
    if (typeof ctx?.recallMessage === "function") {
      await ctx.recallMessage({
        peer_id: ctx?.peer_id ?? ctx?.group_id ?? ctx?.user_id,
        message_seq: messageSeq,
        message_id: messageId || messageSeq,
        isGroup: Boolean(ctx?.group_id || ctx?.message_scene === "group"),
      })
      return true
    }

    if (ctx?.group_id && typeof ctx?.group?.recallMsg === "function") {
      await ctx.group.recallMsg(messageId || messageSeq)
      return true
    }

    if (!ctx?.group_id && typeof ctx?.friend?.recallMsg === "function") {
      await ctx.friend.recallMsg(messageId || messageSeq)
      return true
    }
  } catch (error) {
    getLogger().warn?.(`[pixiv] 撤回幻影坦克提示失败：${error?.message || error}`)
  }

  return false
}

function createImageSegmentFromLocalFile(filePath) {
  try {
    return segment.image(fs.readFileSync(filePath), path.basename(filePath))
  } catch {
    return segment.image(filePath)
  }
}

async function buildMirageFallbackNodes(imageUrls = []) {
  ensureTempDir()
  const msgList = []
  const cleanupPaths = []

  for (let i = 0; i < imageUrls.length; i += 1) {
    const originalUrl = String(imageUrls[i] || "").trim()
    if (!originalUrl) {
      msgList.push(`第${i + 1}张图片为空，无法生成幻影坦克`)
      continue
    }

    const outputPath = path.join(
      tempDir,
      `mirage_${runtimeDeps.now()}_${i}_${Math.random().toString(36).slice(2, 8)}.png`,
    )
    cleanupPaths.push(outputPath)

    try {
      const generatedPath =
        (await runtimeDeps.createMirageTank(mirageSurfacePath, originalUrl, outputPath)) || outputPath
      if (generatedPath !== outputPath) cleanupPaths.push(generatedPath)
      msgList.push(createImageSegmentFromLocalFile(generatedPath))
    } catch (error) {
      getLogger().warn?.(
        `[pixiv] 第${i + 1}张图片生成幻影坦克失败：${error?.message || error}`,
      )
      msgList.push(`第${i + 1}张图片的幻影坦克生成失败，原图链接：${originalUrl}`)
    }
  }

  return { msgList, cleanupPaths }
}

function cleanupTempFiles(filePaths = []) {
  for (const filePath of filePaths) {
    if (!filePath) continue
    runtimeDeps.removeFile(filePath)
  }
}

async function sendForwardWithMirageFallback(
  ctx,
  {
    metaText,
    imageUrls = [],
    desc = FORWARD_DESC,
    failureTitle = "涩图",
    fallbackNoticeText = "",
  } = {},
) {
  const originForward = [metaText, ...imageUrls.map(url => segment.image(url))]

  try {
    return await sendGroupForward(ctx, originForward, desc)
  } catch (error) {
    getLogger().warn?.(`[pixiv] 原始转发发送失败，改走幻影坦克兜底：${error?.message || error}`)
  }

  let cleanupPaths = []
  let fallbackNoticeReply = null
  if (fallbackNoticeText) {
    try {
      fallbackNoticeReply = await ctx.reply(fallbackNoticeText)
    } catch (error) {
      getLogger().warn?.(`[pixiv] 幻影坦克提示发送失败：${error?.message || error}`)
    }
  }

  try {
    const fallback = await buildMirageFallbackNodes(imageUrls)
    cleanupPaths = fallback.cleanupPaths
    return await sendGroupForward(ctx, [metaText, ...fallback.msgList], desc)
  } catch (error) {
    getLogger().warn?.(`[pixiv] 幻影坦克兜底发送失败：${error?.message || error}`)
    return await ctx.reply(buildForwardFailureText(failureTitle, imageUrls))
  } finally {
    cleanupTempFiles(cleanupPaths)
    await recallNoticeMessage(ctx, fallbackNoticeReply)
  }
}

function getRequestedSetuTag(message = "") {
  const match = /^来张(.*)色图$/.exec(String(message || "").trim())
  const tag = match?.[1]?.trim()
  return tag || "萝莉"
}

async function handleRandomPixiv(ctx) {
  const pic = await getValidPixivPic()
  if (!pic) {
    return await ctx.reply(`😭 抱歉，已尝试${MAX_RETRY_COUNT}次，仍无法获取有效图片，请稍后再试`)
  }

  const imgUrl = processImgUrl(pic)
  const imageUrls = buildRandomPixivImageUrls(pic)
  return await sendForwardWithMirageFallback(ctx, {
    metaText: buildRandomPixivMetaText(pic, imgUrl),
    imageUrls,
    failureTitle: "随机图",
  })
}

async function handleSetuRequest(ctx) {
  if (!ctx.isMaster) return true

  const tag = getRequestedSetuTag(ctx.msg)
  console.log(`[色图请求] 主人请求标签：${tag}`)

  const pic = await getValidSetuPic(tag)
  if (!pic) {
    return await ctx.reply(
      `😭 抱歉，标签「${tag}」已尝试${MAX_RETRY_COUNT}次，仍无法获取有效色图，请稍后再试或更换标签`,
    )
  }

  const previewUrl = getSetuPreviewUrl(pic)
  return await sendForwardWithMirageFallback(ctx, {
    metaText: buildSetuMetaText(pic),
    imageUrls: previewUrl ? [previewUrl] : [],
    failureTitle: `标签「${tag}」色图`,
    fallbackNoticeText: MIRAGE_FALLBACK_NOTICE,
  })
}

export function register(bot) {
  if (!bot || !bot.registerCommand) return

  bot.registerCommand(["随机图"], async ctx => await handleRandomPixiv(ctx))
  bot.registerCommand(["^来张(.*)色图$"], async ctx => await handleSetuRequest(ctx))

  console.log("[pixiv] registered with bot shim")
}

export function onBotEvent(event) {
  console.log("[pixiv] received bot event:", event)
}

export const __test = {
  MAX_RETRY_COUNT,
  LOLICON_SETU_API,
  mirageSurfacePath,
  tempDir,
  MIRAGE_FALLBACK_NOTICE,
  getRequestedSetuTag,
  getValidPixivPic,
  getValidSetuPic,
  buildSetuMetaText,
  buildRandomPixivMetaText,
  async handleRandomPixiv(ctx) {
    return await handleRandomPixiv(ctx)
  },
  async handleSetuRequest(ctx) {
    return await handleSetuRequest(ctx)
  },
  async sendForwardWithMirageFallback(ctx, payload) {
    return await sendForwardWithMirageFallback(ctx, payload)
  },
  setDeps(patches = {}) {
    Object.assign(runtimeDeps, patches)
  },
  resetDeps() {
    for (const key of Object.keys(runtimeDeps)) {
      delete runtimeDeps[key]
    }
    Object.assign(runtimeDeps, defaultDeps)
  },
}
