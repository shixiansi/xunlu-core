import { segment } from "../../../Bot/segment.js"
import DouyinService, {
  extractFirstDouyinUrlFromText,
  extractFirstDouyinUrlFromValue,
  formatCount,
  formatShortText,
} from "../services/douyin-service.js"

const ACTIVE_SESSION_KEY = "global"
const QR_POLL_INTERVAL_MS = 5000
const QR_MAX_POLLS = 60
const activeQrSessions = new Map()
let renderImg = null

function clearQrSession(key = ACTIVE_SESSION_KEY) {
  const session = activeQrSessions.get(key)
  if (session?.timer) clearTimeout(session.timer)
  activeQrSessions.delete(key)
  return session || null
}

function getBotForwardUserId(ctx) {
  const id = Number(ctx?.self_id ?? globalThis.Bot?.uin ?? globalThis.Bot?.user_id ?? 0)
  return Number.isFinite(id) && id > 0 ? Math.floor(id) : 10000
}

function buildAuthPrompt(ctx, reason = "missing") {
  if (reason === "expired") {
    if (ctx?.isMaster) return "抖音登录已失效，请私聊我发送 #抖音登录 <cookie> 重新导入。"
    return "抖音登录已失效，请联系主人私聊我发送 #抖音登录 <cookie> 重新导入。"
  }
  if (ctx?.isMaster) return "请先私聊我发送 #抖音登录 <cookie>，完成登录后再解析抖音链接。"
  return "抖音解析暂未就绪，请联系主人私聊我发送 #抖音登录 <cookie>。"
}

function buildCookieImportGuide() {
  return [
    "抖音当前改为手动设置 Cookie 登录。",
    "请私聊发送：#抖音登录 <完整cookie>",
    "也可以在 WebUI 的抖音配置页里粘贴完整 Cookie 保存。",
    "获取方式可参考：浏览器打开 www.douyin.com 并登录后，在开发者工具或 Cookie-Editor 里复制整段 Cookie。",
  ].join("\n")
}

function buildSummaryMessage(aweme = {}) {
  const lines = [`抖音${aweme.type === "note" ? "图文" : "视频"}解析`]
  lines.push(`作者：${aweme?.author?.nickname || "抖音用户"}`)
  if (aweme?.desc) lines.push(`文案：${formatShortText(aweme.desc, 220)}`)

  const statParts = []
  if (aweme?.stats?.playCount) statParts.push(`播放 ${formatCount(aweme.stats.playCount)}`)
  if (aweme?.stats?.diggCount) statParts.push(`点赞 ${formatCount(aweme.stats.diggCount)}`)
  if (aweme?.stats?.commentCount) statParts.push(`评论 ${formatCount(aweme.stats.commentCount)}`)
  if (aweme?.stats?.shareCount) statParts.push(`分享 ${formatCount(aweme.stats.shareCount)}`)
  if (statParts.length > 0) lines.push(`数据：${statParts.join(" | ")}`)

  if (aweme?.publishedAt) lines.push(`时间：${aweme.publishedAt}`)
  if (aweme?.link) lines.push(`链接：${aweme.link}`)

  const message = []
  if (aweme?.cover) message.push(segment.image(aweme.cover))
  message.push(lines.join("\n"))
  return message
}

async function renderSummaryCard(aweme = {}) {
  if (typeof renderImg !== "function") return null

  const desc = String(aweme?.desc || "").trim()
  const normalizedDesc = desc.length > 140 ? `${desc.slice(0, 139)}…` : desc
  return await renderImg("douyin", {
    nickname: String(aweme?.author?.nickname || "抖音用户").trim() || "抖音用户",
    avatar: aweme?.author?.avatar || aweme?.cover || "",
    publishedAt: aweme?.publishedAt || "",
    nowText: new Date().toISOString().replace("T", " ").slice(0, 19),
    desc: normalizedDesc,
    cover: aweme?.cover || aweme?.images?.[0] || "",
    awemeType: aweme?.type === "note" ? "note" : "video",
    saveId: `douyin_${aweme?.id || Date.now()}`,
  }, {
    tpl: "card",
  })
}

async function sendSummaryCard(ctx, aweme = {}) {
  try {
    const rendered = await renderSummaryCard(aweme)
    if (rendered) {
      await ctx.reply(rendered)
      return true
    }
  } catch (err) {
    logger.warn?.(`[Douyin] 摘要卡片渲染失败，回退纯文本：${err?.message || err}`)
  }

  await ctx.reply(buildSummaryMessage(aweme))
  return false
}

function buildCommentNode(comment = {}) {
  const lines = []
  lines.push(`点赞：${formatCount(comment?.diggCount || 0)}`)
  if (comment?.publishedAt) lines.push(`时间：${comment.publishedAt}`)
  lines.push(comment?.text || "")
  return lines.join("\n")
}

function buildCommentFallback(comments = []) {
  return comments
    .map((comment, index) => {
      const lines = [`${index + 1}. ${comment.nickname || "抖音用户"}`]
      lines.push(`点赞：${formatCount(comment?.diggCount || 0)}`)
      if (comment?.publishedAt) lines.push(`时间：${comment.publishedAt}`)
      lines.push(comment?.text || "")
      return lines.join("\n")
    })
    .join("\n\n")
}

function buildFriendlyErrorMessage(err) {
  switch (err?.code) {
    case "DOUYIN_INVALID_URL":
    case "DOUYIN_RESOLVE_FAILED":
      return "未识别到有效的抖音链接，请确认链接后再试。"
    case "DOUYIN_AWEME_UNAVAILABLE":
      return "该抖音作品可能已删除、私密，或暂时不可访问。"
    case "DOUYIN_AUTH_INVALID":
      return "抖音登录已失效，请主人私聊我重新发送 #抖音扫码。"
    case "DOUYIN_PARSE_FAILED":
      return "抖音作品解析失败，请稍后再试。"
    default:
      return err?.message ? `抖音解析失败：${err.message}` : "抖音解析失败，请稍后再试。"
  }
}

function extractFirstDouyinUrlFromContext(ctx = {}) {
  const candidates = [
    extractFirstDouyinUrlFromText(ctx?.url || ""),
    extractFirstDouyinUrlFromValue(ctx?.json),
    extractFirstDouyinUrlFromText(ctx?.msg || ""),
  ].filter(Boolean)

  return candidates[0] || ""
}

async function sendVideoMedia(ctx, aweme) {
  const cleanupPaths = []
  try {
    const videoPath = await DouyinService.downloadVideoFile(aweme?.video?.url, aweme?.id)
    cleanupPaths.push(videoPath)
    await ctx.reply(segment.video(videoPath))
    return true
  } catch (err) {
    logger.warn?.(`[Douyin] 视频发送失败，改走封面降级：${err?.message || err}`)
    const fallback = []
    if (aweme?.cover) fallback.push(segment.image(aweme.cover))
    fallback.push(`视频发送失败，已改为发送封面和原链接。\n链接：${aweme?.link || "无"}`)
    await ctx.reply(fallback)
    return false
  } finally {
    DouyinService.cleanupFiles(cleanupPaths)
  }
}

async function sendNoteMedia(ctx, aweme) {
  const imageUrls = (Array.isArray(aweme?.images) ? aweme.images : []).filter(Boolean)

  if (imageUrls.length === 0) {
    if (aweme?.cover) {
      await ctx.reply([
        segment.image(aweme.cover),
        `图文图片为空，请打开原链接查看：${aweme?.link || "无"}`,
      ])
    }
    return false
  }

  try {
    const botUserId = getBotForwardUserId(ctx)
    const nickname = String(aweme?.author?.nickname || "抖音图文").trim() || "抖音图文"
    const nodes = imageUrls.map((url, index) => ({
      user_id: botUserId,
      uin: botUserId,
      nickname,
      sender_name: nickname,
      name: nickname,
      content: [
        segment.image(url),
        ...(index === 0 && aweme?.link ? [`链接：${aweme.link}`] : []),
      ],
    }))
    const forward = await ctx.makeGroupForwardMsg(
      ctx,
      nodes,
      `抖音图文（${imageUrls.length}张）`,
    )
    await ctx.reply(forward)
    return true
  } catch (err) {
    logger.warn?.(`[Douyin] 图文发送失败，改走首图降级：${err?.message || err}`)
    const fallback = []
    if (aweme?.cover || aweme?.images?.[0]) {
      fallback.push(segment.image(aweme.cover || aweme.images[0]))
    }
    fallback.push(`图文图片发送失败，已改为发送首图和原链接。\n链接：${aweme?.link || "无"}`)
    await ctx.reply(fallback)
    return false
  }
}

async function sendHotCommentsForward(ctx, comments = []) {
  const limitedComments = Array.isArray(comments) ? comments.slice(0, 10) : []
  if (limitedComments.length === 0) {
    await ctx.reply("暂无可转发的热门评论。")
    return false
  }

  const botUserId = getBotForwardUserId(ctx)
  const nodes = limitedComments.map(comment => {
    const nickname = String(comment?.nickname || "抖音用户").trim() || "抖音用户"
    return {
      user_id: botUserId,
      uin: botUserId,
      nickname,
      sender_name: nickname,
      name: nickname,
      content: buildCommentNode(comment),
    }
  })

  try {
    const forward = await ctx.makeGroupForwardMsg(
      ctx,
      nodes,
      `抖音热门评论（${limitedComments.length}条）`,
    )
    await ctx.reply(forward)
    return true
  } catch (err) {
    logger.warn?.(`[Douyin] 热门评论转发失败，改走纯文本：${err?.message || err}`)
    await ctx.reply(`抖音热门评论：\n\n${buildCommentFallback(limitedComments)}`)
    return false
  }
}

async function processQrPoll(key = ACTIVE_SESSION_KEY, { notifyPending = false } = {}) {
  const session = activeQrSessions.get(key)
  if (!session) return false

  session.pollCount += 1

  try {
    const result = await DouyinService.pollQrLogin(session.token)
    if (result?.status === "success") {
      clearQrSession(key)
      DouyinService.cleanupQrImage()
      const userInfo = result?.userInfo || result?.auth?.userInfo || {}
      const lines = ["抖音登录成功，CK 已保存。"]
      if (userInfo?.nickname) lines.push(`账号：${userInfo.nickname}`)
      if (userInfo?.uid) lines.push(`UID：${userInfo.uid}`)
      if (userInfo?.avatar) {
        await session.ctx.reply([segment.image(userInfo.avatar), lines.join("\n")])
      } else {
        await session.ctx.reply(lines.join("\n"))
      }
      return true
    }

    if (result?.status === "expired" || session.pollCount >= QR_MAX_POLLS) {
      clearQrSession(key)
      DouyinService.cleanupQrImage()
      await session.ctx.reply("抖音二维码已过期，请重新发送 #抖音扫码。")
      return true
    }

    if (result?.status === "scanned" && !session.scannedNotified) {
      session.scannedNotified = true
      await session.ctx.reply("已扫码，请在抖音 App 内确认登录。")
    } else if (notifyPending && !session.pendingNotified) {
      session.pendingNotified = true
      await session.ctx.reply("二维码已发送，请在抖音 App 内完成扫码确认。")
    }

    session.timer = setTimeout(() => {
      void processQrPoll(key)
    }, QR_POLL_INTERVAL_MS)
    return false
  } catch (err) {
    clearQrSession(key)
    DouyinService.cleanupQrImage()
    logger.error?.(`[Douyin] 扫码登录状态检查失败：${err?.message || err}`)
    await session.ctx.reply("抖音扫码登录状态检查失败，请稍后重试。")
    return true
  }
}

async function handleQrLoginCommand(ctx) {
  if (!ctx?.isMaster) return false
  if (!ctx?.isPrivate) {
    return await ctx.reply("请私聊我发送 #抖音登录 <cookie>，或前往 WebUI 的抖音配置页设置 Cookie。")
  }
  clearQrSession(ACTIVE_SESSION_KEY)
  DouyinService.cleanupQrImage()
  await ctx.reply(buildCookieImportGuide())
  return true
}

async function handleCookieLoginCommand(ctx) {
  if (!ctx?.isMaster) return false
  if (!ctx?.isPrivate) {
    return await ctx.reply("请私聊我发送 #抖音登录 <cookie>。")
  }

  const text = String(ctx?.msg || ctx?.text || "").trim()
  const matched = text.match(/^(?:[#＃]\s*)?抖音(?:登录|cookie|ck)\s+([\s\S]+)$/i)
  const cookieHeader = String(matched?.[1] || "").trim()
  if (!cookieHeader) {
    await ctx.reply(buildCookieImportGuide())
    return true
  }

  clearQrSession(ACTIVE_SESSION_KEY)
  DouyinService.cleanupQrImage()

  try {
    const auth = await DouyinService.importCookieHeader(cookieHeader)
    const userInfo = auth?.userInfo || {}
    const lines = ["抖音登录成功，Cookie 已保存。"]
    if (userInfo?.nickname) lines.push(`账号：${userInfo.nickname}`)
    if (userInfo?.uid) lines.push(`UID：${userInfo.uid}`)
    await ctx.reply(lines.join("\n"))
  } catch (err) {
    logger.error?.(`[Douyin] 导入 Cookie 登录失败：${err?.message || err}`)
    await ctx.reply(err?.message || "抖音 Cookie 导入失败，请确认后重试。")
  }

  return true
}

async function handleDouyinParse(ctx) {
  const url = extractFirstDouyinUrlFromContext(ctx)
  if (!url) return false

  const authState = await DouyinService.ensureAuthorizedSession()
  if (!authState?.ok) {
    await ctx.reply(buildAuthPrompt(ctx, authState?.reason))
    return true
  }

  let aweme
  try {
    aweme = await DouyinService.getAwemeDetail(url, authState.auth)
  } catch (err) {
    await ctx.reply(buildFriendlyErrorMessage(err))
    return true
  }

  await sendSummaryCard(ctx, aweme)

  if (aweme?.type === "note") {
    await sendNoteMedia(ctx, aweme)
  } else {
    await sendVideoMedia(ctx, aweme)
  }

  try {
    const comments = await DouyinService.fetchHotComments(aweme.id, authState.auth, 10, aweme.link)
    await sendHotCommentsForward(ctx, comments)
  } catch (err) {
    logger.warn?.(`[Douyin] 获取热门评论失败：${err?.message || err}`)
  }

  return true
}

export function register(bot) {
  if (!bot?.registerCommand) return
  renderImg = typeof bot?.renderImg === "function" ? bot.renderImg : null

  bot.registerCommand(["^[#＃]抖音扫码$", 1000], async ctx => await handleQrLoginCommand(ctx))
  bot.registerCommand(
    ["^[#＃]抖音(登录|cookie|ck)(\\s+.+)?$", 1000],
    async ctx => await handleCookieLoginCommand(ctx),
  )
  bot.registerCommand(["", 1200], async ctx => await handleDouyinParse(ctx))
}

export function onBotEvent() {}

export function __resetDouyinSessionsForTests() {
  for (const key of activeQrSessions.keys()) {
    clearQrSession(key)
  }
  DouyinService.__resetForTests()
}

export {
  buildSummaryMessage,
  buildCookieImportGuide,
  extractFirstDouyinUrlFromContext,
  handleCookieLoginCommand,
  handleDouyinParse,
  handleQrLoginCommand,
  sendHotCommentsForward,
  sendNoteMedia,
  sendVideoMedia,
}
