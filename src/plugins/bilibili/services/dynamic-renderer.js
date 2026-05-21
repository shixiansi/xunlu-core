import { segment } from "../../../Bot/message/index.js"

export function formatCompactCount(num) {
  const value = Number(num || 0)
  return value >= 10000 ? `${(value / 10000).toFixed(1)}w` : value
}

export function stripDynamicHtml(text = "") {
  return String(text || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function buildDynamicFallbackMessage(result = {}) {
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

export function buildBilibiliCardFallback(card = {}) {
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

export function pickRandomBilibiliBackground(listBackgrounds, random = Math.random) {
  try {
    const backgrounds = typeof listBackgrounds === "function" ? listBackgrounds() : listBackgrounds
    if (!Array.isArray(backgrounds) || backgrounds.length === 0) return ""
    const index = Math.min(backgrounds.length - 1, Math.floor(random() * backgrounds.length))
    return backgrounds[index] || ""
  } catch {
    return ""
  }
}

export async function renderBilibiliCard(renderer, card = {}, options = {}) {
  const { logger, now = () => new Date() } = options
  if (renderer && typeof renderer.renderImg === "function") {
    try {
      const rendered = await renderer.renderImg(
        "bilibili",
        {
          nickname: String(card?.nickname || "B站用户").trim() || "B站用户",
          avatar: card?.avatar || card?.cover || "",
          publishedAt: card?.publishedAt || "",
          nowText: now().toISOString().replace("T", " ").slice(0, 19),
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
      logger?.warn?.(`[Bilibili] 卡片渲染失败，改用文本降级：${err?.message || err}`)
    }
  }

  return buildBilibiliCardFallback(card)
}

export async function renderDynamicMessage(renderer, result = {}, options = {}) {
  const { getRandomBackground = () => "", logger } = options
  if (renderer && typeof renderer.renderImg === "function") {
    try {
      const rendered = await renderer.renderImg("bilibili", {
        radom: getRandomBackground(),
        ...result,
      })
      if (rendered) return rendered
    } catch (err) {
      logger?.warn?.(`[Bilibili] 动态渲染失败，改用文本降级：${err?.message || err}`)
    }
  }

  return buildDynamicFallbackMessage(result)
}
