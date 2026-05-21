import fs from "node:fs"

import { segment } from "../../../Bot/message/index.js"
import Blogin from "../model/Blogin.js"
import Bili from "../model/Bilili.js"
import lodash from "lodash"
import Filemage from "../../../utils/Filemage.js"
import moment from "moment"
import Download from "../../../utils/download.js"
import ffmpeg from "../../../component/ffmpeg/ffmpeg.js"
import { isDuplicateParseRequest } from "../../shared/parse-dedupe.js"
import { scheduleTempFileCleanup } from "../../shared/temp-file-cleanup.js"
import { createBilibiliCachePaths } from "../services/cache-paths.js"
import { makeDynamicImageForward } from "../services/dynamic-forward.js"
import {
  extractBilibiliUrl,
  extractBvId,
  extractFirstUrlFromText,
  extractLiveRoomId,
  isBilibiliLiveUrl,
  isBilibiliVideoUrl,
} from "../services/url-parser.js"
import {
  BILIBILI_VIDEO_MAX_RESULT_BYTES,
  BILIBILI_VIDEO_MAX_SOURCE_BYTES,
  createVideoTooLargeError,
  formatBytes,
  formatVideoQuality,
  normalizeVideoSizeError,
  pickEstimatedSendableStream,
} from "../services/video-planner.js"

const filemage = new Filemage()
const download = new Download()
const bilibiliCachePaths = createBilibiliCachePaths(filemage.RootPath)
const GROUP_DATA_DIR = bilibiliCachePaths.groupDataDir
const BILIBILI_VIDEO_DIR = bilibiliCachePaths.videoDir
const BILIBILI_BG_DIR = bilibiliCachePaths.backgroundDir

const dynamicType = {
  live: "直播",
  text: "文字",
  draw: "图文",
  av: "视频",
  forward: "转发",
  article: "专栏",
  raffle: "抽奖",
}
const dynamicTypeKeys = Object.keys(dynamicType)
const BILIBILI_LIVE_CLIP_DURATION_SEC = 10
const BILIBILI_LIVE_CLIP_MAX_RESULT_BYTES = 45 * 1024 * 1024

function computew(num) {
  const value = Number(num || 0)
  return value >= 10000 ? `${(value / 10000).toFixed(1)}w` : value
}

async function composeVideoFile(videoPath, audioPath, resultPath) {
  return await new Promise((resolve, reject) => {
    ffmpeg.VideoComposite(
      videoPath,
      audioPath,
      resultPath,
      async () => resolve(resultPath),
      async () => reject(new Error("视频合成失败")),
    )
  })
}

function cleanupTempFiles(paths = [], label = "cache") {
  scheduleTempFileCleanup(paths, { label: "bilibili " + label })
}

function isMilkyRuntime(baseBot, ctx) {
  const protocol = String(
    ctx?.protocol ??
      baseBot?.adapter ??
      globalThis.Bot?.adapterType ??
      globalThis.Bot?.protocol ??
      "",
  )
    .trim()
    .toLowerCase()
  return protocol === "milky"
}

function getSegmentImageSource(segmentLike) {
  if (!segmentLike || typeof segmentLike !== "object") return ""
  return String(
    segmentLike?.data?.url ??
      segmentLike?.url ??
      segmentLike?.data?.path ??
      segmentLike?.path ??
      segmentLike?.data?.file ??
      segmentLike?.file ??
      segmentLike?.data?.fileId ??
      segmentLike?.fileId ??
      "",
  ).trim()
}

function normalizeTypeList(types = []) {
  const list = Array.isArray(types) ? types : [types]
  return [...new Set(list.map(type => String(type || "").trim()).filter(type => dynamicType[type]))]
}

function normalizeSubscriptionData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null

  const normalized = { ...data }
  const subscribedTypes = normalizeTypeList(normalized.dynamicType)
  const blockedTypes = normalizeTypeList(normalized.unpush)
  const filteredBlockedTypes = subscribedTypes.length
    ? blockedTypes.filter(type => !subscribedTypes.includes(type))
    : blockedTypes

  if (subscribedTypes.length > 0) normalized.dynamicType = subscribedTypes
  else delete normalized.dynamicType

  if (filteredBlockedTypes.length > 0) normalized.unpush = filteredBlockedTypes
  else delete normalized.unpush

  if (!normalized.live || typeof normalized.live !== "object" || Array.isArray(normalized.live)) {
    delete normalized.live
  }

  return normalized
}

function getDynamicTypeKey(label = "") {
  return Object.entries(dynamicType).find(([, value]) => value === label)?.[0] || ""
}

function formatLiveStatus(status) {
  return Number(status) === 1 ? "直播中" : "未开播"
}

function pickLiveStream(playInfo = {}) {
  const streams = Array.isArray(playInfo?.streams) ? playInfo.streams : []
  if (streams.length === 0) return null

  const formatPriority = { ts: 3, fmp4: 2, flv: 1 }
  const protocolPriority = { http_hls: 3, http_stream: 2 }

  return [...streams].sort((a, b) => {
    const protocolDiff =
      Number(protocolPriority[b?.protocolName] || 0) - Number(protocolPriority[a?.protocolName] || 0)
    if (protocolDiff !== 0) return protocolDiff

    const formatDiff =
      Number(formatPriority[b?.formatName] || 0) - Number(formatPriority[a?.formatName] || 0)
    if (formatDiff !== 0) return formatDiff

    const httpsDiff = Number(/^https:\/\//i.test(b?.url || "")) - Number(/^https:\/\//i.test(a?.url || ""))
    if (httpsDiff !== 0) return httpsDiff

    return Number(b?.qn || 0) - Number(a?.qn || 0)
  })[0]
}

function pickRandomBilibiliBackground() {
  try {
    const bglist = filemage.GetfileList(BILIBILI_BG_DIR)
    if (!Array.isArray(bglist) || bglist.length === 0) return ""
    return bglist[lodash.random(0, bglist.length - 1)]
  } catch {
    return ""
  }
}

function stripDynamicHtml(text = "") {
  return String(text || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function buildDynamicFallbackMessage(result = {}) {
  const authorName = result?.author?.nickname || result?.nickname || "UP主"
  const title =
    stripDynamicHtml(result?.video?.title || result?.liveInfo?.title || result?.article?.title) ||
    ""
  const content = stripDynamicHtml(result?.text || "")
  const link = result?.video?.url || result?.liveInfo?.liveurl || result?.erm || ""
  const lines = [`${authorName}发布了新的${result?.type || ""}动态`]
  const message = []

  if (result?.author?.img || result?.img) {
    message.push(segment.image(result.author?.img || result.img))
  }
  if (title) lines.push(`标题：${title}`)
  if (content && content !== title) lines.push(content.slice(0, 500))
  if (result?.date) lines.push(`时间：${result.date}`)
  if (link) lines.push(`链接：${link}`)

  message.push(lines.join("\n"))
  return message
}

function buildBilibiliCardFallback(card = {}) {
  const lines = []
  const cardTypeLabel = card?.cardType === "live" ? "直播解析" : "视频解析"
  lines.push(`B站${cardTypeLabel}`)
  lines.push(`作者：${card?.nickname || "B站用户"}`)
  if (card?.title) lines.push(`标题：${card.title}`)
  if (card?.desc) lines.push(`简介：${card.desc}`)
  if (card?.statText) lines.push(`数据：${card.statText}`)
  if (card?.publishedAt) lines.push(`时间：${card.publishedAt}`)
  if (card?.link) lines.push(`链接：${card.link}`)

  const message = []
  if (card?.cover) message.push(segment.image(card.cover))
  message.push(lines.join("\n"))
  return message
}

async function renderBilibiliCard(renderer, card = {}) {
  if (renderer && typeof renderer.renderImg === "function") {
    try {
      const rendered = await renderer.renderImg(
        "bilibili",
        {
          nickname: String(card?.nickname || "B站用户").trim() || "B站用户",
          avatar: card?.avatar || card?.cover || "",
          publishedAt: card?.publishedAt || "",
          nowText: new Date().toISOString().replace("T", " ").slice(0, 19),
          title: card?.title || "",
          desc: card?.desc || "",
          cover: card?.cover || card?.avatar || "",
          cardType: card?.cardType === "live" ? "live" : "video",
          statText: card?.statText || "",
          link: card?.link || "",
          saveId: `bilibili_${card?.saveId || Date.now()}`,
        },
        {
          tpl: "card",
        },
      )
      if (rendered) return rendered
    } catch (err) {
      logger.warn?.(`[Bilibili] 卡片渲染失败，改用文本降级：${err?.message || err}`)
    }
  }

  return buildBilibiliCardFallback(card)
}

async function sendBilibiliLiveClip(ctx, roomInfo = {}) {
  if (Number(roomInfo?.live_status) !== 1) return null

  const playInfo = await Bili.getLivePlayInfo(roomInfo.room_id)
  if (playInfo?.code) {
    throw new Error(playInfo.message || "获取直播流失败")
  }

  const selectedStream = pickLiveStream(playInfo)
  if (!selectedStream?.url) {
    throw new Error("未找到可用的直播流")
  }

  const clipPath = bilibiliCachePaths.getLiveClipPath(roomInfo.room_id)
  try {
    await ffmpeg.saveVideoClip(selectedStream.url, clipPath, {
      durationSec: BILIBILI_LIVE_CLIP_DURATION_SEC,
    })

    const clipSize = fs.statSync(clipPath).size
    if (clipSize > BILIBILI_LIVE_CLIP_MAX_RESULT_BYTES) {
      throw createVideoTooLargeError("live_clip", clipSize, BILIBILI_LIVE_CLIP_MAX_RESULT_BYTES)
    }

    return await ctx.reply(segment.video(clipPath))
  } finally {
    cleanupTempFiles([clipPath], "直播切片")
  }
}

async function renderDynamicMessage(renderer, result = {}) {
  if (renderer && typeof renderer.renderImg === "function") {
    try {
      const rendered = await renderer.renderImg("bilibili", {
        radom: pickRandomBilibiliBackground(),
        ...result,
      })
      if (rendered) return rendered
    } catch (err) {
      logger.warn?.(`[Bilibili] 动态渲染失败，改用文本降级：${err?.message || err}`)
    }
  }

  return buildDynamicFallbackMessage(result)
}

function getBilibiliGroupList() {
  try {
    return filemage.GetfileList(GROUP_DATA_DIR).map(item => item.replace(".json", ""))
  } catch {
    return []
  }
}

async function ensureGroupCommand(ctx) {
  if (ctx?.isGroup && ctx?.group_id) return true
  await ctx.reply("请在群聊中使用该命令！")
  return false
}

async function resolveBiliUserId(keyword) {
  const value = String(keyword || "").trim()
  if (!value) return { mid: "" }
  if (/^\d+$/.test(value)) return { mid: value }

  const data = await Bili.getSearchUser(value)
  if (!data?.mid) return { mid: "", user: null }
  return {
    mid: String(data.mid),
    user: data,
  }
}

async function handleBilibiliLiveUrl(ctx, inputUrl) {
  let url = String(inputUrl || "").trim()
  let roomId = extractLiveRoomId(url)
  if (!roomId) {
    const completeUrl = await Bili.getCompleteUrl(url).catch(() => "")
    url = completeUrl || url
    roomId = extractLiveRoomId(url)
  }
  if (!roomId) {
    return await ctx.reply("未识别到有效的B站直播间链接，请确认链接后再试。")
  }

  const roomInfo = await Bili.getRoomInfo(roomId)
  if (roomInfo?.code && roomInfo?.code != 0) {
    return await ctx.reply(`查询失败！${roomInfo.message}`)
  }

  const authorInfo = await Bili.getUserBaseInfo(roomInfo?.uid).catch(() => null)
  const statParts = [
    `状态 ${formatLiveStatus(roomInfo?.live_status)}`,
    `分区 ${roomInfo?.area_name || "未分区"}`,
    `关注 ${computew(roomInfo?.attention || 0)}`,
    `在线 ${computew(roomInfo?.online || 0)}`,
  ]
  if (roomInfo?.live_time) statParts.push(`开播 ${roomInfo.live_time}`)

  const rendered = await renderBilibiliCard(ctx, {
    nickname: authorInfo?.name || roomInfo?.uid || "未知主播",
    avatar: authorInfo?.face || roomInfo?.user_cover || "",
    publishedAt: roomInfo?.live_time || "",
    title: roomInfo?.title || "暂无标题",
    desc: String(roomInfo?.description || "").trim().slice(0, 160),
    cover: roomInfo?.user_cover || authorInfo?.face || "",
    cardType: "live",
    statText: statParts.join(" | "),
    link: `https://live.bilibili.com/${roomId}`,
    saveId: `live_${roomId}`,
  })
  await ctx.reply(rendered)

  if (Number(roomInfo?.live_status) !== 1) return true

  try {
    await sendBilibiliLiveClip(ctx, roomInfo)
  } catch (err) {
    err = normalizeVideoSizeError(err)
    if (err?.code === "BILIBILI_VIDEO_TOO_LARGE") {
      return await ctx.reply(
        `直播切片过大，已跳过发送。\n大小：${formatBytes(err.actualBytes)}\n限制：${formatBytes(err.limitBytes)}`,
      )
    }
    logger.warn?.(`[Bilibili] 直播切片发送失败：${err?.message || err}`)
    await ctx.reply(`直播间信息解析成功，但10秒视频发送失败：${err?.message || "未知错误"}`)
  }

  return true
}

async function prepareDynamicForwardImages(baseBot, ctx, dynamicId, msgList = []) {
  if (!isMilkyRuntime(baseBot, ctx)) {
    return { msgList, cleanupPaths: [] }
  }

  const prepared = []
  const cleanupPaths = []
  const list = Array.isArray(msgList) ? msgList : [msgList]

  try {
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i]
      const source = getSegmentImageSource(item)
      if (!/^https?:\/\//i.test(source)) {
        prepared.push(item)
        continue
      }

      const savePath = bilibiliCachePaths.getDynamicForwardCachePath(dynamicId, i, source)
      await download.downloadFile(source, savePath, {
        headers: {
          referer: "https://www.bilibili.com",
        },
      })

      const fullPath = bilibiliCachePaths.toAbsolutePath(savePath)
      cleanupPaths.push(fullPath)
      prepared.push(segment.image(fullPath))
    }
  } catch (err) {
    cleanupTempFiles(cleanupPaths, "动态图片转发缓存")
    throw err
  }

  return { msgList: prepared, cleanupPaths }
}

function writeBiliData(groupId, uid, data) {
  if (!groupId || !uid) return false

  const gdata = getBiliData(groupId) || {}
  const normalizedData = normalizeSubscriptionData(data)
  if (normalizedData) {
    gdata[uid] = normalizedData
  } else {
    delete gdata[uid]
  }

  filemage.writeFileJsonData(bilibiliCachePaths.getGroupDataFile(groupId), gdata)

  const liveStatus = normalizedData?.live?.live_status
  if (liveStatus !== undefined) {
    logger.debug(
      `[Bilibili] 更新直播状态，群ID：${groupId}，用户ID：${uid}，状态：${liveStatus === 1 ? "直播中" : "下播"}`,
    )
  }

  return true
}

function getUpList(groupId) {
  return Object.keys(getBiliData(groupId) || {})
}

function getBiliData(groupId, uid) {
  if (!groupId) return uid ? null : {}

  let gdata = {}
  try {
    gdata = filemage.getFileDataToJson(bilibiliCachePaths.getGroupDataFile(groupId)) || {}
  } catch (e) {
    filemage.writeFileJsonData(bilibiliCachePaths.getGroupDataFile(groupId), gdata)
    return uid ? null : gdata
  }

  const normalized = Object.fromEntries(
    Object.entries(gdata)
      .map(([key, value]) => [key, normalizeSubscriptionData(value)])
      .filter(([, value]) => value),
  )
  return uid ? normalized[uid] || null : normalized
}

function writeLiveData(groupId, uid, data) {
  const current = getBiliData(groupId, uid)
  if (!current) return false

  return writeBiliData(groupId, uid, {
    ...current,
    live: data && typeof data === "object" ? data : {},
  })
}

export function register(bot) {
  if (!bot || !bot.registerCommand) return

  bot.registerCommand(
    "^#订阅(UP|up|)(直播|文字|图文|视频|转发|抽奖|专栏|)(动态|)(uid:|UID:|)",
    async ctx => {
      if (!(await ensureGroupCommand(ctx))) return true

      let dtype = ctx.msg.match(/直播|文字|图文|视频|转发|抽奖|专栏/g)?.[0] || "全部"
      const midInput = ctx.msg.replace(new RegExp(ctx.reg), "").trim()
      if (!midInput) {
        return ctx.reply("订阅不能为空，请输入用户id或者用户昵称！")
      }

      const { mid } = await resolveBiliUserId(midInput)
      if (!mid) {
        return ctx.reply("没有找到该用户呢！")
      }

      let result = await Bili.getUpdateDynamic(mid)
      const prevData = getBiliData(ctx.group_id, mid) || {}
      if (result?.code && result.code != 0) {
        if (String(result.code) === "-352") {
          return ctx.reply("请先设置b站ck进行订阅！使用“b站扫码”命令进行登录！")
        }
        return ctx.reply(result.message || result.msg)
      }

      const type = getDynamicTypeKey(dtype)
      let data = normalizeSubscriptionData({
        ...prevData,
        nickname: result?.author?.nickname || prevData?.nickname,
        upuid: result?.id || prevData?.upuid || 0,
        uid: mid,
        img: result?.author?.img || prevData?.img,
        pendantImg: result?.author?.pendantImg || prevData?.pendantImg,
      })

      if (String(result?.code) === "0" || !data?.nickname || !data?.img) {
        const authorInfo = await Bili.getUserBaseInfo(mid)
        if (!authorInfo?.code) {
          data = {
            ...data,
            nickname: authorInfo?.name || data?.nickname,
            img: authorInfo?.face || data?.img,
            pendantImg: authorInfo?.pendant?.image || data?.pendantImg,
          }
        }
      }

      if (type) {
        data = {
          ...data,
          dynamicType: [...new Set([...(prevData?.dynamicType || []), type])],
          unpush: normalizeTypeList(prevData?.unpush).filter(item => item !== type),
        }
      } else {
        delete data.dynamicType
        delete data.unpush
      }

      writeBiliData(ctx.group_id, mid, data)

      const replyMsg = []
      if (data?.img) {
        replyMsg.push(segment.image(data.img))
      }
      replyMsg.push(
        `昵称：${data.nickname}\n`,
        !type
          ? `订阅Up主${data.nickname}成功！`
          : `已订阅Up主${data.nickname}的${dynamicType[type]}推送！`,
      )
      return ctx.reply(replyMsg)
    },
  )

  bot.registerCommand(
    "^#取消订阅(UP|up|)(直播|文字|图文|视频|转发|抽奖|专栏|)(动态|)(uid:|UID:|)",
    async ctx => {
      if (!(await ensureGroupCommand(ctx))) return true

      let dtype = ctx.msg.match(/直播|文字|图文|视频|转发|抽奖|专栏/g)?.[0]
      const midInput = ctx.msg.replace(new RegExp(ctx.reg), "").trim()
      if (!midInput) {
        return ctx.reply("请输入B站用户id或者用户昵称！")
      }

      const { mid } = await resolveBiliUserId(midInput)
      if (!mid) {
        return ctx.reply("没有找到该用户呢！")
      }

      let updata = getBiliData(ctx.group_id, mid)
      if (!updata || !getUpList(ctx.group_id).includes(mid)) {
        return ctx.reply("暂未订阅该up主！")
      }

      let result = { ...updata }
      const type = getDynamicTypeKey(dtype)
      if (!type) {
        updata = null
      } else {
        const subscribedTypes = normalizeTypeList(updata?.dynamicType)
        const blockedTypes = normalizeTypeList(updata?.unpush)

        if (subscribedTypes.length > 0) {
          if (!subscribedTypes.includes(type)) {
            return ctx.reply(`当前未订阅Up主${result?.nickname}的${dynamicType[type]}推送！`)
          }

          const nextTypes = subscribedTypes.filter(item => item !== type)
          updata =
            nextTypes.length > 0
              ? {
                  ...updata,
                  dynamicType: nextTypes,
                  unpush: blockedTypes.filter(item => item !== type),
                }
              : null
        } else {
          if (blockedTypes.includes(type)) {
            return ctx.reply(`当前已经取消Up主${result?.nickname}的${dynamicType[type]}推送了！`)
          }

          const nextBlockedTypes = [...new Set([...blockedTypes, type])]
          updata =
            nextBlockedTypes.length >= dynamicTypeKeys.length
              ? null
              : {
                  ...updata,
                  unpush: nextBlockedTypes,
                }
        }
      }

      writeBiliData(ctx.group_id, mid, updata)
      return ctx.reply(
        !type
          ? `取消订阅Up主${result?.nickname}成功！`
          : `已取消Up主${result?.nickname}的${dynamicType[type]}推送！`,
      )
    },
  )

  //视频解析
  bot.registerCommand(["", 1200], async ctx => {
    const url = extractBilibiliUrl(ctx)

    if (!url) return false
    if (isBilibiliLiveUrl(url)) {
      if (isDuplicateParseRequest(ctx, url, { parser: "bilibili" })) return true
      return await handleBilibiliLiveUrl(ctx, url)
    }
    if (!isBilibiliVideoUrl(url)) return false
    if (isDuplicateParseRequest(ctx, url, { parser: "bilibili" })) return true

    let bv = extractBvId(url)
    if (!bv) {
      const completeUrl = await Bili.getCompleteUrl(url).catch(() => "")
      if (isBilibiliLiveUrl(completeUrl)) {
        return await handleBilibiliLiveUrl(ctx, completeUrl)
      }
      bv = extractBvId(completeUrl)
    }
    if (!bv) {
      return await ctx.reply("未识别到有效的B站视频链接，请确认链接后再试。")
    }

    let videoInfo = await Bili.getVideoInfo(bv)
    if (videoInfo?.code && videoInfo?.code != 0) {
      return await ctx.reply(`查询失败！${videoInfo.message}`)
    }
    const videoStat = videoInfo?.stat || {}
    const statParts = [
      `播放 ${computew(videoStat.view || 0)}`,
      `弹幕 ${computew(videoStat.danmaku || 0)}`,
      `点赞 ${computew(videoStat.like || 0)}`,
      `投币 ${computew(videoStat.coin || 0)}`,
      `收藏 ${computew(videoStat.favorite || 0)}`,
      `转发 ${computew(videoStat.share || 0)}`,
    ]
    if (videoInfo?.duration) statParts.push(`时长 ${videoInfo.duration}s`)

    const rendered = await renderBilibiliCard(ctx, {
      nickname: videoInfo?.owner?.name || "B站用户",
      avatar: videoInfo?.owner?.face || videoInfo?.pic || "",
      publishedAt: videoInfo?.ctime
        ? moment(Number(videoInfo.ctime) * 1000).format("YYYY-MM-DD HH:mm:ss")
        : "",
      title: videoInfo?.title || "",
      desc: String(videoInfo?.desc || "").trim().slice(0, 180),
      cover: videoInfo?.pic || "",
      cardType: "video",
      statText: statParts.join(" | "),
      link: videoInfo?.bvid ? `https://www.bilibili.com/video/${videoInfo.bvid}` : url,
      saveId: videoInfo?.bvid || bv,
    })
    await ctx.reply(rendered)

    if (videoInfo.duration >= 1800) {
      return await ctx.reply("视频太长了，还是去b站去看吧!")
    }

    const autoQuality = async (duration, currentCtx) => {
      let qn = 80
      if (duration < 120) {
        qn = 120
      } else if (duration >= 120 && duration < 180) {
        qn = 112
      } else if (duration >= 180 && duration < 300) {
        qn = 80
      } else if (duration >= 300 && duration < 480) {
        await currentCtx.reply("视频时长超过5分钟，已将视频画质降低至720p")
        qn = 64
      } else if (duration >= 480 && duration < 720) {
        await currentCtx.reply("视频时长超过8分钟，已将视频画质降低至480p")
        qn = 32
      } else if (duration >= 720) {
        await currentCtx.reply("视频时长超过12分钟，已将视频画质降低至360p")
        qn = 16
      }
      return qn
    }

    const videoLink = videoInfo?.bvid ? `https://www.bilibili.com/video/${videoInfo.bvid}` : url
    const qn = await autoQuality(videoInfo.duration, ctx)
    const qnPlayInfo = await Bili.getQnVideo(qn, bv)
    if (qnPlayInfo?.code) {
      return await ctx.reply(`视频发送失败：${qnPlayInfo.message || "获取视频信息失败"}`)
    }

    const selectedStream = pickEstimatedSendableStream(qnPlayInfo, qn)
    if (!selectedStream?.url) {
      return await ctx.reply("视频发送失败：未找到可用的视频流")
    }
    if (selectedStream.exceedsLimit) {
      logger.warn?.(
        `[Bilibili] 视频预估大小超限，改为发送链接：${selectedStream.estimatedBytes} > ${BILIBILI_VIDEO_MAX_RESULT_BYTES}`,
      )
      return await ctx.reply(
        `视频文件预估过大，已改为发送视频链接。\n标题：${videoInfo.title}\n预估大小：${formatBytes(selectedStream.estimatedBytes)}\n链接：${videoLink}`,
      )
    }
    if (Number(selectedStream.qn) !== Number(qn)) {
      await ctx.reply(
        `根据预估视频大小，已自动将画质调整为 ${formatVideoQuality(selectedStream.qn)}（预估大小：${formatBytes(selectedStream.estimatedBytes)}）`,
      )
    }

    const changeVideo = async (streamPlan, playInfo, currentBv, currentCtx) => {
      const { videoPath, audioPath, resultPath } = bilibiliCachePaths.getVideoCachePaths(currentBv)
      const cleanupPaths = [videoPath, audioPath, resultPath]
      const videoRelativePath = `${BILIBILI_VIDEO_DIR}/source_${currentBv}.mp4`
      const audioRelativePath = `${BILIBILI_VIDEO_DIR}/source_${currentBv}.mp3`

      try {
        const videoUrl = streamPlan?.url
        const audio = playInfo?.audio
        if (!videoUrl || !audio) {
          throw new Error("获取视频下载地址失败")
        }

        const videoOk = await download.downloadFile(
          videoUrl,
          videoRelativePath,
          {
            headers: {
              referer: "https://www.bilibili.com",
            },
            maxBytes: BILIBILI_VIDEO_MAX_SOURCE_BYTES,
          },
        )
        const audioOk = await download.downloadFile(
          audio,
          audioRelativePath,
          {
            headers: {
              referer: "https://www.bilibili.com",
            },
            maxBytes: BILIBILI_VIDEO_MAX_SOURCE_BYTES,
          },
        )
        if (!videoOk || !audioOk) {
          throw new Error("下载视频资源失败")
        }

        await composeVideoFile(videoPath, audioPath, resultPath)
        const resultSize = fs.statSync(resultPath).size
        if (resultSize > BILIBILI_VIDEO_MAX_RESULT_BYTES) {
          throw createVideoTooLargeError("result", resultSize, BILIBILI_VIDEO_MAX_RESULT_BYTES)
        }
        const sendRes = await currentCtx.reply(segment.video(resultPath))
        if (!sendRes) {
          throw new Error("视频发送失败")
        }
        return sendRes
      } finally {
        cleanupTempFiles(cleanupPaths, "视频缓存")
      }
    }

    try {
      await changeVideo(selectedStream, qnPlayInfo, bv, ctx)
    } catch (err) {
      err = normalizeVideoSizeError(err)
      if (err?.code === "BILIBILI_VIDEO_TOO_LARGE") {
        logger.warn?.(`[Bilibili] 视频过大，改为发送链接：${err?.message || err}`)
        const sizeText =
          err?.actualBytes && err?.limitBytes
            ? `\n大小：${formatBytes(err.actualBytes)}，限制：${formatBytes(err.limitBytes)}`
            : ""
        return await ctx.reply(
          `视频文件过大，已改为发送视频链接。\n标题：${videoInfo.title}${sizeText}\n链接：${videoLink}`,
        )
      }
      logger.error?.(`[Bilibili] 视频解析发送失败：${err?.message || err}`)
      return await ctx.reply(`视频发送失败：${err?.message || "未知错误"}`)
    }

    return true
  })

  bot.registerCommand("^(|#)b站扫码$", async ctx => {
    if (!ctx.isMaster) return false
    await Blogin.login()
    await ctx.reply(segment.image(Blogin.qrImagePath), false, { recallMsg: 120 })
    let timer = setInterval(async () => {
      try {
        let result = await Blogin.pollLoginStatus(Bili.getUserInfo.bind(Bili))
        if (result?.code == 200) {
          clearInterval(timer)
          await ctx.reply("登录成功！")
          let uinfo = result.userInfo
          let { name, face, fans, friend, sign, like_num, archive_count, level } =
            await Bili.getUserBaseInfo(uinfo.mid)
          await ctx.reply([
            segment.image(face),
            `昵称：${name}\n粉丝：${fans}\n关注：${friend}\n等级：${level}\n简介：${sign}\n投稿：${archive_count}\n点赞：${like_num}\n`,
          ])
          return
        }

        if (result?.code == 86038) {
          clearInterval(timer)
          await ctx.reply("二维码已过期，请重新发送“b站扫码”获取新的二维码。")
        }
      } catch (err) {
        clearInterval(timer)
        logger.error?.(`[Bilibili] 扫码登录状态检查失败：${err?.message || err}`)
        await ctx.reply("扫码登录状态检查失败，请稍后重试。")
      }
    }, 3000)
  })

  bot.registerCommand(["^#订阅列表$", 1000], async ctx => {
    if (!(await ensureGroupCommand(ctx))) return true

    let updata = getBiliData(ctx.group_id) || {}
    let msg = "订阅列表如下："
    if (Object.keys(updata).length === 0) {
      return await ctx.reply("这个群还没订阅任何up主呢！")
    }
    Object.values(updata).forEach(item => {
      const includeList = normalizeTypeList(item?.dynamicType).map(type => `${dynamicType[type]}√`)
      const excludeList = normalizeTypeList(item?.unpush).map(type => `${dynamicType[type]}X`)
      const typeSummary = [...includeList, ...excludeList]
      msg += `\n昵称：${item.nickname} (${
        typeSummary.length > 0 ? typeSummary.join("、") : "全部"
      })`
    })
    msg += "\n√表示只推送的类型，X代表禁止推送的类型"
    return await ctx.reply(msg)
  })

  bot.registerCommand("^#查询灯牌", async ctx => {
    let card = ctx.msg.replace(new RegExp(ctx.reg), "").trim()
    if (!card) {
      return await ctx.reply("请输入要查询的直播的灯牌！")
    }
    let result
    await ctx.reply("正在查询中，请稍后...")
    try {
      let list = await Bili.getSearchFans(card)
      if (list.length > 0) {
        result = list[0]
      } else {
        throw new Error("没有找到该直播的灯牌！")
      }
    } catch (error) {
      logger.error?.(`[Bilibili] 查询灯牌失败：${error?.message || error}`)
      return await ctx.reply("查询失败！")
    }
    if (result) {
      let authorInfo = await Bili.getUserBaseInfo(result.anchor_uid)
      result = {
        ...result,
        img: authorInfo?.face,
      }
      return await ctx.reply([
        segment.image(result.img),
        `查询的灯牌结果如下：\n昵称：${result.anchor_name}\nuid：${result.anchor_uid}\n直播间：https://live.bilibili.com/${result.room_id}`,
      ])
    } else {
      return await ctx.reply("没有找到该直播的灯牌！")
    }
  })

  bot.registerCommand("#查询up最新动态", async ctx => {
    if (!(await ensureGroupCommand(ctx))) return true

    const midInput = ctx.msg.replace(new RegExp(ctx.reg), "").trim()
    if (!midInput) {
      return await ctx.reply("请输入B站用户id或者用户昵称！")
    }

    const { mid } = await resolveBiliUserId(midInput)
    if (!mid) {
      return await ctx.reply("没有找到该用户呢！")
    }

    let result = await Bili.getFirstDynamic(mid)

    if (result && !result?.code) {
      return await ctx.reply(await renderDynamicMessage(ctx, result))
    } else {
      return await ctx.reply(`查询失败！${result.message}`)
    }
  })

  //直播推送   群名称 属性名是uid
  bot.setTask("0 * * * * *", async ctx => {
    if (!bot || typeof bot.sendMessage !== "function") return

    let glist = getBilibiliGroupList()
    if (glist.length == 0) return
    for (let g of glist) {
      let flist = getBiliData(g) || {}
      for (let [u, entry] of Object.entries(flist)) {
        const item = normalizeSubscriptionData(entry)
        if (!item) continue

        try {
          let result = await Bili.getRoomInfobyMid(u)
          if (!result || result?.code) continue

          let { room_id } = result
          if (room_id == 0) continue

          let roomInfo = await Bili.getRoomInfo(room_id)
          if (roomInfo?.code) continue

          if (roomInfo && roomInfo?.live_status == 1 && !item?.live?.live_time) {
            const authorInfo = await Bili.getUserBaseInfo(roomInfo?.uid).catch(() => null)
            const rendered = await renderBilibiliCard(bot, {
              nickname: item.nickname || authorInfo?.name || "B站主播",
              avatar: authorInfo?.face || roomInfo?.user_cover || "",
              publishedAt: roomInfo?.live_time || "",
              title: roomInfo?.title || "暂无标题",
              desc: String(roomInfo?.description || "").trim().slice(0, 160),
              cover: roomInfo?.user_cover || authorInfo?.face || "",
              cardType: "live",
              statText: [
                "状态 直播中",
                `分区 ${roomInfo?.area_name || "未分区"}`,
                `关注 ${computew(roomInfo?.attention || 0)}`,
                `在线 ${computew(roomInfo?.online || 0)}`,
              ].join(" | "),
              link: `https://live.bilibili.com/${room_id}`,
              saveId: `push_live_${room_id}`,
            })

            let res = await bot.sendMessage({ group_id: g }, rendered)
            if (res === false) throw new Error("直播推送消息失败")

            logger.info(`[Bilibili] 直播推送成功，房间ID：${room_id}，群ID：${g}`)
            writeLiveData(g, u, roomInfo)
          } else if (roomInfo?.live_status == 0 && item?.live?.live_time) {
            let { title, user_cover, area_name, live_time } = item.live
            const startAt = moment(live_time)
            const liveTime = startAt.isValid() ? moment().diff(startAt) : 0
            if (liveTime < 60 * 60 * 1000) {
              await bot.sendMessage({ group_id: g }, [
                segment.image(user_cover),
                `\n标题：${title}\n分区：${area_name}\n开播时间：${live_time}\n已结束直播，直播时长：${moment.utc(liveTime).format("HH:mm:ss")}`,
              ])
              writeLiveData(g, u, {})
              logger.info(`[Bilibili] 直播结束推送成功，房间ID：${room_id}，群ID：${g}`)
            } else {
              writeLiveData(g, u, {})
            }
          }
        } catch (e) {
          logger.error?.(`[Bilibili] 直播轮询失败，群ID：${g}，用户ID：${u}，${e?.message || e}`)
        }
      }
    }
  })

  //动态推送
  bot.setTask("10 * * * * *", async ctx => {
    if (!bot || typeof bot.sendMessage !== "function") return

    let glist = getBilibiliGroupList()
    if (glist.length == 0) return
    for (let g of glist) {
      let flist = getBiliData(g) || {}
      for (let [u, entry] of Object.entries(flist)) {
        const item = normalizeSubscriptionData(entry)
        if (!item) continue

        try {
          let result = await Bili.getUpdateDynamic(u)
          if (!result || result.code) continue

          const typeKey = getDynamicTypeKey(result.type)
          if (item.dynamicType && !item.dynamicType.includes(typeKey)) continue
          if (item.unpush && item.unpush.includes(typeKey)) continue
          if (result.id === item.upuid) continue

          const dynamicMessage = await renderDynamicMessage(bot, result)
          const sendResult = await bot.sendMessage({ group_id: g }, dynamicMessage)
          if (sendResult === false) {
            throw new Error("动态主消息发送失败")
          }

          let imglist = []
          if (result.imglist) {
            imglist = result.imglist.map(item => {
              return segment.image(item)
            })
          }
          if (result.orig?.imglist) {
            result.orig?.imglist.forEach(item => {
              imglist.push(segment.image(item))
            })
          }
          if (imglist.length > 0 && result.type != "专栏") {
            let forwardImgList = imglist
            let cleanupPaths = []
            try {
              const prepared = await prepareDynamicForwardImages(bot, ctx, result.id, imglist)
              forwardImgList = prepared.msgList
              cleanupPaths = prepared.cleanupPaths

              const forwardMsg = await makeDynamicImageForward(
                bot,
                ctx,
                g,
                forwardImgList,
                "动态图片",
                { logger },
              )
              await bot.sendMessage({ group_id: g }, forwardMsg)
            } catch (err) {
              logger.error?.(
                `[Bilibili] 动态图片转发失败，改为直接发送图片：${err?.message || err}`,
              )
              await bot.sendMessage({ group_id: g }, forwardImgList)
            } finally {
              cleanupTempFiles(cleanupPaths, "动态图片转发缓存")
            }
          }

          const nextData = {
            ...item,
            nickname: result.author?.nickname || item.nickname,
            upuid: result.id,
            uid: item.uid || u,
            img: result.author?.img || item.img,
            pendantImg: result.author?.pendantImg || item.pendantImg,
          }
          writeBiliData(g, item.uid || u, nextData)
        } catch (err) {
          logger.error?.(
            `[Bilibili] 动态轮询失败，群ID：${g}，用户ID：${u}，${err?.message || err}`,
          )
        }
      }
    }
  })
}

export function onBotEvent() {}
