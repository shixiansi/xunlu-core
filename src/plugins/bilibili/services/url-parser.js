const BILIBILI_VIDEO_HOSTS = ["b23.tv", "m.bilibili.com", "www.bilibili.com", "bilibili.com"]
const BILIBILI_LIVE_HOSTS = ["live.bilibili.com"]
const BV_ID_REG = /\bBV[0-9A-Za-z]{10}\b/
const URL_REGEXP = /https?:\/\/[^\s]+/gi

export function getNormalizedHost(url = "") {
  try {
    const target = /^https?:\/\//i.test(url) ? url : `https://${url}`
    return new URL(target).hostname.toLowerCase()
  } catch {
    return ""
  }
}

export function isBilibiliVideoUrl(url = "") {
  const hostname = getNormalizedHost(url)
  return BILIBILI_VIDEO_HOSTS.some(host => hostname === host || hostname.endsWith(`.${host}`))
}

export function isBilibiliLiveUrl(url = "") {
  const hostname = getNormalizedHost(url)
  return BILIBILI_LIVE_HOSTS.some(host => hostname === host || hostname.endsWith(`.${host}`))
}

export function extractFirstUrlFromText(text = "") {
  return String(text || "").match(URL_REGEXP)?.[0] || ""
}

export function extractBilibiliUrl(ctx = {}) {
  const directUrl = String(ctx?.url || "").trim()
  if (directUrl) return directUrl

  const json = ctx?.json
  if (!json || typeof json !== "object") return ""
  const jsonUrl = String(
    json?.meta?.detail_1?.qqdocurl ?? json?.meta?.news?.jumpUrl ?? json?.meta?.news?.url ?? "",
  ).trim()
  if (jsonUrl) return jsonUrl

  return extractFirstUrlFromText(ctx?.msg || "")
}

export function extractBvId(url = "") {
  return String(url || "").match(BV_ID_REG)?.[0] || ""
}

export function extractLiveRoomId(url = "") {
  try {
    const target = /^https?:\/\//i.test(url) ? url : `https://${url}`
    const parsed = new URL(target)
    if (!isBilibiliLiveUrl(parsed.href)) return ""
    const matched = parsed.pathname.match(/\/(?:blanc\/)?(\d+)(?:\/|$)/)
    return matched?.[1] || ""
  } catch {
    return ""
  }
}
