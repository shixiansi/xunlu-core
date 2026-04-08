import { isBlacklistedDomain, normalizeDomain } from "./store.js"

const URL_REGEXP =
  /(?:(?:https?|ftp):\/\/|www\.|(?:[a-z0-9-]+\.)+(?:com|cn|net|org|cc|tv|top|xyz|io|co|me|app|dev))(?:[^\s<>"'，。！？、；：“”‘’（）【】《》]*)/gi
const FETCH_TIMEOUT_MS = 4000
const MAX_HTML_BYTES = 256 * 1024
const HTML_CONTENT_TYPE_REGEXP = /(?:text\/html|application\/xhtml\+xml)/i
const HIGH_ABUSE_HOSTING_SUFFIXES = [
  "pages.dev",
  "workers.dev",
  "netlify.app",
  "vercel.app",
  "github.io",
  "web.app",
]
const HIGH_RISK_DOMAIN_KEYWORD_REGEXP =
  /(?:troll|scare|virus|trojan|hack|phish|login|verify|secure|security|alert|warning|support|privacy|update|unlock|gift|free|reward|claim)/i
const RANDOM_SUBDOMAIN_REGEXP = /^(?=.*[a-z])(?=.*\d)[a-z0-9-]{8,}$/i
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

function getDomainSuffix(domain) {
  const normalized = String(domain || "").toLowerCase()
  return HIGH_ABUSE_HOSTING_SUFFIXES.find(suffix => normalized === suffix || normalized.endsWith(`.${suffix}`)) || ""
}

function detectLinkSignals(link, domain) {
  const reasons = []
  const normalizedDomain = String(domain || "").toLowerCase()
  const rawLink = String(link || "")
  let score = 0

  const abuseSuffix = getDomainSuffix(normalizedDomain)
  if (abuseSuffix) {
    score += 2
    reasons.push(`命中高滥用托管域 ${abuseSuffix}`)
  }

  if (normalizedDomain.startsWith("xn--")) {
    score += 3
    reasons.push("域名包含 punycode 编码，疑似仿冒字符")
  }
  if (isIpHost(normalizedDomain)) {
    score += 3
    reasons.push("直接使用 IP 地址而不是正常域名")
  }
  if (/@/.test(rawLink)) {
    score += 3
    reasons.push("链接中包含 @，可能用于伪装真实跳转地址")
  }

  if (HIGH_RISK_DOMAIN_KEYWORD_REGEXP.test(normalizedDomain) || HIGH_RISK_DOMAIN_KEYWORD_REGEXP.test(rawLink)) {
    score += 3
    reasons.push("链接中包含诱导、仿冒或恐吓类关键词")
  }

  const firstLabel = normalizedDomain.split(".")[0] || ""
  if (RANDOM_SUBDOMAIN_REGEXP.test(firstLabel)) {
    score += 1
    reasons.push("子域名结构较随机，存在批量投放风险")
  }

  return { score, reasons }
}

function resolveLinkLevel(score) {
  if (score >= 5) return "malicious"
  if (score >= 3) return "suspicious"
  return "clean"
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

    const signalResult = detectLinkSignals(link, domain)
    const level = resolveLinkLevel(signalResult.score)
    if (level !== "clean") {
      return {
        level,
        link,
        domain,
        matchedDomain: domain,
        reasons: signalResult.reasons,
        score: signalResult.score,
      }
    }

    return {
      level: "clean",
      link,
      domain,
      matchedDomain: domain,
      reasons: [],
      score: 0,
    }
  } catch {
    return null
  }
}

async function fetchHtmlSource(link, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch
  if (typeof fetchImpl !== "function") {
    return { ok: false, error: "当前环境不支持 fetch" }
  }

  const timeoutMs = Math.max(500, Math.floor(Number(options.timeoutMs || FETCH_TIMEOUT_MS)))
  const maxBytes = Math.max(1024, Math.floor(Number(options.maxBytes || MAX_HTML_BYTES)))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error("fetch timeout")), timeoutMs)

  try {
    const response = await fetchImpl(link, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "user-agent": "xunlu-core anti-phish/1.0",
      },
    })

    if (!response?.ok) {
      return { ok: false, error: `HTTP ${Number(response?.status || 0) || "error"}` }
    }

    const contentType = String(response.headers?.get?.("content-type") || "")
    if (!HTML_CONTENT_TYPE_REGEXP.test(contentType)) {
      return { ok: false, error: `非 HTML 内容: ${contentType || "unknown"}` }
    }

    const contentLength = Number(response.headers?.get?.("content-length") || 0)
    if (contentLength > maxBytes) {
      return { ok: false, error: `HTML 过大: ${contentLength} bytes` }
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > maxBytes) {
      return { ok: false, error: `HTML 过大: ${buffer.length} bytes` }
    }

    return {
      ok: true,
      finalUrl: String(response.url || link),
      contentType,
      source: buffer.toString("utf8"),
      bytes: buffer.length,
    }
  } catch (error) {
    return { ok: false, error: error?.name === "AbortError" ? "抓取超时" : error?.message || String(error) }
  } finally {
    clearTimeout(timer)
  }
}

function mergeLinkAndSourceResult(baseResult, htmlScan, fetchInfo) {
  const baseReasons = Array.isArray(baseResult?.reasons) ? baseResult.reasons : []
  const htmlReasons = Array.isArray(htmlScan?.hits) ? htmlScan.hits.map(item => String(item?.reason || "")) : []
  const reasons = [...baseReasons, ...htmlReasons].filter(Boolean)
  const baseScore = Number(baseResult?.score || 0)
  const htmlScore = Number(htmlScan?.score || 0)

  let level = String(baseResult?.level || "clean")
  if (htmlScan?.level === "high-risk") level = "malicious"
  else if (htmlScan?.level === "suspicious" && level === "clean") level = "suspicious"

  return {
    ...(baseResult || {}),
    level,
    score: baseScore + htmlScore,
    reasons,
    sourceFetched: Boolean(fetchInfo?.ok),
    sourceMeta: fetchInfo?.ok
      ? {
          finalUrl: fetchInfo.finalUrl,
          contentType: fetchInfo.contentType,
          bytes: fetchInfo.bytes,
        }
      : {
          error: fetchInfo?.error || "",
        },
    htmlScan,
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

export async function scanTextForLinksWithSource(text, options = {}) {
  const links = extractLinksFromText(text)
  const results = []

  for (const link of links) {
    const baseResult = inspectLink(link)
    if (!baseResult) continue

    if (baseResult.level === "malicious" && !options.forceFetchOnMalicious) {
      results.push({
        ...baseResult,
        sourceFetched: false,
        sourceMeta: { error: "已命中本地高危规则，跳过抓源码" },
      })
      continue
    }

    const fetchInfo = await fetchHtmlSource(link, options)
    if (!fetchInfo.ok) {
      results.push({
        ...baseResult,
        sourceFetched: false,
        sourceMeta: { error: fetchInfo.error || "抓取失败" },
      })
      continue
    }

    const htmlScan = scanHtmlSource(fetchInfo.source)
    results.push(mergeLinkAndSourceResult(baseResult, htmlScan, fetchInfo))
  }

  return results
}

export async function scanCtxForLinksWithSource(ctx, options = {}) {
  return await scanTextForLinksWithSource(extractText(ctx), options)
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
