import fs from "node:fs"
import { randomUUID } from "node:crypto"
import path from "node:path"

import { load } from "cheerio"
import fetch from "node-fetch"
import puppeteer from "puppeteer"

import env from "../../../lib/env.js"
import Download from "../../../utils/download.js"
import {
  clearDouyinAuth,
  readDouyinAuth,
  writeDouyinAuth,
} from "../model/auth-store.js"

const ROOT_PATH = path.resolve(env.RootPath)
const TEMP_DIR = path.join(ROOT_PATH, "temp", "douyin")
const TEMP_VIDEO_DIR = path.join(TEMP_DIR, "video")
const BROWSER_PROFILE_ROOT = path.join(TEMP_DIR, "browser-profile")
const QR_IMAGE_PATH = path.join(TEMP_DIR, "login-qrcode.png")
const LOGIN_ENTRY_URL = "https://www.douyin.com/jingxuan"
const VIDEO_MAX_BYTES = 70 * 1024 * 1024
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
const WEB_REFERER = "https://www.douyin.com/"
const COMMON_QUERY = {
  aid: "6383",
  channel: "channel_pc_web",
  device_platform: "webapp",
}
const SELF_INFO_ENDPOINTS = [
  {
    url: "https://www.douyin.com/aweme/v1/web/user/profile/self/",
    query: {
      ...COMMON_QUERY,
      source: "channel_pc_web",
    },
  },
  {
    url: "https://www.douyin.com/passport/web/account/info/",
    query: {
      service: WEB_REFERER,
    },
  },
]
const DETAIL_ENDPOINTS = [
  {
    url: "https://www.douyin.com/aweme/v1/web/aweme/detail/",
    buildQuery(id) {
      return {
        ...COMMON_QUERY,
        aweme_id: id,
        source: "channel_pc_web",
        update_version_code: "170400",
      }
    },
  },
  {
    url: "https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/",
    buildQuery(id) {
      return {
        item_ids: id,
      }
    },
  },
]
const COMMENT_ENDPOINTS = [
  {
    url: "https://www.douyin.com/aweme/v1/web/comment/list/",
    buildQuery(id, limit) {
      return {
        ...COMMON_QUERY,
        aweme_id: id,
        cursor: "0",
        count: String(limit),
        item_type: "0",
        sort_type: "1",
      }
    },
  },
]
const DOUYIN_HOST_RE = /(^|\.)((v\.)?douyin\.com|iesdouyin\.com)$/i
const URL_RE = /https?:\/\/[^\s]+/gi

function createError(message, code, extra = {}) {
  const err = new Error(message)
  err.code = code
  Object.assign(err, extra)
  return err
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
  return dirPath
}

function cleanupDir(dirPath) {
  try {
    if (dirPath && fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true })
  } catch {}
}

function cleanupFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch {}
}

function delay(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)))
}

function resolveChromeExecutablePath() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  ]
  for (const candidate of candidates) {
    const filePath = String(candidate || "").trim()
    if (filePath && fs.existsSync(filePath)) return filePath
  }
  return ""
}

function shouldDisableSandbox() {
  const override = normalizeString(
    process.env.PUPPETEER_DISABLE_SANDBOX || process.env.CHROME_NO_SANDBOX,
  ).toLowerCase()
  if (["1", "true", "yes", "on"].includes(override)) return true
  if (["0", "false", "no", "off"].includes(override)) return false
  if (process.platform !== "linux") return false
  if (typeof process.getuid === "function" && process.getuid() === 0) return true
  return Boolean(process.env.container || process.env.DOCKER_CONTAINER)
}

function buildLaunchOptions({ profileDir = "" } = {}) {
  const executablePath = resolveChromeExecutablePath()
  const args = [
    "--disable-blink-features=AutomationControlled",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--window-size=1440,1200",
  ]

  if (shouldDisableSandbox()) {
    args.push("--disable-setuid-sandbox", "--no-sandbox", "--no-zygote")
  }

  const options = {
    headless: "new",
    ignoreDefaultArgs: ["--enable-automation"],
    args,
  }
  if (profileDir) options.userDataDir = profileDir
  if (executablePath) options.executablePath = executablePath
  return options
}

function shouldBlockLoginRequest(request) {
  const type = normalizeString(request?.resourceType?.())
  if (["media", "font", "websocket", "eventsource", "manifest"].includes(type)) return true

  const url = normalizeString(request?.url?.()).toLowerCase()
  if (!url) return false

  if (/(\.mp4|\.m3u8|\.mp3)(\?|$)/i.test(url)) return true
  if (/(?:^|\/)(?:aweme|feed)\/v\d+\/(?:web\/)?feed/i.test(url)) return true
  if (/\/recommend\//i.test(url) || /webcast/i.test(url) || /live\.douyin\.com/i.test(url)) return true

  return false
}

function parseDataUrl(dataUrl = "") {
  const source = String(dataUrl || "").trim()
  const matched = source.match(/^data:([^;,]+)?;base64,(.+)$/)
  if (!matched) return null
  return {
    mimeType: matched[1] || "image/png",
    buffer: Buffer.from(matched[2], "base64"),
  }
}

function hasAuthenticatedCookies(cookies = {}) {
  const map = normalizeCookies(cookies)
  return ["sessionid", "sessionid_ss"].some(key => Boolean(map[key]))
}

function hasResolvedUserInfo(userInfo = {}) {
  return Boolean(normalizeString(userInfo?.nickname) || normalizeString(userInfo?.uid))
}

function stripBom(text = "") {
  return String(text || "").replace(/^\uFEFF/, "")
}

function tryParseJson(text = "") {
  const source = stripBom(text).trim()
  if (!source) return null

  try {
    return JSON.parse(source)
  } catch {}

  const jsonpMatch = source.match(/^[^(]+\(([\s\S]+)\)\s*;?$/)
  if (jsonpMatch) {
    try {
      return JSON.parse(jsonpMatch[1])
    } catch {}
  }

  return null
}

function buildUrl(baseUrl, query = {}) {
  const url = new URL(baseUrl)
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === "") continue
    url.searchParams.set(key, String(value))
  }
  return url.toString()
}

function normalizeCookies(raw = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const out = {}
  for (const [key, value] of Object.entries(raw)) {
    const name = String(key || "").trim()
    const cookieValue = String(value || "").trim()
    if (!name || !cookieValue) continue
    out[name] = cookieValue
  }
  return out
}

function parseSetCookieArray(cookiesArray = []) {
  const out = {}
  const list = Array.isArray(cookiesArray) ? cookiesArray : [cookiesArray]
  for (const line of list) {
    const raw = String(line || "").trim()
    if (!raw) continue
    const pair = raw.split(";")[0]
    const separator = pair.indexOf("=")
    if (separator <= 0) continue
    const key = pair.slice(0, separator).trim()
    const value = pair.slice(separator + 1).trim()
    if (!key || !value) continue
    out[key] = value
  }
  return out
}

function mergeCookies(...sources) {
  const out = {}
  for (const source of sources) {
    Object.assign(out, normalizeCookies(source))
  }
  return out
}

function buildCookieHeader(cookies = {}) {
  return Object.entries(normalizeCookies(cookies))
    .map(([key, value]) => `${key}=${value}`)
    .join("; ")
}

function getResponseCookies(response) {
  return parseSetCookieArray(response?.headers?.raw?.()["set-cookie"] || [])
}

function buildHeaders(auth = null, extra = {}) {
  const headers = {
    accept: "application/json, text/plain, */*",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    referer: WEB_REFERER,
    "user-agent": USER_AGENT,
    ...extra,
  }
  if (auth?.cookieHeader) headers.cookie = auth.cookieHeader
  return headers
}

async function requestText(url, options = {}) {
  const response = await fetch(url, options)
  const text = await response.text()
  return { response, text }
}

async function requestJson(url, options = {}) {
  const { response, text } = await requestText(url, options)
  const data = tryParseJson(text)
  if (!data) {
    throw createError(`failed to parse json from ${url}`, "DOUYIN_BAD_JSON", {
      status: response.status,
      body: text.slice(0, 400),
    })
  }
  return { response, data }
}

function safeDecodeURIComponent(text = "") {
  const source = String(text || "").trim()
  if (!source) return ""
  try {
    return decodeURIComponent(source)
  } catch {
    return source
  }
}

function normalizeString(value) {
  return String(value ?? "").trim()
}

function pickFirstUrl(value) {
  if (!value) return ""
  if (typeof value === "string") {
    const text = value.trim()
    return /^https?:\/\//i.test(text) ? text : ""
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = pickFirstUrl(item)
      if (found) return found
    }
    return ""
  }
  if (typeof value === "object") {
    return (
      pickFirstUrl(value.url_list) ||
      pickFirstUrl(value.urlList) ||
      pickFirstUrl(value.uri) ||
      pickFirstUrl(value.url) ||
      pickFirstUrl(value.src) ||
      ""
    )
  }
  return ""
}

function extractAwemeId(candidate = {}) {
  return normalizeString(
    candidate?.aweme_id ??
      candidate?.awemeId ??
      candidate?.item_id ??
      candidate?.itemId ??
      candidate?.group_id ??
      candidate?.groupId,
  )
}

function normalizeAuthor(author = {}) {
  const source = author && typeof author === "object" ? author : {}
  return {
    id: normalizeString(source?.uid ?? source?.sec_uid ?? source?.secUid ?? source?.id),
    nickname:
      normalizeString(source?.nickname ?? source?.name ?? source?.unique_id ?? source?.uniqueId) ||
      "抖音用户",
    avatar:
      pickFirstUrl(source?.avatar_thumb) ||
      pickFirstUrl(source?.avatar_medium) ||
      pickFirstUrl(source?.avatar_larger) ||
      pickFirstUrl(source?.avatar) ||
      "",
  }
}

function normalizeStats(stats = {}) {
  const source = stats && typeof stats === "object" ? stats : {}
  const pickNumber = (...values) => {
    for (const value of values) {
      const num = Number(value)
      if (Number.isFinite(num)) return Math.floor(num)
    }
    return 0
  }

  return {
    diggCount: pickNumber(source?.digg_count, source?.diggCount, source?.like_count, source?.likeCount),
    commentCount: pickNumber(source?.comment_count, source?.commentCount),
    collectCount: pickNumber(source?.collect_count, source?.collectCount, source?.collects),
    shareCount: pickNumber(source?.share_count, source?.shareCount),
    playCount: pickNumber(source?.play_count, source?.playCount, source?.playCnt),
  }
}

function normalizeTimestamp(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return ""
  const ts = num < 1e12 ? num * 1000 : num
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return ""
  const pad = next => String(next).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function normalizeImageList(candidate = {}) {
  const source = candidate && typeof candidate === "object" ? candidate : {}
  const pools = [
    source?.images,
    source?.image_list,
    source?.imageList,
    source?.image_post_info?.images,
    source?.imagePost?.images,
    source?.image_post?.images,
  ]
  const urls = []
  for (const pool of pools) {
    if (!Array.isArray(pool)) continue
    for (const item of pool) {
      const url =
        pickFirstUrl(item?.url_list) ||
        pickFirstUrl(item?.display_image?.url_list) ||
        pickFirstUrl(item?.download_url_list) ||
        pickFirstUrl(item)
      if (url && !urls.includes(url)) urls.push(url)
    }
  }
  return urls
}

function normalizeVideoData(candidate = {}) {
  const source = candidate && typeof candidate === "object" ? candidate : {}
  const video = source?.video && typeof source.video === "object" ? source.video : source
  const playUrl =
    pickFirstUrl(video?.play_addr_h264) ||
    pickFirstUrl(video?.play_addr) ||
    pickFirstUrl(video?.bit_rate?.[0]?.play_addr) ||
    pickFirstUrl(video?.download_addr) ||
    pickFirstUrl(video?.play_api) ||
    pickFirstUrl(video?.playApi) ||
    pickFirstUrl(video?.play_url) ||
    ""
  const cover =
    pickFirstUrl(video?.cover) ||
    pickFirstUrl(video?.dynamic_cover) ||
    pickFirstUrl(video?.origin_cover) ||
    ""
  const duration = Number(video?.duration)
  return {
    url: playUrl,
    cover,
    duration: Number.isFinite(duration) && duration > 0 ? Math.floor(duration) : 0,
  }
}

function normalizeDesc(candidate = {}) {
  return normalizeString(
    candidate?.desc ??
      candidate?.title ??
      candidate?.summary ??
      candidate?.share_info?.share_desc ??
      candidate?.shareInfo?.shareDesc ??
      "",
  )
}

function normalizeLink(rawUrl, awemeId, type) {
  if (rawUrl) return rawUrl
  if (!awemeId) return ""
  const route = type === "note" ? "note" : "video"
  return `https://www.douyin.com/${route}/${awemeId}`
}

function normalizeUserInfo(raw = {}) {
  if (!raw || typeof raw !== "object") return null
  const nickname = normalizeString(
    raw?.nickname ??
      raw?.name ??
      raw?.screen_name ??
      raw?.screenName ??
      raw?.user_info?.nickname ??
      raw?.userInfo?.nickname,
  )
  const uid = normalizeString(
    raw?.uid ??
      raw?.id ??
      raw?.sec_uid ??
      raw?.secUid ??
      raw?.user_info?.uid ??
      raw?.userInfo?.uid,
  )
  const avatar =
    pickFirstUrl(raw?.avatar_thumb) ||
    pickFirstUrl(raw?.avatar) ||
    pickFirstUrl(raw?.user_info?.avatar_thumb) ||
    pickFirstUrl(raw?.userInfo?.avatar_thumb) ||
    ""
  if (!nickname && !uid) return null
  return { nickname: nickname || uid || "抖音用户", uid, avatar }
}

function formatShortText(text = "", max = 240) {
  const normalized = String(text || "").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max - 1)}…`
}

function formatCount(value = 0) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return "0"
  if (num >= 100000000) return `${(num / 100000000).toFixed(1)}亿`
  if (num >= 10000) return `${(num / 10000).toFixed(1)}w`
  return String(Math.floor(num))
}

function extractJsonCandidatesFromHtml(html = "") {
  const content = String(html || "")
  if (!content) return []
  const matches = []
  const pushCandidate = value => {
    if (value) matches.push(value)
  }

  const regexList = [
    /<script[^>]+id="RENDER_DATA"[^>]*>([\s\S]*?)<\/script>/gi,
    /<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/gi,
    /window\._ROUTER_DATA\s*=\s*([\s\S]*?);\s*<\/script>/gi,
    /window\.__INITIAL_STATE__\s*=\s*([\s\S]*?);\s*<\/script>/gi,
    /window\.__INIT_PROPS__\s*=\s*([\s\S]*?);\s*<\/script>/gi,
    /window\.SIGI_STATE\s*=\s*([\s\S]*?);\s*<\/script>/gi,
  ]

  for (const regex of regexList) {
    let match
    while ((match = regex.exec(content)) !== null) {
      const raw = safeDecodeURIComponent(match[1])
      pushCandidate(tryParseJson(raw))
      pushCandidate(tryParseJson(match[1]))
    }
  }

  try {
    const $ = load(content)
    $("script").each((_, element) => {
      const raw = $(element).html()?.trim()
      if (!raw || raw.length < 20) return
      if (raw.startsWith("{") || raw.startsWith("[")) {
        pushCandidate(tryParseJson(raw))
        return
      }
      const assignmentMatch = raw.match(/=\s*({[\s\S]+})\s*;?$/)
      if (assignmentMatch) pushCandidate(tryParseJson(assignmentMatch[1]))
    })
  } catch {}

  return matches.filter(Boolean)
}

function findCandidateNodes(root) {
  const result = []
  const seen = new Set()
  const visit = value => {
    if (!value || typeof value !== "object") return
    if (seen.has(value)) return
    seen.add(value)

    if (!Array.isArray(value)) {
      const id = extractAwemeId(value)
      const hasMedia = Boolean(normalizeVideoData(value).url || normalizeImageList(value).length > 0)
      const hasHint = Boolean(id && (hasMedia || normalizeDesc(value) || value?.author))
      if (hasHint) result.push(value)
    }

    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }

    for (const next of Object.values(value)) visit(next)
  }

  visit(root)
  return result
}

function normalizeDouyinAweme(candidate = {}, { sourceUrl = "" } = {}) {
  const awemeId = extractAwemeId(candidate)
  if (!awemeId) {
    throw createError("未识别到作品 ID", "DOUYIN_UNSUPPORTED")
  }

  const author = normalizeAuthor(candidate?.author || candidate?.authorInfo || {})
  const stats = normalizeStats(candidate?.statistics || candidate?.stats || {})
  const images = normalizeImageList(candidate)
  const video = normalizeVideoData(candidate)
  const cover = video.cover || images[0] || pickFirstUrl(candidate?.cover) || author.avatar || ""
  const desc = normalizeDesc(candidate)
  const type =
    video.url ? "video" : images.length > 0 ? "note" : sourceUrl.includes("/note/") ? "note" : "video"
  const publishedAt = normalizeTimestamp(
    candidate?.create_time ?? candidate?.createTime ?? candidate?.publish_time ?? candidate?.publishTime,
  )

  return {
    id: awemeId,
    type,
    author,
    desc,
    stats,
    cover,
    video,
    images,
    link: normalizeLink(sourceUrl, awemeId, type),
    publishedAt,
  }
}

function extractFirstDouyinUrlFromText(text = "") {
  const raw = String(text || "")
  const matches = raw.match(URL_RE) || []
  const unique = []
  const seen = new Set()
  for (const item of matches) {
    const normalized = String(item || "").replace(/[),。；、]+$/, "").trim()
    if (!normalized) continue
    try {
      const url = new URL(normalized)
      if (!DOUYIN_HOST_RE.test(url.hostname)) continue
      const key = url.toString()
      if (seen.has(key)) continue
      seen.add(key)
      unique.push(key)
    } catch {}
  }
  return unique[0] || ""
}

function extractFirstDouyinUrlFromValue(value) {
  if (!value) return ""
  if (typeof value === "string") return extractFirstDouyinUrlFromText(value)
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractFirstDouyinUrlFromValue(item)
      if (found) return found
    }
    return ""
  }
  if (typeof value === "object") {
    for (const next of Object.values(value)) {
      const found = extractFirstDouyinUrlFromValue(next)
      if (found) return found
    }
  }
  return ""
}

function normalizeComment(comment = {}) {
  const author = normalizeAuthor(comment?.user || comment?.author || {})
  const text = formatShortText(
    comment?.text ?? comment?.content_text ?? comment?.contentText ?? comment?.reply_comment_total ?? "",
    1000,
  )
  if (!text) return null
  return {
    id: normalizeString(comment?.cid ?? comment?.comment_id ?? comment?.commentId),
    nickname: author.nickname || "抖音用户",
    userId: author.id || "",
    text,
    diggCount: Number(comment?.digg_count ?? comment?.diggCount ?? comment?.like_count ?? 0) || 0,
    publishedAt: normalizeTimestamp(comment?.create_time ?? comment?.createTime),
  }
}

function looksLikeCommentTimeLine(text = "") {
  const value = normalizeString(text)
  return /(\d+分钟前|\d+小时前|\d+天前|\d+月前|刚刚|昨天|前·|发布于|\d{4}-\d{2}-\d{2})/.test(
    value,
  )
}

function parseHumanCount(text = "") {
  const value = normalizeString(text).replace(/,/g, "")
  if (!value) return 0
  const matched = value.match(/^(\d+(?:\.\d+)?)([万亿]?)$/)
  if (!matched) return 0
  const num = Number(matched[1])
  if (!Number.isFinite(num)) return 0
  const unit = matched[2]
  if (unit === "亿") return Math.round(num * 100000000)
  if (unit === "万") return Math.round(num * 10000)
  return Math.round(num)
}

function extractCommentsFromRenderedText(text = "", limit = 10) {
  const rawLines = String(text || "")
    .split(/\r?\n/)
    .map(item => normalizeString(item))
    .filter(Boolean)
  const startIndex = rawLines.findIndex(line => line === "全部评论")
  const lines = startIndex >= 0 ? rawLines.slice(startIndex + 1) : rawLines
  const comments = []
  let inSearchSection = false
  const skipLine = line =>
    !line ||
    line === "..." ||
    line === "分享" ||
    line === "回复" ||
    line === "请先登录后发表评论" ||
    line === "大家都在搜：" ||
    line === "点击加载更多" ||
    /^展开\d+条回复$/.test(line)

  for (let i = 0; i < lines.length && comments.length < limit; i += 1) {
    const nickname = lines[i]
    const ellipsis = lines[i + 1]
    const content = lines[i + 2]
    const time = lines[i + 3]
    const likeText = lines[i + 4]

    if (nickname === "大家都在搜：") {
      inSearchSection = true
      continue
    }
    if (!nickname || skipLine(nickname)) continue
    if (ellipsis !== "...") continue
    if (!content || skipLine(content)) continue
    if (!looksLikeCommentTimeLine(time)) continue

    comments.push({
      id: "",
      nickname: inSearchSection ? "抖音用户" : nickname,
      userId: "",
      text: formatShortText(content, 1000),
      diggCount: parseHumanCount(likeText),
      publishedAt: normalizeString(time),
    })

    inSearchSection = false
    i += 4
  }

  return comments
}

class DouyinService {
  constructor() {
    this.qrImagePath = QR_IMAGE_PATH
    this.videoMaxBytes = VIDEO_MAX_BYTES
    this.loginSessions = new Map()
    this.validationCache = {
      cookieHeader: "",
      state: "unknown",
      userInfo: null,
      checkedAt: 0,
    }
    this.downloader = new Download(env.RootPath)
  }

  ensureTempDirs() {
    ensureDir(TEMP_DIR)
    ensureDir(TEMP_VIDEO_DIR)
    ensureDir(BROWSER_PROFILE_ROOT)
  }

  createLoginProfileDir() {
    this.ensureTempDirs()
    return fs.mkdtempSync(path.join(BROWSER_PROFILE_ROOT, "session-"))
  }

  getLoginLaunchOptions(profileDir) {
    return buildLaunchOptions({ profileDir })
  }

  async prepareLoginPage(page, { lightweight = false } = {}) {
    if (lightweight && !page.__douyinRequestInterceptionInstalled) {
      await page.setRequestInterception(true)
      page.on("request", request => {
        if (shouldBlockLoginRequest(request)) {
          void request.abort().catch(() => {})
          return
        }
        void request.continue().catch(() => {})
      })
      page.__douyinRequestInterceptionInstalled = true
    }

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined })
      window.chrome = window.chrome || { runtime: {} }
      Object.defineProperty(navigator, "languages", { get: () => ["zh-CN", "zh", "en"] })
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] })

      const silenceMedia = node => {
        if (!node || typeof node !== "object") return
        if (typeof node.pause === "function") {
          try {
            node.pause()
          } catch {}
        }
        try {
          node.autoplay = false
          node.muted = true
          node.loop = false
          node.preload = "none"
          if (typeof node.removeAttribute === "function") node.removeAttribute("autoplay")
        } catch {}
      }

      const silencePageMedia = () => {
        for (const media of document.querySelectorAll("video,audio")) silenceMedia(media)
      }

      document.addEventListener("DOMContentLoaded", () => {
        silencePageMedia()
        const observer = new MutationObserver(() => silencePageMedia())
        observer.observe(document.documentElement || document.body, {
          childList: true,
          subtree: true,
        })
      })
    })
    await page.setUserAgent(USER_AGENT)
    await page.setExtraHTTPHeaders({
      "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
      referer: WEB_REFERER,
    })
    await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 1 })
  }

  async applyAuthCookiesToPage(page, auth = null) {
    const cookies = normalizeCookies(auth?.cookies)
    const entries = Object.entries(cookies)
    if (entries.length === 0) return

    await page.setCookie(
      ...entries.map(([name, value]) => ({
        name,
        value,
        domain: ".douyin.com",
        path: "/",
        httpOnly: false,
        secure: true,
      })),
    )
  }

  async readLoginModalState(page) {
    return await page.evaluate(() => {
      const modal = document.querySelector(".douyin_login_new_class")
      if (!modal) return { exists: false, text: "", qrDataUrl: "" }

      const getText = node => String(node?.innerText || node?.textContent || "").trim()
      let qrImage = modal.querySelector('#douyin_login_comp_scan_code img[src^="data:image/"]')
      if (!qrImage) {
        const qrTab = [...modal.querySelectorAll("*")].find(
          node => getText(node) === "扫码登录" || getText(node).includes("扫码登录"),
        )
        qrTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
        qrImage = modal.querySelector('img[src^="data:image/"]')
      }

      return {
        exists: true,
        text: getText(modal),
        qrDataUrl: String(qrImage?.getAttribute("src") || "").trim(),
      }
    })
  }

  saveQrDataUrl(dataUrl) {
    const parsed = parseDataUrl(dataUrl)
    if (!parsed?.buffer?.length) {
      throw createError("未找到抖音扫码二维码", "DOUYIN_QR_INVALID")
    }

    this.ensureTempDirs()
    cleanupFile(this.qrImagePath)
    fs.writeFileSync(this.qrImagePath, parsed.buffer)
    return this.qrImagePath
  }

  async tryOpenLoginModal(page) {
    return await page.evaluate(() => {
      const modal = document.querySelector(".douyin_login_new_class")
      if (modal) return true

      const clickable = [...document.querySelectorAll("button,a,div,span")]
      const candidate = clickable.find(node => {
        const text = String(node?.innerText || node?.textContent || "").trim()
        const id = String(node?.id || "")
        const cls = String(node?.className || "")
        return (
          text === "登录" ||
          /login/i.test(`${id} ${cls}`) ||
          id === "douyin_login_comp_btn_id"
        )
      })

      if (candidate) {
        candidate.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
        return true
      }

      return false
    })
  }

  async captureQrImageFromPage(page) {
    this.ensureTempDirs()
    cleanupFile(this.qrImagePath)

    const selectors = [
      '#douyin_login_comp_scan_code img[aria-label="二维码"]',
      '#douyin_login_comp_scan_code img',
      '#animate_qrcode_container img',
      '.douyin_login_new_class img[aria-label="二维码"]',
      '#douyin_login_comp_scan_code',
      '#animate_qrcode_container',
      '.douyin_login_new_class .pE9ZOPEo',
    ]

    for (const selector of selectors) {
      const handle = await page.$(selector)
      if (!handle) continue
      try {
        const box = await handle.boundingBox()
        if (!box || box.width < 80 || box.height < 80) continue
        await handle.screenshot({ path: this.qrImagePath })
        if (fs.existsSync(this.qrImagePath) && fs.statSync(this.qrImagePath).size > 0) {
          return this.qrImagePath
        }
      } catch {}
    }

    const modalState = await this.readLoginModalState(page)
    if (modalState?.qrDataUrl) {
      return this.saveQrDataUrl(modalState.qrDataUrl)
    }

    throw createError("未找到抖音扫码二维码", "DOUYIN_QR_INVALID")
  }

  async waitForLoginModal(page, timeoutMs = 20000) {
    const startedAt = Date.now()
    let clicked = false
    while (Date.now() - startedAt < timeoutMs) {
      const state = await this.readLoginModalState(page).catch(() => ({ exists: false }))
      if (state?.exists) return state
      if (!clicked) {
        clicked = await this.tryOpenLoginModal(page).catch(() => false)
      }
      await delay(500)
    }
    return { exists: false, text: "", qrDataUrl: "" }
  }

  async getLoginSessionCookies(page) {
    const list = await page.cookies(WEB_REFERER).catch(() => [])
    const out = {}
    for (const item of Array.isArray(list) ? list : []) {
      const name = String(item?.name || "").trim()
      const value = String(item?.value || "").trim()
      if (!name || !value) continue
      out[name] = value
    }
    return out
  }

  async closeLoginSession(token) {
    const session = this.loginSessions.get(token)
    this.loginSessions.delete(token)
    if (!session) return
    try {
      await session.page?.close?.()
    } catch {}
    try {
      await session.browser?.close?.()
    } catch {}
    cleanupDir(session.profileDir)
  }

  async startQrLogin() {
    this.ensureTempDirs()
    for (const token of [...this.loginSessions.keys()]) {
      await this.closeLoginSession(token)
    }

    const profileDir = this.createLoginProfileDir()
    const browser = await puppeteer.launch(this.getLoginLaunchOptions(profileDir)).catch(err => {
      cleanupDir(profileDir)
      throw createError(err?.message || "启动浏览器失败", "DOUYIN_QR_FAILED")
    })

    const page = await browser.newPage()
    try {
      await this.prepareLoginPage(page, { lightweight: true })
      await page.goto(LOGIN_ENTRY_URL, {
        waitUntil: "domcontentloaded",
        timeout: 120000,
      })
      await delay(3000)

      const title = await page.title().catch(() => "")
      if (String(title).includes("验证码中间页")) {
        throw createError("抖音登录页被验证码中间页拦截，请稍后重试", "DOUYIN_QR_BLOCKED")
      }

      const modalState = await this.waitForLoginModal(page)
      if (!modalState?.exists) {
        throw createError("未找到抖音扫码二维码", "DOUYIN_QR_INVALID")
      }

      const imagePath = await this.captureQrImageFromPage(page)
      const initialCookies = await this.getLoginSessionCookies(page)
      const token = randomUUID()
      this.loginSessions.set(token, {
        token,
        browser,
        page,
        profileDir,
        createdAt: Date.now(),
        initialCookieHeader: buildCookieHeader(initialCookies),
      })
      return {
        token,
        qrUrl: "",
        imagePath,
      }
    } catch (err) {
      try {
        await page.close()
      } catch {}
      try {
        await browser.close()
      } catch {}
      cleanupDir(profileDir)
      throw err
    }
  }

  async fetchSelfUserInfo(auth = null) {
    let lastError = null
    for (const endpoint of SELF_INFO_ENDPOINTS) {
      try {
        const url = buildUrl(endpoint.url, endpoint.query)
        const { data } = await requestJson(url, {
          headers: buildHeaders(auth),
        })
        const payload = data?.data ?? data
        const userInfo =
          normalizeUserInfo(payload?.user_info) ||
          normalizeUserInfo(payload?.userInfo) ||
          normalizeUserInfo(payload?.data) ||
          normalizeUserInfo(payload)

        if (userInfo) return userInfo

        const message = normalizeString(data?.message ?? payload?.message)
        if (/未登录|login/i.test(message)) {
          throw createError(message || "抖音登录已失效", "DOUYIN_AUTH_INVALID")
        }
      } catch (err) {
        lastError = err
        if (err?.code === "DOUYIN_AUTH_INVALID") throw err
      }
    }

    if (lastError?.code === "DOUYIN_AUTH_INVALID") throw lastError
    return null
  }

  async finalizeQrLogin(result = {}) {
    let cookies = normalizeCookies(result?.cookies)

    const cookieHeader = buildCookieHeader(cookies)
    if (!cookieHeader) {
      throw createError("抖音登录成功，但未拿到有效 Cookie", "DOUYIN_COOKIE_EMPTY")
    }

    const auth = {
      cookieHeader,
      cookies,
      userInfo: {},
      updatedAt: new Date().toISOString(),
    }

    const userInfo =
      (await this.fetchSelfUserInfo(auth).catch(err => {
        if (err?.code === "DOUYIN_AUTH_INVALID") throw err
        return normalizeUserInfo(result?.raw?.user_info) || normalizeUserInfo(result?.raw?.userInfo)
      })) || {}

    const saved = writeDouyinAuth({
      ...auth,
      userInfo,
      updatedAt: new Date().toISOString(),
    })
    this.validationCache = {
      cookieHeader: saved.cookieHeader,
      state: "valid",
      userInfo,
      checkedAt: Date.now(),
    }
    return saved
  }

  async pollQrLogin(token) {
    const qrToken = normalizeString(token)
    if (!qrToken) throw createError("二维码 token 缺失", "DOUYIN_QR_TOKEN_MISSING")
    const session = this.loginSessions.get(qrToken)
    if (!session?.page || !session?.browser) {
      throw createError("二维码会话不存在或已结束", "DOUYIN_QR_TOKEN_MISSING")
    }

    try {
      const cookies = await this.getLoginSessionCookies(session.page)
      const nextCookieHeader = buildCookieHeader(cookies)
      const cookiesChanged =
        normalizeString(nextCookieHeader) !== normalizeString(session.initialCookieHeader)
      if (hasAuthenticatedCookies(cookies) && cookiesChanged) {
        const authPreview = {
          cookieHeader: nextCookieHeader,
          cookies,
        }
        const userInfo = await this.fetchSelfUserInfo(authPreview).catch(err => {
          if (err?.code === "DOUYIN_AUTH_INVALID") return null
          logger.warn?.(`[Douyin] 登录态确认失败，改为直接保存 Cookie：${err?.message || err}`)
          return null
        })

        const auth = await this.finalizeQrLogin({
          cookies,
          raw: hasResolvedUserInfo(userInfo) ? { user_info: userInfo } : {},
        })
        await this.closeLoginSession(qrToken)
        return {
          status: "success",
          auth,
          userInfo: auth.userInfo,
          message: "登录成功",
        }
      }

      const modalState = await this.readLoginModalState(session.page).catch(() => ({
        exists: false,
        text: "",
        qrDataUrl: "",
      }))
      const modalText = normalizeString(modalState?.text)

      if (/已失效|过期|二维码失效|二维码过期/i.test(modalText)) {
        await this.closeLoginSession(qrToken)
        return {
          status: "expired",
          message: "二维码已过期",
          raw: { text: modalText },
        }
      }

      if (/已扫码|请在抖音APP内确认|确认登录|确认后登录/i.test(modalText)) {
        return {
          status: "scanned",
          message: "已扫码，请在抖音 App 内确认登录",
          raw: { text: modalText },
        }
      }

      return {
        status: "pending",
        message: "等待扫码",
        raw: { text: modalText },
      }
    } catch (err) {
      await this.closeLoginSession(qrToken).catch(() => {})
      throw err
    }
  }

  async ensureAuthorizedSession() {
    const auth = readDouyinAuth()
    if (!auth?.cookieHeader) {
      return { ok: false, reason: "missing" }
    }

    if (!hasResolvedUserInfo(auth?.userInfo) && !hasAuthenticatedCookies(auth?.cookies)) {
      clearDouyinAuth()
      return { ok: false, reason: "missing" }
    }

    if (
      this.validationCache.cookieHeader === auth.cookieHeader &&
      Date.now() - this.validationCache.checkedAt < 60 * 1000
    ) {
      if (this.validationCache.state === "invalid") return { ok: false, reason: "expired" }
      return {
        ok: true,
        auth: {
          ...auth,
          userInfo: auth.userInfo || this.validationCache.userInfo || {},
        },
      }
    }

    try {
      const userInfo = await this.fetchSelfUserInfo(auth)
      if (userInfo) {
        const next = writeDouyinAuth({
          ...auth,
          userInfo,
          updatedAt: new Date().toISOString(),
        })
        this.validationCache = {
          cookieHeader: next.cookieHeader,
          state: "valid",
          userInfo,
          checkedAt: Date.now(),
        }
        return { ok: true, auth: next }
      }
    } catch (err) {
      if (err?.code === "DOUYIN_AUTH_INVALID") {
        clearDouyinAuth()
        this.validationCache = {
          cookieHeader: auth.cookieHeader,
          state: "invalid",
          userInfo: null,
          checkedAt: Date.now(),
        }
        return { ok: false, reason: "expired" }
      }
      logger.warn?.(`[Douyin] 登录校验失败，暂按已有 Cookie 继续：${err?.message || err}`)
    }

    this.validationCache = {
      cookieHeader: auth.cookieHeader,
      state: "unknown",
      userInfo: auth.userInfo || null,
      checkedAt: Date.now(),
    }
    return { ok: true, auth }
  }

  async resolveShareUrl(url) {
    const raw = normalizeString(url)
    if (!raw) throw createError("抖音链接为空", "DOUYIN_INVALID_URL")

    let target
    try {
      target = new URL(raw)
    } catch {
      throw createError("未识别到有效的抖音链接", "DOUYIN_INVALID_URL")
    }

    if (!DOUYIN_HOST_RE.test(target.hostname)) {
      throw createError("未识别到有效的抖音链接", "DOUYIN_INVALID_URL")
    }

    const isShortLink = /^v\.douyin\.com$/i.test(target.hostname) || /\/share\//i.test(target.pathname)
    if (!isShortLink) return target.toString()

    try {
      const { response } = await requestText(target.toString(), {
        headers: buildHeaders(null, {
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }),
        redirect: "follow",
      })
      return response?.url || target.toString()
    } catch (err) {
      throw createError(err?.message || "抖音短链展开失败", "DOUYIN_RESOLVE_FAILED")
    }
  }

  async fetchAwemePage(url, auth = null) {
    const { response, text } = await requestText(url, {
      headers: buildHeaders(auth, {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      }),
      redirect: "follow",
    })
    if (!response.ok) {
      throw createError(`请求作品页面失败：${response.status}`, "DOUYIN_PAGE_FAILED")
    }
    return {
      url: response.url || url,
      html: text,
    }
  }

  async fetchRenderedAwemePage(url, auth = null) {
    const browser = await puppeteer.launch(buildLaunchOptions())

    const page = await browser.newPage()
    try {
      await this.prepareLoginPage(page)
      await this.applyAuthCookiesToPage(page, auth)
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 120000,
      })
      await delay(8000)
      const candidate = await page.evaluate(currentUrl => {
        const bodyText = String(document.body?.innerText || "")
        const findMeta = keys => {
          for (const key of keys) {
            const el = document.querySelector(`meta[name="${key}"], meta[property="${key}"]`)
            const value = String(el?.getAttribute("content") || "").trim()
            if (value) return value
          }
          return ""
        }
        const parseDesc = text => {
          const source = String(text || "").trim()
          if (!source) return ""
          const matched = source.match(/^([\s\S]*?)\s*-\s*.+?于\d{4,}/)
          return String((matched?.[1] || source).trim())
        }
        const parseAuthor = text => {
          const source = String(text || "").trim()
          if (!source) return ""
          const matched = source.match(/-\s*(.+?)于\d{4,}/)
          return String((matched?.[1] || "").trim())
        }
        const recommendationTop = [...document.querySelectorAll("*")]
          .find(node => String(node?.innerText || "").trim() === "推荐视频")
          ?.getBoundingClientRect?.().top
        const maxTop = Number.isFinite(recommendationTop) ? recommendationTop : Number.POSITIVE_INFINITY
        const images = [...document.querySelectorAll("img")]
          .map(img => {
            const rect = img.getBoundingClientRect()
            return {
              src: String(img.currentSrc || img.src || "").trim(),
              alt: String(img.alt || "").trim(),
              w: Number(img.naturalWidth || rect.width || 0),
              h: Number(img.naturalHeight || rect.height || 0),
              top: Number(rect.top || 0),
            }
          })
          .filter(item => item.src && !item.src.startsWith("data:"))
          .filter(item => item.w >= 200 && item.h >= 200)
          .filter(item => item.top < maxTop)
          .filter(
            item =>
              !/avatar|emoji|twemoji|logo|icon/i.test(item.src) &&
              !/avatar|emoji|logo|icon/i.test(item.alt),
          )
        const uniqueImages = [...new Set(images.map(item => item.src))]
        const userAnchor = [...document.querySelectorAll('a[href*="/user/"]')]
          .map(anchor => ({
            text: String(anchor.innerText || "").trim(),
            href: String(anchor.href || "").trim(),
          }))
          .find(item => item.text && !/^(登录|我的)$/.test(item.text))
        const description = findMeta(["description", "og:description", "twitter:description"])
        const title = String(document.title || "").replace(/\s*-\s*抖音$/, "").trim()
        const desc = parseDesc(description) || title
        const authorName = userAnchor?.text || parseAuthor(description) || ""
        const publishMatched = bodyText.match(/发布时间[：:]\s*([^\n]+)/)
        const video = document.querySelector("video")
        const videoSrc = String(video?.currentSrc || video?.src || "").trim()
        const poster = String(video?.poster || "").trim()
        const duration = Number(video?.duration || 0)
        const idMatched = String(currentUrl || document.location.href || "").match(/\/(video|note)\/(\d+)/i)
        return {
          aweme_id: String(idMatched?.[2] || ""),
          desc,
          author: {
            nickname: authorName || "抖音用户",
          },
          create_time: publishMatched?.[1] ? Date.parse(publishMatched[1]) || undefined : undefined,
          video: videoSrc
            ? {
                play_addr: {
                  url_list: [videoSrc],
                },
                cover: {
                  url_list: [poster || uniqueImages[0] || ""],
                },
                duration: Number.isFinite(duration) && duration > 0 ? Math.round(duration * 1000) : 0,
              }
            : undefined,
          image_post_info:
            !videoSrc && uniqueImages.length > 0
              ? {
                  images: uniqueImages.slice(0, 9).map(src => ({
                    display_image: {
                      url_list: [src],
                    },
                  })),
                }
              : undefined,
        }
      }, url)
      return {
        url: page.url() || url,
        html: await page.content(),
        candidate,
        bodyText: await page.evaluate(() => String(document.body?.innerText || "")),
      }
    } finally {
      try {
        await page.close()
      } catch {}
      try {
        await browser.close()
      } catch {}
    }
  }

  findAwemeFromHtml(html, awemeId = "") {
    const candidateRoots = extractJsonCandidatesFromHtml(html)
    for (const root of candidateRoots) {
      const candidates = findCandidateNodes(root)
      const matched =
        candidates.find(item => awemeId && extractAwemeId(item) === awemeId) ||
        candidates.find(item => normalizeString(item?.desc || item?.title)) ||
        candidates[0] ||
        null
      if (matched) return matched
    }
    return null
  }

  async fetchAwemeByApi(awemeId, auth = null) {
    let lastError = null
    for (const endpoint of DETAIL_ENDPOINTS) {
      try {
        const url = buildUrl(endpoint.url, endpoint.buildQuery(awemeId))
        const { data } = await requestJson(url, {
          headers: buildHeaders(auth),
        })
        const candidates = findCandidateNodes(data)
        const matched = candidates.find(item => extractAwemeId(item) === awemeId) || candidates[0]
        if (matched) return matched
        const message = normalizeString(data?.message ?? data?.status_msg)
        if (/私密|删除|not found|不存在/i.test(message)) {
          throw createError(message || "作品不可访问", "DOUYIN_AWEME_UNAVAILABLE")
        }
      } catch (err) {
        lastError = err
        if (err?.code === "DOUYIN_AWEME_UNAVAILABLE") throw err
      }
    }
    if (lastError?.code && lastError.code !== "DOUYIN_BAD_JSON") throw lastError
    return null
  }

  async getAwemeDetail(rawUrl, auth = null) {
    const resolvedUrl = await this.resolveShareUrl(rawUrl)
    const page = await this.fetchAwemePage(resolvedUrl, auth)
    const urlMatch = page.url.match(/\/(video|note)\/(\d+)/i)
    const awemeId = normalizeString(urlMatch?.[2])
    let aweme = this.findAwemeFromHtml(page.html, awemeId)
    let sourceUrl = page.url || resolvedUrl

    if (!aweme) {
      try {
        const renderedPage = await this.fetchRenderedAwemePage(resolvedUrl, auth)
        aweme =
          this.findAwemeFromHtml(renderedPage.html, awemeId) ||
          (extractAwemeId(renderedPage.candidate) ? renderedPage.candidate : null)
        if (aweme) sourceUrl = renderedPage.url || sourceUrl
      } catch (err) {
        logger.warn?.(`[Douyin] 浏览器渲染页解析失败，继续尝试 API：${err?.message || err}`)
      }
    }

    if (!aweme && awemeId) {
      aweme = await this.fetchAwemeByApi(awemeId, auth)
    }

    if (!aweme) {
      throw createError("未能解析抖音作品详情", "DOUYIN_PARSE_FAILED")
    }

    return normalizeDouyinAweme(aweme, {
      sourceUrl,
    })
  }

  async fetchHotComments(awemeId, auth = null, limit = 10, sourceUrl = "") {
    const safeLimit = Math.max(1, Math.min(10, Math.floor(Number(limit) || 10)))
    let lastError = null
    for (const endpoint of COMMENT_ENDPOINTS) {
      try {
        const url = buildUrl(endpoint.url, endpoint.buildQuery(awemeId, safeLimit))
        const { data } = await requestJson(url, {
          headers: buildHeaders(auth),
        })
        const payload = data?.data ?? data
        const list =
          (Array.isArray(payload?.comments) ? payload.comments : null) ||
          (Array.isArray(payload?.comment_list) ? payload.comment_list : null) ||
          []
        return list.map(normalizeComment).filter(Boolean).slice(0, safeLimit)
      } catch (err) {
        lastError = err
      }
    }

    if (lastError) {
      try {
        const renderedPage = await this.fetchRenderedAwemePage(
          sourceUrl || `https://www.douyin.com/video/${awemeId}`,
          auth,
        )
        const comments = extractCommentsFromRenderedText(renderedPage?.bodyText || "", safeLimit)
        if (comments.length > 0) return comments
      } catch (err) {
        logger.warn?.(`[Douyin] 评论 DOM 回退失败：${err?.message || err}`)
      }
      throw lastError
    }
    return []
  }

  async downloadVideoFile(videoUrl, awemeId) {
    const targetUrl = normalizeString(videoUrl)
    if (!targetUrl) throw createError("未找到可下载的视频地址", "DOUYIN_VIDEO_URL_MISSING")

    this.ensureTempDirs()
    const safeId = normalizeString(awemeId || Date.now()).replace(/[^\w-]/g, "_") || `douyin_${Date.now()}`
    const relativePath = path.posix.join("temp", "douyin", "video", `${safeId}.mp4`)

    await this.downloader.downloadFile(targetUrl, relativePath, {
      headers: {
        referer: WEB_REFERER,
        "user-agent": USER_AGENT,
      },
      maxBytes: this.videoMaxBytes,
    })

    return path.join(ROOT_PATH, relativePath)
  }

  cleanupFiles(paths = []) {
    for (const item of Array.isArray(paths) ? paths : [paths]) {
      cleanupFile(item)
    }
  }

  cleanupQrImage() {
    cleanupFile(this.qrImagePath)
  }

  __resetForTests() {
    for (const token of [...this.loginSessions.keys()]) {
      void this.closeLoginSession(token)
    }
    this.loginSessions.clear()
    this.validationCache = {
      cookieHeader: "",
      state: "unknown",
      userInfo: null,
      checkedAt: 0,
    }
    this.cleanupQrImage()
    try {
      if (fs.existsSync(TEMP_VIDEO_DIR)) {
        for (const entry of fs.readdirSync(TEMP_VIDEO_DIR)) {
          cleanupFile(path.join(TEMP_VIDEO_DIR, entry))
        }
      }
    } catch {}
  }
}

export {
  buildLaunchOptions,
  extractFirstDouyinUrlFromText,
  extractFirstDouyinUrlFromValue,
  formatCount,
  formatShortText,
  normalizeDouyinAweme,
  normalizeTimestamp,
}

export default new DouyinService()
