import { isBlacklistedDomain, normalizeDomain } from "./store.js"

const URL_REGEXP =
  /(?:(?:https?|ftp):\/\/|www\.|(?:[a-z0-9-]+\.)+(?:com|cn|net|org|cc|tv|top|xyz|io|co|me|app|dev))(?:[^\s<>"'，。！？、；：“”‘’（）【】《》]*)/gi
const HTML_RULES = [
  {
    id: "fullscreen-api",
    score: 3,
    reason: "命中全屏 API 调用",
    patterns: [/requestFullscreen/i, /webkitRequestFullScreen/i, /mozRequestFullScreen/i, /msRequestFullscreen/i],
  },
  {
    id: "force-play-media",
    score: 2,
    reason: "命中媒体强制播放逻辑",
    patterns: [/\.play\s*\(/i, /autoplay/i],
  },
  {
    id: "leave-trap",
    score: 3,
    reason: "命中离开页面阻拦逻辑",
    patterns: [/onbeforeunload/i, /beforeunload/i],
  },
  {
    id: "disable-context-menu",
    score: 2,
    reason: "命中禁用右键逻辑",
    patterns: [/oncontextmenu\s*=\s*["']return false;?["']/i, /addEventListener\s*\(\s*["']contextmenu["']/i],
  },
  {
    id: "hide-cursor",
    score: 2,
    reason: "命中隐藏鼠标样式",
    patterns: [/cursor\s*:\s*none/i],
  },
  {
    id: "fullscreen-overlay",
    score: 2,
    reason: "命中全屏遮罩覆盖层样式",
    patterns: [/position\s*:\s*fixed/i, /width\s*:\s*100vw/i, /height\s*:\s*100vh/i, /z-index\s*:\s*\d+/i],
    requireAll: true,
  },
  {
    id: "consent-lure",
    score: 2,
    reason: "命中诱导授权文案",
    patterns: [/同意并继续/i, /个人信息保护指引/i, /服务协议/i, /隐私政策/i],
  },
  {
    id: "scare-video",
    score: 3,
    reason: "命中恐吓式视频展示组合",
    patterns: [/<video\b/i, /background\s*:\s*#000/i, /object-fit\s*:\s*cover/i],
    requireAll: true,
  },
  {
    id: "cloudflare-pages",
    score: 1,
    reason: "命中 Cloudflare Pages/Insights 托管痕迹",
    patterns: [/pages\.dev/i, /static\.cloudflareinsights\.com\/beacon\.min\.js/i],
  },
]

function extractText(ctx) {
  const segments = Array.isArray(ctx?.message) ? ctx.message : []
  const fromSegments = segments
    .filter(seg => seg && typeof seg === "object" && String(seg.type || "") === "text")
    .map(seg => String(seg?.data?.text ?? seg?.data?.content ?? seg?.text ?? seg?.content ?? ""))
    .join(" ")
    .trim()

  if (fromSegments) return fromSegments
  return String(ctx?.raw_message ?? ctx?.msg ?? "").trim()
}

function toUrlCandidate(raw) {
  const value = String(raw || "").trim()
  if (!value) return ""
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value
  return `http://${value}`
}

function extractLinksFromText(text) {
  const rawText = String(text || "")
  const matches = rawText.match(URL_REGEXP) || []
  const unique = new Set()
  const links = []

  for (const item of matches) {
    const cleaned = String(item || "").trim().replace(/[),.;!?]+$/g, "")
    if (!cleaned || unique.has(cleaned)) continue
    unique.add(cleaned)
    links.push(cleaned)
  }

  return links
}

function isIpHost(domain) {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(String(domain || ""))
}

function detectSuspiciousSignals(link, domain) {
  const reasons = []
  const normalizedDomain = String(domain || "").toLowerCase()
  const rawLink = String(link || "")

  if (normalizedDomain.startsWith("xn--")) reasons.push("域名包含 punycode 编码，疑似仿冒字符")
  if (isIpHost(normalizedDomain)) reasons.push("直接使用 IP 地址而不是正常域名")
  if (/@/.test(rawLink)) reasons.push("链接中包含 @，可能用于伪装真实跳转地址")

  return reasons
}

function inspectLink(link) {
  const candidate = toUrlCandidate(link)
  try {
    const parsed = new URL(candidate)
    const domain = normalizeDomain(parsed.hostname)
    if (!domain) return null

    const blacklisted = isBlacklistedDomain(domain)
    if (blacklisted) {
      return {
        level: "malicious",
        link,
        domain,
        matchedDomain: blacklisted.matchedDomain,
        reasons: [String(blacklisted.meta?.reason || "命中恶意网址黑名单")],
      }
    }

    const suspiciousReasons = detectSuspiciousSignals(link, domain)
    if (suspiciousReasons.length) {
      return {
        level: "suspicious",
        link,
        domain,
        matchedDomain: domain,
        reasons: suspiciousReasons,
      }
    }

    return {
      level: "clean",
      link,
      domain,
      matchedDomain: domain,
      reasons: [],
    }
  } catch {
    return null
  }
}

export function scanTextForLinks(text) {
  return extractLinksFromText(text)
    .map(link => inspectLink(link))
    .filter(Boolean)
}

export function scanCtxForLinks(ctx) {
  return scanTextForLinks(extractText(ctx))
}

export function scanHtmlSource(source) {
  const text = String(source || "")
  if (!text.trim()) {
    return {
      level: "clean",
      score: 0,
      hits: [],
      summary: "没有可检测的源码内容",
    }
  }

  const hits = []
  let score = 0

  for (const rule of HTML_RULES) {
    const patterns = Array.isArray(rule.patterns) ? rule.patterns : []
    const matched = rule.requireAll
      ? patterns.length > 0 && patterns.every(pattern => pattern.test(text))
      : patterns.some(pattern => pattern.test(text))

    if (!matched) continue
    score += Number(rule.score || 0)
    hits.push({
      id: rule.id,
      score: Number(rule.score || 0),
      reason: rule.reason,
    })
  }

  let level = "clean"
  if (score >= 8) level = "high-risk"
  else if (score >= 5) level = "suspicious"

  const summary =
    level === "high-risk"
      ? "源码命中多条高危特征，极可能是恐吓页、诱导页或钓鱼页"
      : level === "suspicious"
        ? "源码存在明显风险特征，建议谨慎处理"
        : "源码未命中足够多的高风险特征"

  return {
    level,
    score,
    hits,
    summary,
  }
}
