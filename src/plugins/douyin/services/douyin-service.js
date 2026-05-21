import fs from "node:fs"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { createRequire } from "node:module"

import { load } from "cheerio"
import fetch from "node-fetch"
import puppeteer from "puppeteer"

import Download from "../../../utils/download.js"
import {
  clearDouyinAuth,
  getDouyinDataDir,
  readDouyinAuth,
  writeDouyinAuth,
} from "../model/auth-store.js"
import {
  BROWSER_PROFILE_ROOT,
  LOGIN_WINDOW_ENV,
  MOBILE_DOUYIN_USER_AGENT,
  QR_IMAGE_PATH,
  ROOT_PATH,
  TEMP_DIR,
  TEMP_VIDEO_DIR,
  USER_AGENT,
  VIDEO_MAX_BYTES,
  WEB_REFERER,
  buildLaunchOptions,
  cleanupDir,
  cleanupFile,
  delay,
  ensureDir,
  parseDataUrl,
} from "./douyin-runtime.js"

const require = createRequire(import.meta.url)
const { generate_a_bogus } = require("../utils/a-bogus.cjs")
const { sign: generate_x_bogus } = require("../utils/x-bogus.cjs")

function toRootRelativePath(filePath = "") {
  return path.relative(ROOT_PATH, filePath).replace(/\\/g, "/")
}

const LOGIN_QUERY_TEMPLATE = {
  passport_jssdk_version: "3.1.3",
  passport_jssdk_type: "normal",
  is_from_ttaccountsdk: "1",
  aid: "6383",
  language: "zh",
  account_app_language: "zh-CN",
  next: "https://www.douyin.com",
  service: WEB_REFERER,
  correct_service: WEB_REFERER,
  need_short_url: "true",
  need_logo: "false",
  is_new_login: "1",
  is_from_iesaccountsaas: "1",
  p_ui: "2.1.9-alpha.6",
  p_ca: "4.0.17",
  p_ca_real: "1.0.0.753",
  account_sdk_source: "web",
  p_js_v: "3.1.3",
  p_js_t: "pro",
  p_zt: "3.3.10",
  p_ver: "1.1.3",
  p_ver_real: "0",
  request_host: encodeURIComponent(WEB_REFERER),
  p_bd: "1.0.1.19-fix.01",
  device_platform: "web_app",
}
const LOGIN_QR_ENDPOINTS = [
  {
    url: "https://login.douyin.com/passport/web/get_qrcode/",
    query: {
      aid: "6383",
    },
  },
]
const LOGIN_QR_POLL_ENDPOINTS = [
  {
    url: "https://login.douyin.com/passport/web/check_qrconnect/",
    buildQuery(token) {
      return {
        aid: "6383",
        token,
      }
    },
  },
]
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
const QR_API_CONFIG_PATH = path.join(getDouyinDataDir(), "qr-api.json")

function readQrApiConfig() {
  try {
    if (!fs.existsSync(QR_API_CONFIG_PATH)) return {}
    const data = JSON.parse(fs.readFileSync(QR_API_CONFIG_PATH, "utf8"))
    if (!data || typeof data !== "object" || Array.isArray(data)) return {}
    return data
  } catch (err) {
    logger.warn?.(`[Douyin] 读取二维码接口配置失败：${err?.message || err}`)
    return {}
  }
}

function applyTemplateParams(input = "", params = {}) {
  let output = String(input || "")
  for (const [key, value] of Object.entries(params || {})) {
    const token = `{{${key}}}`
    output = output.split(token).join(String(value ?? ""))
  }
  return output
}

function parseUrlQuery(input = "") {
  const source = normalizeString(input)
  if (!source) return {}
  try {
    const url = new URL(source)
    return Object.fromEntries(url.searchParams.entries())
  } catch {
    try {
      return Object.fromEntries(new URLSearchParams(source).entries())
    } catch {
      return {}
    }
  }
}

function getLoginQrEndpoints() {
  const customUrl =
    normalizeString(readQrApiConfig()?.get_qrcode_url) ||
    normalizeString(process.env.DOUYIN_QR_API_URL)
  return customUrl ? [{ url: customUrl, query: {} }, ...LOGIN_QR_ENDPOINTS] : LOGIN_QR_ENDPOINTS
}

function getLoginQrPollEndpoints() {
  const customUrl =
    normalizeString(readQrApiConfig()?.check_qrconnect_url) ||
    normalizeString(process.env.DOUYIN_QR_POLL_API_URL)
  if (!customUrl) return LOGIN_QR_POLL_ENDPOINTS
  return [
    {
      url: customUrl,
      buildQuery(token) {
        return { token }
      },
    },
    ...LOGIN_QR_POLL_ENDPOINTS,
  ]
}

function createError(message, code, extra = {}) {
  const err = new Error(message)
  err.code = code
  Object.assign(err, extra)
  return err
}

function shouldBlockLoginRequest(request) {
  const type = normalizeString(request?.resourceType?.())
  if (["media", "font", "websocket", "eventsource", "manifest"].includes(type)) return true

  const url = normalizeString(request?.url?.()).toLowerCase()
  if (!url) return false

  if (/(\.mp4|\.m3u8|\.mp3)(\?|$)/i.test(url)) return true
  if (/(?:^|\/)(?:aweme|feed)\/v\d+\/(?:web\/)?feed/i.test(url)) return true
  if (/\/recommend\//i.test(url) || /webcast/i.test(url) || /live\.douyin\.com/i.test(url))
    return true

  return false
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

function parseCookieHeader(cookieHeader = "") {
  const out = {}
  for (const part of String(cookieHeader || "").split(";")) {
    const raw = String(part || "").trim()
    if (!raw) continue
    const separator = raw.indexOf("=")
    if (separator <= 0) continue
    const key = raw.slice(0, separator).trim()
    const value = raw.slice(separator + 1).trim()
    if (!key || !value) continue
    out[key] = value
  }
  return out
}

function getResponseCookies(response) {
  return parseSetCookieArray(response?.headers?.raw?.()["set-cookie"] || [])
}

function getResponseLocation(response) {
  return normalizeString(response?.headers?.get?.("location"))
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

async function requestJsonWithCookies(url, { cookies = {}, headers = {}, ...options } = {}) {
  const cookieHeader = buildCookieHeader(cookies)
  const { response, data } = await requestJson(url, {
    ...options,
    headers: {
      ...headers,
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
  })
  return {
    response,
    data,
    cookies: mergeCookies(cookies, getResponseCookies(response)),
  }
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

function normalizeBooleanString(value, defaultValue = false) {
  const source = normalizeString(value).toLowerCase()
  if (["1", "true", "yes", "on"].includes(source)) return true
  if (["0", "false", "no", "off"].includes(source)) return false
  return defaultValue
}

function resolveAbsoluteUrl(input, baseUrl = WEB_REFERER) {
  const source = normalizeString(input)
  if (!source) return ""
  try {
    return new URL(source, baseUrl).toString()
  } catch {
    return source
  }
}

function randomHex(size = 16) {
  return randomUUID().replace(/-/g, "").slice(0, Math.max(1, size))
}

function createMsToken() {
  return `${randomUUID().replace(/-/g, "")}${Date.now().toString(36)}`
}

function parseDouyinQrStatus(payload = {}) {
  const data = payload?.data ?? payload
  const numericStatus = Number(
    data?.status ??
      data?.qrconnect_status ??
      data?.check_status ??
      data?.status_code ??
      data?.check_status_code ??
      payload?.status,
  )
  const statusText = normalizeString(
    data?.status ??
      data?.qrconnect_status ??
      data?.check_status ??
      data?.status_msg ??
      data?.message ??
      payload?.message,
  ).toLowerCase()
  const statusCode = Number(data?.status_code ?? data?.check_status_code)
  const confirmUrl = resolveAbsoluteUrl(
    data?.redirect_url ?? data?.redirectUrl ?? data?.confirm_url ?? data?.confirmUrl,
  )

  if (confirmUrl) {
    return {
      status: "success",
      message: "登录成功",
      redirectUrl: confirmUrl,
      raw: data,
    }
  }

  if (
    /confirm|success|scan confirmed|authorized|login success/i.test(statusText) ||
    [3, 200, 20000].includes(numericStatus) ||
    [3, 200, 20000].includes(statusCode)
  ) {
    return {
      status: "success",
      message: "登录成功",
      redirectUrl: confirmUrl,
      raw: data,
    }
  }

  if (
    /scan|scanned|confirming|waiting_confirm|已扫码|确认登录/i.test(statusText) ||
    [2, 1002].includes(numericStatus) ||
    [2, 1002].includes(statusCode)
  ) {
    return {
      status: "scanned",
      message: "已扫码，请在抖音 App 内确认登录",
      raw: data,
    }
  }

  if (
    /expired|timeout|invalid|cancel|过期|失效/i.test(statusText) ||
    [4, 5, 1004, 1005].includes(numericStatus) ||
    [4, 5, 1004, 1005].includes(statusCode)
  ) {
    return {
      status: "expired",
      message: "二维码已过期",
      raw: data,
    }
  }

  return {
    status: "pending",
    message: "等待扫码",
    raw: data,
  }
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
    diggCount: pickNumber(
      source?.digg_count,
      source?.diggCount,
      source?.like_count,
      source?.likeCount,
    ),
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

function pickLastUrl(value) {
  if (!value) return ""
  if (typeof value === "string") {
    const text = value.trim()
    return /^https?:\/\//i.test(text) ? text : ""
  }
  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const found = pickLastUrl(value[index])
      if (found) return found
    }
    return ""
  }
  if (typeof value === "object") {
    return (
      pickLastUrl(value.url_list) ||
      pickLastUrl(value.urlList) ||
      pickLastUrl(value.uri) ||
      pickLastUrl(value.url) ||
      pickLastUrl(value.src) ||
      ""
    )
  }
  return ""
}

function pickVideoUrl(video = {}) {
  const source = video && typeof video === "object" ? video : {}
  return normalizeVideoStreams(source)[0]?.url || ""
}

function normalizePositiveNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : 0
}

function normalizeDurationSecondsByScale(value, scale = 1) {
  const num = normalizePositiveNumber(value)
  const divisor = normalizePositiveNumber(scale) || 1
  if (!num) return 0
  return Math.max(1, Math.round(num / divisor))
}

function estimateDurationSecondsByDataSize(dataSize = 0, bitRate = 0) {
  const size = normalizePositiveNumber(dataSize)
  const rate = normalizePositiveNumber(bitRate)
  if (!size || !rate) return 0
  return Math.max(1, Math.round((size * 8) / rate))
}

function estimateDurationSecondsByStreams(streams = []) {
  const estimates = (Array.isArray(streams) ? streams : [])
    .map(stream =>
      estimateDurationSecondsByDataSize(
        stream?.dataSize ?? stream?.data_size,
        stream?.bitRate ?? stream?.bit_rate,
      ),
    )
    .filter(value => Number.isFinite(value) && value > 0 && value <= 4 * 3600)

  if (estimates.length === 0) return 0
  estimates.sort((a, b) => a - b)
  return estimates[Math.floor(estimates.length / 2)]
}

function normalizeVideoDurationSeconds(value, { estimatedSec = 0 } = {}) {
  const num = normalizePositiveNumber(value)
  if (!num) return 0

  const candidates = []
  const seen = new Set()
  const pushCandidate = (seconds, priority) => {
    const normalized = Math.floor(normalizePositiveNumber(seconds))
    if (!normalized || normalized > 4 * 3600 || seen.has(normalized)) return
    seen.add(normalized)
    candidates.push({ seconds: normalized, priority })
  }

  if (num <= 1000) {
    pushCandidate(num, 100)
  } else {
    pushCandidate(normalizeDurationSecondsByScale(num, 1000), 100)
    pushCandidate(Math.floor(num), 10)
  }

  if (num >= 1000000) {
    pushCandidate(normalizeDurationSecondsByScale(num, 1000000), 90)
  }

  if (candidates.length === 0) return 0

  if (estimatedSec > 0) {
    candidates.sort((a, b) => {
      const aRatio = Math.abs(a.seconds - estimatedSec) / Math.max(estimatedSec, 1)
      const bRatio = Math.abs(b.seconds - estimatedSec) / Math.max(estimatedSec, 1)
      if (aRatio !== bRatio) return aRatio - bRatio
      return b.priority - a.priority
    })
    return candidates[0]?.seconds || 0
  }

  candidates.sort((a, b) => b.priority - a.priority)
  return candidates[0]?.seconds || 0
}

function shouldPreferMusicDuration(videoDuration = 0, musicDuration = 0) {
  const videoSec = Math.floor(normalizePositiveNumber(videoDuration))
  const musicSec = Math.floor(normalizePositiveNumber(musicDuration))
  if (!videoSec || !musicSec) return false
  const larger = Math.max(videoSec, musicSec)
  const smaller = Math.min(videoSec, musicSec)
  return smaller > 0 && larger / smaller >= 900
}

function normalizeMusicData(candidate = {}) {
  const source = candidate && typeof candidate === "object" ? candidate : {}
  const music =
    (source?.music && typeof source.music === "object" ? source.music : null) ||
    (source?.music_info && typeof source.music_info === "object" ? source.music_info : null) ||
    (source?.musicInfo && typeof source.musicInfo === "object" ? source.musicInfo : null) ||
    {}

  return {
    id: normalizeString(music?.id ?? music?.mid ?? music?.music_id ?? music?.musicId),
    title: normalizeString(music?.title ?? music?.music_name ?? music?.musicName ?? music?.name),
    author: normalizeString(
      music?.author ?? music?.owner_nickname ?? music?.ownerNickname ?? music?.artist,
    ),
    duration: Math.floor(
      normalizePositiveNumber(
        music?.duration ?? music?.duration_s ?? music?.durationSec ?? music?.duration_sec,
      ),
    ),
  }
}

function pickVideoDurationSeconds(source = {}, video = {}, streams = [], musicDuration = 0) {
  const addressDurationFields = [
    video?.download_addr?.duration,
    video?.downloadAddr?.duration,
    video?.play_addr?.duration,
    video?.playAddr?.duration,
    video?.play_addr_h264?.duration,
    video?.playAddrH264?.duration,
    video?.play_addr_lowbr?.duration,
    video?.playAddrLowbr?.duration,
  ]

  let duration = 0
  const estimatedSec = estimateDurationSecondsByStreams(streams)

  // Prefer asset-side duration when available. Some detail payloads expose a
  // noisy top-level video.duration, which can incorrectly trip the 30-minute guard.
  for (const value of addressDurationFields) {
    duration = normalizeVideoDurationSeconds(value, { estimatedSec })
    if (duration > 0) break
  }

  if (!duration) {
    for (const value of [video?.duration, source?.duration]) {
      duration = normalizeVideoDurationSeconds(value, { estimatedSec })
      if (duration > 0) break
    }
  }

  if (shouldPreferMusicDuration(duration, musicDuration)) {
    return Math.floor(normalizePositiveNumber(musicDuration))
  }

  return duration
}

function inferVideoHeight(...values) {
  for (const value of values) {
    const num = Math.floor(normalizePositiveNumber(value))
    if (num > 0) return num

    const text = normalizeString(value).toLowerCase()
    if (!text) continue

    const heightMatch = text.match(
      /(?:^|[^0-9])(2160|1440|1080|960|720|540|480|360|240)p(?:[^0-9]|$)/i,
    )
    if (heightMatch) return Number(heightMatch[1])

    const resolutionMatch = text.match(/(\d{3,4})[x*](\d{3,4})/)
    if (resolutionMatch) {
      return Math.min(Number(resolutionMatch[1]), Number(resolutionMatch[2]))
    }
  }
  return 0
}

function buildVideoStreamLabel(stream = {}, fallback = "") {
  const labels = [
    stream?.qualityLabel,
    stream?.quality_label,
    stream?.quality_name,
    stream?.qualityName,
    stream?.quality_desc,
    stream?.qualityDesc,
    stream?.gear_name,
    stream?.gearName,
    fallback,
  ]
  for (const item of labels) {
    const label = normalizeString(item)
    if (label) return label
  }

  const height = inferVideoHeight(
    stream?.height,
    stream?.max_height,
    stream?.maxHeight,
    stream?.quality_type,
    stream?.qualityType,
    stream?.resolution,
  )
  if (height > 0) return `${height}P`

  const bitRate = Math.floor(
    normalizePositiveNumber(
      stream?.bit_rate ?? stream?.bitRate ?? stream?.bandwidth ?? stream?.bps ?? stream?.br,
    ),
  )
  if (bitRate > 0) return `${Math.round(bitRate / 1000)}K`

  return "默认"
}

function pushVideoStream(
  streams,
  seenUrls,
  stream = {},
  { fallbackLabel = "", scoreBoost = 0 } = {},
) {
  const url =
    pickFirstUrl(stream?.play_addr_h264) ||
    pickFirstUrl(stream?.playAddrH264) ||
    pickFirstUrl(stream?.play_addr) ||
    pickFirstUrl(stream?.playAddr) ||
    pickFirstUrl(stream?.play_addr_265) ||
    pickFirstUrl(stream?.playAddr265) ||
    pickFirstUrl(stream?.play_addr_lowbr) ||
    pickFirstUrl(stream?.playAddrLowbr) ||
    pickFirstUrl(stream?.play_api) ||
    pickFirstUrl(stream?.playApi) ||
    pickFirstUrl(stream?.play_url) ||
    pickFirstUrl(stream?.playUrl) ||
    pickFirstUrl(stream?.download_addr) ||
    pickFirstUrl(stream?.downloadAddr) ||
    pickFirstUrl(stream?.src) ||
    pickFirstUrl(stream?.url) ||
    pickFirstUrl(stream)
  if (!url || seenUrls.has(url)) return

  const height = inferVideoHeight(
    stream?.height,
    stream?.max_height,
    stream?.maxHeight,
    stream?.quality_name,
    stream?.qualityName,
    stream?.quality_desc,
    stream?.qualityDesc,
    stream?.gear_name,
    stream?.gearName,
    stream?.resolution,
    stream?.quality_type,
    stream?.qualityType,
  )
  const width = Math.floor(normalizePositiveNumber(stream?.width))
  const bitRate = Math.floor(
    normalizePositiveNumber(
      stream?.bit_rate ?? stream?.bitRate ?? stream?.bandwidth ?? stream?.bps ?? stream?.br,
    ),
  )
  const dataSize = Math.floor(
    normalizePositiveNumber(
      stream?.data_size ??
        stream?.dataSize ??
        stream?.play_addr?.data_size ??
        stream?.playAddr?.data_size,
    ),
  )
  const qualityType = Math.floor(
    normalizePositiveNumber(stream?.quality_type ?? stream?.qualityType ?? stream?.id),
  )
  const label = buildVideoStreamLabel(stream, fallbackLabel)
  const score = height * 1000000000 + bitRate * 1000 + dataSize + qualityType + scoreBoost

  seenUrls.add(url)
  streams.push({
    url,
    width,
    height,
    bitRate,
    dataSize,
    qualityType,
    qualityLabel: label,
    codec: normalizeString(
      stream?.codec_type ?? stream?.codecType ?? stream?.codecs ?? stream?.file_hash ?? "",
    ),
    score,
  })
}

function normalizeVideoStreams(video = {}) {
  const source = video && typeof video === "object" ? video : {}
  const streams = []
  const seenUrls = new Set()

  const directCandidates = [
    { value: source?.play_addr_h264, fallbackLabel: "H264", scoreBoost: 50 },
    { value: source?.play_addr, fallbackLabel: "默认", scoreBoost: 40 },
    { value: source?.play_addr_265, fallbackLabel: "H265", scoreBoost: 30 },
    { value: source?.play_api, fallbackLabel: "播放源", scoreBoost: 20 },
    { value: source?.play_url, fallbackLabel: "播放源", scoreBoost: 15 },
    { value: source?.download_addr, fallbackLabel: "下载源", scoreBoost: 10 },
    { value: source?.src, fallbackLabel: "源地址", scoreBoost: 5 },
    { value: source?.url, fallbackLabel: "源地址", scoreBoost: 5 },
    { value: source?.play_addr_lowbr, fallbackLabel: "低码率", scoreBoost: -1000 },
  ]
  for (const item of directCandidates) {
    pushVideoStream(streams, seenUrls, item.value, item)
  }

  const bitRates = Array.isArray(source?.bit_rate)
    ? source.bit_rate
    : Array.isArray(source?.bitRate)
      ? source.bitRate
      : []
  for (const item of bitRates) {
    pushVideoStream(streams, seenUrls, item, {
      fallbackLabel: normalizeString(item?.gear_name ?? item?.gearName),
    })
  }

  return streams.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (b.height !== a.height) return b.height - a.height
    if (b.bitRate !== a.bitRate) return b.bitRate - a.bitRate
    if (b.dataSize !== a.dataSize) return b.dataSize - a.dataSize
    return String(a.qualityLabel || "").localeCompare(String(b.qualityLabel || ""))
  })
}

function normalizeVideoData(candidate = {}, musicDuration = 0) {
  const source = candidate && typeof candidate === "object" ? candidate : {}
  const video = source?.video && typeof source.video === "object" ? source.video : source
  const streams = normalizeVideoStreams(video)
  const playUrl = streams[0]?.url || ""
  const cover =
    pickFirstUrl(video?.cover) ||
    pickFirstUrl(video?.dynamic_cover) ||
    pickFirstUrl(video?.origin_cover) ||
    ""
  const duration = pickVideoDurationSeconds(source, video, streams, musicDuration)
  return {
    url: playUrl,
    cover,
    duration,
    streams,
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
    raw?.uid ?? raw?.id ?? raw?.sec_uid ?? raw?.secUid ?? raw?.user_info?.uid ?? raw?.userInfo?.uid,
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
  const normalized = String(text || "")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
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
      const hasMedia = Boolean(
        normalizeVideoData(value).url || normalizeImageList(value).length > 0,
      )
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
  const music = normalizeMusicData(candidate)
  const video = normalizeVideoData(candidate, music.duration)
  const cover = video.cover || images[0] || pickFirstUrl(candidate?.cover) || author.avatar || ""
  const desc = normalizeDesc(candidate)
  const type = video.url
    ? "video"
    : images.length > 0
      ? "note"
      : sourceUrl.includes("/note/")
        ? "note"
        : "video"
  const publishedAt = normalizeTimestamp(
    candidate?.create_time ??
      candidate?.createTime ??
      candidate?.publish_time ??
      candidate?.publishTime,
  )

  return {
    id: awemeId,
    type,
    author,
    desc,
    stats,
    cover,
    video,
    music,
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
    const normalized = String(item || "")
      .replace(/[),。；、]+$/, "")
      .trim()
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
    comment?.text ??
      comment?.content_text ??
      comment?.contentText ??
      comment?.reply_comment_total ??
      "",
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
  return /(\d+分钟前|\d+小时前|\d+天前|\d+月前|刚刚|昨天|前·|发布于|\d{4}-\d{2}-\d{2})/.test(value)
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
    this.downloader = new Download(ROOT_PATH)
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
      const getText = node => String(node?.innerText || node?.textContent || "").trim()
      const modal =
        document.querySelector(".douyin_login_new_class") ||
        [...document.querySelectorAll('div[role="dialog"],div[class],section')].find(node => {
          const text = getText(node)
          return text.includes("扫码登录") || text.includes("登录抖音")
        })
      if (!modal) return { exists: false, text: "", qrDataUrl: "" }

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

  async captureFallbackLoginScreenshot(page) {
    this.ensureTempDirs()
    cleanupFile(this.qrImagePath)

    const selectors = [
      ".douyin_login_new_class",
      'div[role="dialog"]',
      "#douyin_login_comp_scan_code",
      "body",
    ]

    for (const selector of selectors) {
      const handle = await page.$(selector).catch(() => null)
      if (!handle) continue
      try {
        const box = await handle.boundingBox()
        if (!box || box.width < 120 || box.height < 120) continue
        await handle.screenshot({ path: this.qrImagePath })
        if (fs.existsSync(this.qrImagePath) && fs.statSync(this.qrImagePath).size > 0) {
          return this.qrImagePath
        }
      } catch {}
    }

    await page.screenshot({
      path: this.qrImagePath,
      fullPage: false,
    })
    if (fs.existsSync(this.qrImagePath) && fs.statSync(this.qrImagePath).size > 0) {
      return this.qrImagePath
    }

    throw createError("未找到抖音登录截图区域", "DOUYIN_QR_INVALID")
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
        return text === "登录" || /login/i.test(`${id} ${cls}`) || id === "douyin_login_comp_btn_id"
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
      "#douyin_login_comp_scan_code img",
      "#animate_qrcode_container img",
      '.douyin_login_new_class img[aria-label="二维码"]',
      "#douyin_login_comp_scan_code",
      "#animate_qrcode_container",
      ".douyin_login_new_class .pE9ZOPEo",
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

    if (modalState?.exists) {
      return this.captureFallbackLoginScreenshot(page)
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

  saveQrBase64Image(base64 = "") {
    const source = normalizeString(base64)
    if (!source) {
      throw createError("未获取到抖音扫码二维码数据", "DOUYIN_QR_INVALID")
    }

    this.ensureTempDirs()
    cleanupFile(this.qrImagePath)
    fs.writeFileSync(this.qrImagePath, Buffer.from(source, "base64"))
    return this.qrImagePath
  }

  buildLoginApiHeaders(cookieHeader = "") {
    return buildHeaders(cookieHeader ? { cookieHeader } : null, {
      accept: "application/json, text/plain, */*",
      origin: WEB_REFERER.replace(/\/$/, ""),
      "x-requested-with": "XMLHttpRequest",
    })
  }

  buildSignedLoginQuery(extra = {}, cookies = {}) {
    const msToken =
      normalizeString(extra?.msToken) ||
      normalizeString(cookies?.msToken) ||
      normalizeString(process.env.DOUYIN_MS_TOKEN) ||
      createMsToken()

    const query = {
      ...LOGIN_QUERY_TEMPLATE,
      ...extra,
      msToken,
      ts: String(Math.floor(Date.now() / 1000)),
      p_ts: String(Date.now()),
      p_no: normalizeString(extra?.p_no) || randomHex(64),
      biz_trace_id: normalizeString(extra?.biz_trace_id) || randomHex(8),
    }

    const searchParams = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue
      searchParams.set(key, String(value))
    }

    const queryString = searchParams.toString()
    try {
      searchParams.set("a_bogus", generate_a_bogus(queryString, USER_AGENT, LOGIN_WINDOW_ENV))
    } catch (err) {
      logger.warn?.(`[Douyin] 生成 a_bogus 失败：${err?.message || err}`)
    }
    try {
      searchParams.set("X-Bogus", generate_x_bogus(searchParams.toString(), USER_AGENT))
    } catch (err) {
      logger.warn?.(`[Douyin] 生成 X-Bogus 失败：${err?.message || err}`)
    }

    return Object.fromEntries(searchParams.entries())
  }

  buildFixedUrlFromTemplate(templateUrl, replacements = {}) {
    return applyTemplateParams(templateUrl, replacements)
  }

  buildFixedFormFromTemplate(templateForm = "", replacements = {}) {
    return applyTemplateParams(templateForm, replacements)
  }

  async warmupLoginCookies(cookies = {}) {
    let nextCookies = normalizeCookies(cookies)
    try {
      const response = await fetch(WEB_REFERER, {
        method: "GET",
        redirect: "manual",
        headers: this.buildLoginApiHeaders(buildCookieHeader(nextCookies)),
      })
      nextCookies = mergeCookies(nextCookies, getResponseCookies(response))
    } catch (err) {
      logger.warn?.(`[Douyin] 预热登录 Cookie 失败：${err?.message || err}`)
    }
    return nextCookies
  }

  async requestLoginQrTicket() {
    let cookies = await this.warmupLoginCookies({})
    let lastError = null

    for (const endpoint of getLoginQrEndpoints()) {
      try {
        const config = readQrApiConfig()
        const customUrl = normalizeString(config?.get_qrcode_url)
        const url = customUrl
          ? this.buildFixedUrlFromTemplate(customUrl)
          : buildUrl(endpoint.url, this.buildSignedLoginQuery(endpoint.query, cookies))
        const result = await requestJsonWithCookies(url, {
          cookies,
          headers: this.buildLoginApiHeaders(buildCookieHeader(cookies)),
        })
        cookies = result.cookies
        const payload = result.data?.data ?? result.data
        const token = normalizeString(payload?.token)
        const qrcode = normalizeString(payload?.qrcode)
        const qrUrl = resolveAbsoluteUrl(payload?.qrcode_index_url ?? payload?.qrcodeIndexUrl)

        if (token && qrcode) {
          return {
            endpoint,
            token,
            qrUrl,
            imagePath: this.saveQrBase64Image(qrcode),
            cookies,
            payload,
          }
        }
      } catch (err) {
        lastError = err
      }
    }

    if (lastError?.code === "DOUYIN_BAD_JSON") {
      throw createError(
        `抖音二维码接口返回了非 JSON 内容，请在 ${QR_API_CONFIG_PATH} 配置完整签名的 get_qrcode_url 和 check_qrconnect_url`,
        "DOUYIN_QR_API_CONFIG_REQUIRED",
        {
          cause: lastError,
        },
      )
    }

    throw createError(
      lastError?.message || "获取抖音扫码二维码失败",
      lastError?.code || "DOUYIN_QR_FAILED",
    )
  }

  async followLoginRedirects(url, cookies = {}) {
    let currentUrl = resolveAbsoluteUrl(url)
    let nextCookies = normalizeCookies(cookies)

    for (let index = 0; index < 8 && currentUrl; index += 1) {
      const cookieHeader = buildCookieHeader(nextCookies)
      const response = await fetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        headers: buildHeaders(cookieHeader ? { cookieHeader } : null, {
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }),
      })

      nextCookies = mergeCookies(nextCookies, getResponseCookies(response))
      const location = getResponseLocation(response)
      if (!location) {
        return {
          finalUrl: currentUrl,
          cookies: nextCookies,
          response,
        }
      }
      currentUrl = resolveAbsoluteUrl(location, currentUrl)
    }

    return {
      finalUrl: currentUrl,
      cookies: nextCookies,
    }
  }

  async closeLoginSession(token) {
    const session = this.loginSessions.get(token)
    this.loginSessions.delete(token)
    if (!session) return
  }

  async startQrLogin() {
    this.ensureTempDirs()
    for (const token of [...this.loginSessions.keys()]) {
      await this.closeLoginSession(token)
    }

    const ticket = await this.requestLoginQrTicket()
    const sessionToken = randomUUID()
    this.loginSessions.set(sessionToken, {
      token: sessionToken,
      qrToken: ticket.token,
      qrUrl: ticket.qrUrl,
      imagePath: ticket.imagePath,
      cookies: ticket.cookies,
      createdAt: Date.now(),
    })
    return {
      token: sessionToken,
      qrUrl: ticket.qrUrl,
      imagePath: ticket.imagePath,
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

  async importCookieHeader(cookieHeader = "") {
    const cookies = parseCookieHeader(cookieHeader)
    const normalizedHeader = buildCookieHeader(cookies)
    if (!normalizedHeader) {
      throw createError("未识别到有效 Cookie，请完整粘贴浏览器中的 Cookie。", "DOUYIN_COOKIE_EMPTY")
    }

    const authPreview = {
      cookieHeader: normalizedHeader,
      cookies,
    }
    const userInfo = await this.fetchSelfUserInfo(authPreview).catch(err => {
      if (err?.code === "DOUYIN_AUTH_INVALID") throw err
      throw createError(
        err?.message || "Cookie 校验失败，请确认复制的是 www.douyin.com 当前登录态。",
        "DOUYIN_COOKIE_VALIDATE_FAILED",
      )
    })

    return await this.finalizeQrLogin({
      cookies,
      raw: hasResolvedUserInfo(userInfo) ? { user_info: userInfo } : {},
    })
  }

  async pollQrLogin(token) {
    const qrToken = normalizeString(token)
    if (!qrToken) throw createError("二维码 token 缺失", "DOUYIN_QR_TOKEN_MISSING")
    const session = this.loginSessions.get(qrToken)
    if (!session?.qrToken) {
      throw createError("二维码会话不存在或已结束", "DOUYIN_QR_TOKEN_MISSING")
    }

    try {
      let lastError = null

      for (const endpoint of getLoginQrPollEndpoints()) {
        try {
          const config = readQrApiConfig()
          const customUrl = normalizeString(config?.check_qrconnect_url)
          const formTemplate = normalizeString(config?.check_qrconnect_form)
          const url = customUrl
            ? this.buildFixedUrlFromTemplate(customUrl, {
                token: session.qrToken,
              })
            : buildUrl(
                endpoint.url,
                this.buildSignedLoginQuery(endpoint.buildQuery(session.qrToken), session.cookies),
              )
          const body = formTemplate
            ? this.buildFixedFormFromTemplate(formTemplate, {
                token: session.qrToken,
              })
            : ""
          logger.info?.(
            `[Douyin] 轮询请求: ${JSON.stringify({
              method: body ? "POST" : "GET",
              url,
              body,
            })}`,
          )
          const result = await requestJsonWithCookies(url, {
            method: body ? "POST" : "GET",
            body: body || undefined,
            cookies: session.cookies,
            headers: {
              ...this.buildLoginApiHeaders(buildCookieHeader(session.cookies)),
              ...(body
                ? {
                    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                    origin: "https://login.douyin.com",
                  }
                : {}),
            },
          })
          session.cookies = result.cookies

          const state = parseDouyinQrStatus(result.data)
          logger.info?.(
            `[Douyin] 扫码轮询状态: method=${body ? "POST" : "GET"}, status=${state.status}, raw=${JSON.stringify(
              {
                status: result?.data?.data?.status ?? result?.data?.status,
                status_code: result?.data?.data?.status_code ?? result?.data?.status_code,
                check_status: result?.data?.data?.check_status ?? result?.data?.check_status,
                message: result?.data?.data?.message ?? result?.data?.message,
                status_msg: result?.data?.data?.status_msg ?? result?.data?.status_msg,
                has_redirect_url: Boolean(
                  result?.data?.data?.redirect_url ||
                  result?.data?.data?.redirectUrl ||
                  result?.data?.redirect_url ||
                  result?.data?.redirectUrl,
                ),
              },
            )}`,
          )
          if (
            state.status === "pending" &&
            normalizeString(result?.data?.message).toLowerCase() === "error"
          ) {
            throw createError(
              `轮询接口返回 error，请在 ${QR_API_CONFIG_PATH} 配置浏览器抓到的完整 check_qrconnect_url 模板`,
              "DOUYIN_QR_API_CONFIG_REQUIRED",
            )
          }
          if (state.status !== "success") {
            return state
          }

          const redirectUrl = state.redirectUrl
          let cookies = normalizeCookies(session.cookies)
          if (redirectUrl) {
            const settled = await this.followLoginRedirects(redirectUrl, cookies)
            cookies = mergeCookies(cookies, settled.cookies)
          }

          const authPreview = {
            cookieHeader: buildCookieHeader(cookies),
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
        } catch (err) {
          lastError = err
        }
      }

      if (lastError) {
        throw lastError
      }

      return {
        status: "pending",
        message: "等待扫码",
        raw: {},
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

    const isShortLink =
      /^v\.douyin\.com$/i.test(target.hostname) || /\/share\//i.test(target.pathname)
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
        const maxTop = Number.isFinite(recommendationTop)
          ? recommendationTop
          : Number.POSITIVE_INFINITY
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
        const title = String(document.title || "")
          .replace(/\s*-\s*抖音$/, "")
          .trim()
        const desc = parseDesc(description) || title
        const authorName = userAnchor?.text || parseAuthor(description) || ""
        const publishMatched = bodyText.match(/发布时间[：:]\s*([^\n]+)/)
        const video = document.querySelector("video")
        const videoSrc = String(video?.currentSrc || video?.src || "").trim()
        const poster = String(video?.poster || "").trim()
        const duration = Number(video?.duration || 0)
        const idMatched = String(currentUrl || document.location.href || "").match(
          /\/(video|note)\/(\d+)/i,
        )
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
                duration:
                  Number.isFinite(duration) && duration > 0 ? Math.round(duration * 1000) : 0,
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

  buildReferenceAwemeDetailUrl(awemeId) {
    const baseUrl =
      `https://www.douyin.com/aweme/v1/web/aweme/detail/?device_platform=webapp&aid=6383&channel=channel_pc_web&aweme_id=${encodeURIComponent(awemeId)}` +
      "&pc_client_type=1&version_code=190500&version_name=19.5.0&cookie_enabled=true" +
      "&screen_width=1344&screen_height=756&browser_language=zh-CN&browser_platform=Win32" +
      "&browser_name=Firefox&browser_version=118.0&browser_online=true" +
      "&engine_name=Gecko&engine_version=109.0&os_name=Windows&os_version=10&cpu_core_num=16&device_memory=&platform=PC"
    const query = new URLSearchParams(new URL(baseUrl).search).toString()
    return `${baseUrl}&a_bogus=${generate_a_bogus(query, MOBILE_DOUYIN_USER_AGENT, LOGIN_WINDOW_ENV)}`
  }

  async fetchAwemeByReferenceApi(awemeId, auth = null, sourceUrl = "") {
    const url = this.buildReferenceAwemeDetailUrl(awemeId)

    const { data } = await requestJson(url, {
      headers: {
        ...buildHeaders(auth, {
          referer: WEB_REFERER,
        }),
        "user-agent": MOBILE_DOUYIN_USER_AGENT,
      },
    })

    console.log(data)

    const detail = data?.aweme_detail
    if (!detail || typeof detail !== "object") return null

    const type = String(sourceUrl || "").includes("/note/") ? "note" : "video"
    const videoSource = detail?.video && typeof detail.video === "object" ? detail.video : {}
    const playAddr = videoSource?.play_addr
    const playAddr265 = videoSource?.play_addr_265
    const playUrl = pickLastUrl(playAddr?.url_list) || pickLastUrl(playAddr)
    const playUrl265 = pickLastUrl(playAddr265?.url_list) || pickLastUrl(playAddr265)
    const playSize = Number(playAddr?.data_size)
    const use265 = Number.isFinite(playSize) && playSize > 100 * 1024 * 1024 && playUrl265
    const resultUrl = use265 ? playUrl265 : playUrl
    const images =
      type === "note"
        ? (Array.isArray(detail?.images) ? detail.images : [])
            .map(item => pickFirstUrl(item?.url_list))
            .filter(Boolean)
        : []

    const normalized = normalizeDouyinAweme(
      {
        ...detail,
        images: images.length > 0 ? images : detail?.images,
        video: {
          ...videoSource,
          play_addr: resultUrl
            ? {
                url_list: [resultUrl],
                data_size: use265 ? playAddr265?.data_size : playAddr?.data_size,
              }
            : playAddr,
        },
      },
      { sourceUrl },
    )

    if (type === "note" && images.length > 0) {
      normalized.images = images
      normalized.type = "note"
    }
    if (resultUrl) {
      normalized.video = {
        ...normalized.video,
        url: resultUrl,
      }
      normalized.type = type === "note" && images.length > 0 ? "note" : "video"
    }
    return normalized
  }

  async getAwemeDetail(rawUrl, auth = null) {
    const resolvedUrl = await this.resolveShareUrl(rawUrl)
    const page = await this.fetchAwemePage(resolvedUrl, auth)
    const urlMatch = page.url.match(/\/(video|note)\/(\d+)/i)
    const awemeId = normalizeString(urlMatch?.[2])
    let aweme = this.findAwemeFromHtml(page.html, awemeId)
    let sourceUrl = page.url || resolvedUrl

    if (awemeId) {
      try {
        const fromReference = await this.fetchAwemeByReferenceApi(awemeId, auth, sourceUrl)
        if (fromReference?.id && (fromReference?.video?.url || fromReference?.images?.length > 0)) {
          return fromReference
        }
      } catch (err) {
        logger.warn?.(`[Douyin] 参考 detail API 解析失败，继续尝试现有链路：${err?.message || err}`)
      }
    }

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
    const safeId =
      normalizeString(awemeId || Date.now()).replace(/[^\w-]/g, "_") || `douyin_${Date.now()}`
    const absolutePath = path.join(TEMP_VIDEO_DIR, `${safeId}.mp4`)
    const relativePath = toRootRelativePath(absolutePath)

    try {
      await this.downloader.downloadFile(targetUrl, relativePath, {
        headers: {
          referer: WEB_REFERER,
          "user-agent": USER_AGENT,
        },
        maxBytes: this.videoMaxBytes,
      })
      return absolutePath
    } catch (err) {
      cleanupFile(absolutePath)
      throw err
    }
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
