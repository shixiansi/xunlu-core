import fetch from "node-fetch"
// 统一 fetch 超时包装：外部 API stall 时不阻塞消息链路（node-fetch@2 默认无超时）
const DEFAULT_FETCH_TIMEOUT_MS = Number(process.env.XUNLU_FETCH_TIMEOUT_MS) || 20000
const rawFetch = fetch
const fetchWithTimeout = (url, options = {}) => {
  if (!options.signal) options.signal = AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS)
  return rawFetch(url, options)
}
import Bapi from "../Bapi.js"
import { getBiliTicket } from "./bili_ticket.cjs"
import { getPlatformRedis } from "../../../../runtime/platform-services.js"

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0.0"

// bili_ticket 有效期约3天，内存缓存1小时，避免每次请求都重新签发
const TICKET_TTL_MS = 60 * 60 * 1000

let memoryFingerprint = null
let ticketCache = { buvid: "", ticket: "", ts: 0 }

async function fetchBiliTicket() {
  const now = Date.now()
  if (ticketCache.ticket && now - ticketCache.ts < TICKET_TTL_MS) {
    return ticketCache.ticket
  }
  try {
    const ticket = (await getBiliTicket(""))?.data?.ticket || ""
    if (ticket) {
      ticketCache = { buvid: "", ticket, ts: now }
    }
    return ticketCache.ticket
  } catch (error) {
    console.error("[Bilibili] 获取bili_ticket失败:", error?.message)
    return ticketCache.ticket || ""
  }
}

/**
 * 获取稳定的设备指纹（buvid3/buvid4 + b_nut）。
 * 旧实现每次请求都向 SPI 接口申请新指纹，等于每次都换一台"新设备"，
 * 会直接命中 B 站风控（playurl 返回 HTTP 412）。
 * 这里将指纹持久化到 redis + 进程内存，首次生成后访问主页完成激活绑定。
 */
async function getStableFingerprint() {
  if (memoryFingerprint?.buvid) {
    return memoryFingerprint
  }

  const redis = getPlatformRedis()
  const cached = await redis?.get?.("bilibili_fingerprint")
  if (cached) {
    try {
      const parsed = JSON.parse(cached)
      if (parsed?.buvid) {
        memoryFingerprint = parsed
        return parsed
      }
    } catch {}
  }

  let buvid = ""
  try {
    const rep = await fetchWithTimeout(Bapi("buvid3"), { headers: { "User-Agent": UA } })
    const { data } = await rep.json()
    if (data?.b_3) {
      // SPI 返回的 b_3 本身已带 infoc 后缀，直接使用
      buvid = `buvid3=${data.b_3};buvid4=${data.b_4}`
    }
  } catch (error) {
    console.error("[Bilibili] 获取buvid失败:", error?.message)
  }

  let b_nut = ""
  try {
    // 访问主页，让服务端下发 b_nut 与 buvid 完成绑定（激活指纹）
    const rep = await fetchWithTimeout("https://www.bilibili.com/", { headers: { "User-Agent": UA } })
    const setCookie = rep.headers.raw()["set-cookie"] || []
    b_nut = setCookie.join(";").match(/b_nut=[^;]+/)?.[0] || ""
  } catch (error) {
    console.error("[Bilibili] 获取b_nut失败:", error?.message)
  }

  const fingerprint = { buvid, b_nut }
  if (buvid) {
    memoryFingerprint = fingerprint
    await redis?.set?.("bilibili_fingerprint", JSON.stringify(fingerprint))
  }
  return fingerprint
}

function parseLoginCookie(jsonData) {
  try {
    return jsonData ? JSON.parse(jsonData) : {}
  } catch {
    return {}
  }
}

async function getCookie() {
  const jsonData = await getPlatformRedis()?.get?.("bilibili_cookie")
  const { SESSDATA, DedeUserID } = parseLoginCookie(jsonData)
  const ticket = await fetchBiliTicket()

  // 实测（2026-11-08，腾讯云机房 IP）：未登录时携带自建 buvid/b_nut 会触发
  // playurl 接口 HTTP 412 风控，纯 bili_ticket 反而稳定 200；
  // 因此仅在存在真实登录态时才附带完整指纹。
  if (!SESSDATA) {
    return ticket ? `bili_ticket=${ticket}` : ""
  }

  const { buvid, b_nut } = await getStableFingerprint()
  const parts = [buvid, b_nut]
  if (ticket) parts.push(`bili_ticket=${ticket}`)
  parts.push(`SESSDATA=${SESSDATA}`)
  if (DedeUserID) parts.push(`DedeUserID=${DedeUserID}`)
  return parts.filter(Boolean).join(";")
}

async function getProvisionalCookie() {
  const ticket = await fetchBiliTicket()
  return ticket ? `bili_ticket=${ticket}` : ""
}

export { getCookie, getProvisionalCookie }
