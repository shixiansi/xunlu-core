import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_PATH = path.resolve(__dirname, "..", "..")
const DEFAULT_SERVER_URL = "https://llob.linyuchen.net/rkey"
const LOCAL_TTL_SEC = 30 * 60
const DEFAULT_TIMEOUT_MS = 2000
const PROBE_IMAGE_CANDIDATES = [
  path.resolve(ROOT_PATH, "resources", "img", "rkey.jpg"),
  path.resolve(ROOT_PATH, "resource", "img", "rkey.jpg"),
]

function toInt(value, fallback = undefined) {
  const num = Number(value)
  return Number.isFinite(num) ? Math.floor(num) : fallback
}

function normalizeScene(scene) {
  const raw = String(scene || "").trim().toLowerCase()
  if (raw === "group") return "group"
  if (raw === "private" || raw === "friend") return "private"
  throw new Error(`[rkey] unsupported scene=${scene}`)
}

function nowSec(now = Date.now()) {
  return Math.floor(Number(now) / 1000)
}

function normalizeProtocolName(value) {
  const raw = String(value || "").trim().toLowerCase()
  if (raw.includes("onebot")) return "onebotv11"
  if (raw.includes("milky")) return "milky"
  if (raw.includes("icqq")) return "icqq"
  return raw || "icqq"
}

function defaultLog() {
  return console
}

function getDefaultProbeImagePath() {
  return PROBE_IMAGE_CANDIDATES.find(file => fs.existsSync(file)) || PROBE_IMAGE_CANDIDATES[0]
}

function normalizeRkeySuffix(value) {
  const raw = String(value || "").trim()
  if (!raw) return ""
  if (raw.startsWith("&")) return raw
  if (raw.startsWith("?")) return `&${raw.slice(1)}`
  if (/^(rkey|reky)=/i.test(raw)) return `&${raw}`
  const extracted = extractRkeySuffixFromUrl(raw)
  return extracted || raw
}

function stripRkeyFromUrl(url) {
  const raw = String(url || "").trim()
  if (!raw) return ""
  try {
    const u = new URL(raw)
    for (const key of Array.from(u.searchParams.keys())) {
      const lower = String(key || "").toLowerCase()
      if (lower === "rkey" || lower === "reky") u.searchParams.delete(key)
    }
    return u.toString()
  } catch {
    return raw
      .replace(/([?&])(rkey|reky)=[^&]*/gi, "$1")
      .replace(/\?&/, "?")
      .replace(/&&+/g, "&")
      .replace(/[?&]$/, "")
  }
}

function extractRkeySuffixFromUrl(url) {
  const raw = String(url || "").trim()
  if (!raw) return ""
  try {
    const u = new URL(raw)
    const rkey = u.searchParams.get("rkey")
    if (rkey) return `&rkey=${rkey}`
    const reky = u.searchParams.get("reky")
    if (reky) return `&reky=${reky}`
  } catch {
    const match = raw.match(/[?&](rkey|reky)=([^&#]+)/i)
    if (match) return `&${String(match[1]).toLowerCase()}=${match[2]}`
  }
  return ""
}

function applyRkeyToUrl(url, rkeySuffix) {
  const raw = String(url || "").trim()
  if (!raw) return ""

  const suffixRaw = normalizeRkeySuffix(rkeySuffix)
  if (!suffixRaw) return raw

  try {
    const u = new URL(stripRkeyFromUrl(raw))
    const params = new URLSearchParams(suffixRaw.replace(/^[?&]+/, ""))
    for (const [key, value] of params.entries()) {
      u.searchParams.set(key, value)
    }
    return u.toString()
  } catch {
    const base = stripRkeyFromUrl(raw)
    return base + (suffixRaw.startsWith("&") || suffixRaw.startsWith("?") ? suffixRaw : `&${suffixRaw}`)
  }
}

function extractRawSegmentsFromMessageDetail(detail) {
  const candidates = [
    detail?.message?.message,
    detail?.message?.segments,
    detail?.message,
    detail?.segments,
    detail?.data?.message?.message,
    detail?.data?.message?.segments,
    detail?.data?.message,
    detail?.data?.segments,
  ]
  return candidates.find(Array.isArray) || []
}

function extractImageUrlsFromMessageDetail(detail) {
  const urls = []
  const seen = new Set()

  const push = value => {
    const text = String(value || "").trim()
    if (!text) return
    if (!/^https?:\/\//i.test(text)) return
    if (seen.has(text)) return
    seen.add(text)
    urls.push(text)
  }

  const segments = extractRawSegmentsFromMessageDetail(detail)
  for (const seg of segments) {
    if (!seg || typeof seg !== "object") continue
    const data = seg.data && typeof seg.data === "object" ? seg.data : {}
    push(data.file)
    push(data.id)
    push(data.url)
    push(data.temp_url)
    push(data.uri)
    push(data.file)
    push(data.fileId)
    push(data.path)
    push(seg.url)
    push(seg.file)
  }

  push(detail?.url)
  push(detail?.image_url)
  push(detail?.data?.url)

  return urls
}

function extractMessageRkey(detail) {
  for (const url of extractImageUrlsFromMessageDetail(detail)) {
    const suffix = extractRkeySuffixFromUrl(url)
    if (suffix) return suffix
  }
  return ""
}

function normalizeBundleState(cache) {
  const group_rkey = normalizeRkeySuffix(cache?.group_rkey)
  const private_rkey = normalizeRkeySuffix(cache?.private_rkey)
  return {
    group_rkey,
    private_rkey,
    group_expired_time: toInt(cache?.group_expired_time, 0),
    private_expired_time: toInt(cache?.private_expired_time, 0),
  }
}

function computeBundleExpiry(bundle, now = nowSec()) {
  const groupOk = Boolean(bundle?.group_rkey) && Number(bundle?.group_expired_time || 0) > now
  const privateOk = Boolean(bundle?.private_rkey) && Number(bundle?.private_expired_time || 0) > now
  if (!groupOk || !privateOk) return 0
  return Math.min(Number(bundle.group_expired_time), Number(bundle.private_expired_time))
}

async function defaultLoadMasterList() {
  let env = null
  let cfg = null
  try {
    const mod = await import("../lib/env.js")
    env = mod?.default ?? mod
  } catch {}
  try {
    const mod = await import("../lib/config.js")
    cfg = mod?.default ?? mod
  } catch {}

  if (env?.CurEnv === "QQBot-YunZai") {
    try {
      const mod = await import(pathToFileURL(path.resolve(process.cwd(), "lib", "config", "config.js")).href)
      const ycfg = mod?.default ?? mod
      const masters = ycfg?.masterQQ
      if (Array.isArray(masters) && masters.length) return masters
    } catch {}
  }

  const masters = cfg?.getConfig?.("bot")?.masterQQ
  return Array.isArray(masters) ? masters : []
}

function defaultGetRuntimeBot() {
  try {
    // eslint-disable-next-line no-undef
    return Bot || globalThis.Bot || null
  } catch {
    return globalThis.Bot || null
  }
}

function normalizePublicBundle(bundle, now = nowSec()) {
  const data = normalizeBundleState(bundle)
  return {
    group_rkey: data.group_rkey,
    private_rkey: data.private_rkey,
    expired_time: computeBundleExpiry(data, now),
  }
}

class RkeyService {
  constructor(options = {}) {
    this.serverUrl = options.serverUrl || DEFAULT_SERVER_URL
    this.timeoutMs = Math.max(1, Math.floor(Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS))
    this.localTtlSec = Math.max(60, Math.floor(Number(options.localTtlSec) || LOCAL_TTL_SEC))
    this.fetchImpl = options.fetchImpl || globalThis.fetch
    this.getRuntimeBot = options.getRuntimeBot || defaultGetRuntimeBot
    this.loadMasterList = options.loadMasterList || defaultLoadMasterList
    this.log = options.log || defaultLog()
    this.now = typeof options.now === "function" ? options.now : () => Date.now()
    this.random = typeof options.random === "function" ? options.random : Math.random
    this.probeImagePath = options.probeImagePath || getDefaultProbeImagePath()
    this.bundle = normalizeBundleState(options.initialCache)
    this.inflight = null
  }

  getSnapshot() {
    return normalizePublicBundle(this.bundle, nowSec(this.now()))
  }

  isExpired() {
    return computeBundleExpiry(this.bundle, nowSec(this.now())) <= nowSec(this.now())
  }

  isSceneFresh(scene) {
    const normalized = normalizeScene(scene)
    const now = nowSec(this.now())
    const key = normalized === "group" ? "group_rkey" : "private_rkey"
    const expKey = normalized === "group" ? "group_expired_time" : "private_expired_time"
    return Boolean(this.bundle[key]) && Number(this.bundle[expKey] || 0) > now
  }

  setSceneCache(scene, value, expiredTime) {
    const normalized = normalizeScene(scene)
    const now = nowSec(this.now())
    const exp = Math.min(toInt(expiredTime, 0), now + this.localTtlSec)
    const key = normalized === "group" ? "group_rkey" : "private_rkey"
    const expKey = normalized === "group" ? "group_expired_time" : "private_expired_time"
    this.bundle[key] = normalizeRkeySuffix(value)
    this.bundle[expKey] = this.bundle[key] && exp > now ? exp : 0
    if (!this.bundle[expKey]) this.bundle[key] = ""
  }

  applyServerBundle(data) {
    const now = nowSec(this.now())
    const serverExpiry = toInt(data?.expired_time, 0)
    const maxExpiry = now + this.localTtlSec
    const normalizeExpiry = value => {
      const exp = Math.min(toInt(value, serverExpiry), maxExpiry)
      return exp > now ? exp : 0
    }

    const groupValue = normalizeRkeySuffix(data?.group_rkey)
    const privateValue = normalizeRkeySuffix(data?.private_rkey)
    const groupExpiry = groupValue ? normalizeExpiry(data?.group_expired_time) : 0
    const privateExpiry = privateValue ? normalizeExpiry(data?.private_expired_time) : 0

    if (groupValue && groupExpiry) {
      this.bundle.group_rkey = groupValue
      this.bundle.group_expired_time = groupExpiry
    }
    if (privateValue && privateExpiry) {
      this.bundle.private_rkey = privateValue
      this.bundle.private_expired_time = privateExpiry
    }
  }

  async fetchServerRkey() {
    if (typeof this.fetchImpl !== "function") {
      throw new Error("[rkey] fetch API not available")
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const res = await this.fetchImpl(this.serverUrl, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
      })
      if (!res?.ok) throw new Error(res?.statusText || `HTTP ${res?.status || "unknown"}`)
      return await res.json()
    } finally {
      clearTimeout(timer)
    }
  }

  async refreshRkey() {
    return await this.getRkeyBundle({ forceRefresh: true })
  }

  async getRkey() {
    return await this.getRkeyBundle()
  }

  async getSceneRkey(scene, { forceRefresh = false } = {}) {
    const normalized = normalizeScene(scene)
    await this.ensureScenes([normalized], { forceRefresh })
    const expKey = normalized === "group" ? "group_expired_time" : "private_expired_time"
    const key = normalized === "group" ? "group_rkey" : "private_rkey"
    return {
      value: this.bundle[key],
      expired_time: Number(this.bundle[expKey] || 0),
    }
  }

  async getRkeyBundle({ forceRefresh = false } = {}) {
    await this.ensureScenes(["group", "private"], { forceRefresh })
    return this.getSnapshot()
  }

  async ensureScenes(scenes, { forceRefresh = false } = {}) {
    const wanted = Array.from(new Set((Array.isArray(scenes) ? scenes : [scenes]).map(normalizeScene)))
    const missing = wanted.filter(scene => forceRefresh || !this.isSceneFresh(scene))
    if (!missing.length) return this.getSnapshot()

    if (this.inflight) {
      await this.inflight.catch(() => null)
      const rest = wanted.filter(scene => forceRefresh || !this.isSceneFresh(scene))
      if (!rest.length) return this.getSnapshot()
    }

    this.inflight = this.refreshScenes(missing)
      .catch(err => {
        this.log?.warn?.("[rkey] refresh failed:", err?.message || err)
      })
      .finally(() => {
        this.inflight = null
      })

    await this.inflight
    return this.getSnapshot()
  }

  async refreshScenes(scenes) {
    try {
      const data = await this.fetchServerRkey()
      this.applyServerBundle(data)
    } catch (err) {
      this.log?.warn?.("[rkey] fetch server rkey failed:", err?.message || err)
    }

    const stillMissing = scenes.filter(scene => !this.isSceneFresh(scene))
    for (const scene of stillMissing) {
      try {
        const probe = await this.probeScene(scene)
        if (probe?.value) this.setSceneCache(scene, probe.value, probe.expired_time)
      } catch (err) {
        this.log?.warn?.(`[rkey] probe ${scene} failed:`, err?.message || err)
      }
    }

    return this.getSnapshot()
  }

  getProtocol(bot) {
    return normalizeProtocolName(
      bot?.__xunlu_takeover_state?.protocol ?? bot?.adapterType ?? bot?.adapter?.name ?? process.env.XUNLU_ADAPTER,
    )
  }

  getProbeMessage() {
    const filePath = this.probeImagePath
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error(`[rkey] probe image not found: ${filePath}`)
    }
    return [{ type: "image", data: { url: pathToFileURL(filePath).toString() } }]
  }

  async sendProbeMessage(bot, scene, targetId) {
    const normalized = normalizeScene(scene)
    const message = this.getProbeMessage()

    if (typeof bot?.sendMessage === "function") {
      return await bot.sendMessage(
        normalized === "group" ? { group_id: Number(targetId) || targetId } : String(targetId),
        message,
      )
    }

    if (normalized === "group") {
      if (typeof bot?.pickGroup === "function") return await bot.pickGroup(Number(targetId) || targetId).sendMsg(message)
      throw new Error("[rkey] group send API not available")
    }

    if (typeof bot?.pickUser === "function") return await bot.pickUser(Number(targetId) || targetId).sendMsg(message)
    if (typeof bot?.pickFriend === "function") return await bot.pickFriend(Number(targetId) || targetId).sendMsg(message)
    throw new Error("[rkey] private send API not available")
  }

  extractSendRef(protocol, result) {
    const normalized = normalizeProtocolName(protocol)
    const directMessageId = toInt(result?.message_id ?? result?.messageId ?? result?.data?.message_id)
    const directMessageSeq = toInt(result?.message_seq ?? result?.messageSeq ?? result?.seq ?? result?.data?.message_seq)

    if (normalized === "onebotv11") {
      if (directMessageId !== undefined) return { message_id: directMessageId }
      if (directMessageSeq !== undefined) return { message_id: directMessageSeq }
      throw new Error("[rkey] failed to extract onebot message_id from send result")
    }

    if (directMessageSeq !== undefined) return { message_seq: directMessageSeq }
    if (directMessageId !== undefined) return { message_seq: directMessageId }
    throw new Error("[rkey] failed to extract milky message_seq from send result")
  }

  getApiCall(bot) {
    if (typeof bot?.callApi === "function") return bot.callApi.bind(bot)
    if (typeof bot?.sendApi === "function") return bot.sendApi.bind(bot)
    return null
  }

  async getMessageDetail(bot, protocol, { scene, targetId, ref }) {
    const normalized = normalizeProtocolName(protocol)
    const apiCall = this.getApiCall(bot)

    if (normalized === "onebotv11") {
      const messageId = toInt(ref?.message_id)
      if (messageId === undefined) throw new Error("[rkey] onebot get message requires message_id")

      if (typeof bot?.getMessage === "function") {
        try {
          return await bot.getMessage(messageId)
        } catch {}
      }
      if (apiCall) return await apiCall("get_msg", { message_id: messageId })
      throw new Error("[rkey] onebot get message API not available")
    }

    if (normalized === "milky") {
      const messageSeq = toInt(ref?.message_seq)
      if (messageSeq === undefined) throw new Error("[rkey] milky get message requires message_seq")
      const payload = {
        message_scene: scene === "group" ? "group" : "friend",
        peer_id: Number(targetId) || targetId,
        message_seq: messageSeq,
      }

      if (typeof bot?.getMessage === "function") {
        try {
          return await bot.getMessage(payload)
        } catch {}
      }
      if (apiCall) return await apiCall("get_message", payload)
      throw new Error("[rkey] milky get message API not available")
    }

    throw new Error(`[rkey] unsupported protocol=${normalized}`)
  }

  async recallProbeMessage(bot, protocol, { scene, targetId, ref }) {
    if (normalizeScene(scene) !== "group") return false

    try {
      if (typeof bot?.recallMessage === "function") {
        return await bot.recallMessage({
          peer_id: Number(targetId) || targetId,
          group_id: Number(targetId) || targetId,
          isGroup: true,
          message_id: ref?.message_id,
          message_seq: ref?.message_seq,
        })
      }
    } catch {}

    const apiCall = this.getApiCall(bot)
    if (normalizeProtocolName(protocol) === "onebotv11") {
      if (typeof bot?.deleteMessage === "function") {
        try {
          return await bot.deleteMessage({ message_id: ref?.message_id })
        } catch {}
      }
      if (apiCall && ref?.message_id !== undefined) {
        try {
          return await apiCall("delete_msg", { message_id: ref.message_id })
        } catch {}
      }
      return false
    }

    if (typeof bot?.recallGroupMessage === "function") {
      try {
        return await bot.recallGroupMessage({
          group_id: Number(targetId) || targetId,
          message_seq: ref?.message_seq,
        })
      } catch {}
    }
    if (apiCall && ref?.message_seq !== undefined) {
      try {
        return await apiCall("recall_group_message", {
          group_id: Number(targetId) || targetId,
          message_seq: ref.message_seq,
        })
      } catch {}
    }
    return false
  }

  async getGroupTargets(bot) {
    if (typeof bot?.getGroupList === "function") {
      const res = await bot.getGroupList()
      const list = res instanceof Map ? Array.from(res.values()) : Array.isArray(res) ? res : []
      return list.map(item => toInt(item?.group_id ?? item?.groupId ?? item?.id)).filter(Boolean)
    }

    if (bot?.gl instanceof Map) {
      return Array.from(bot.gl.keys()).map(v => toInt(v)).filter(Boolean)
    }

    return []
  }

  shuffle(list) {
    const out = [...list]
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.random() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }

  async probeScene(scene) {
    const normalized = normalizeScene(scene)
    const bot = this.getRuntimeBot()
    if (!bot) throw new Error("[rkey] runtime bot not available")

    const protocol = this.getProtocol(bot)
    const expireAt = nowSec(this.now()) + this.localTtlSec

    if (normalized === "private") {
      const masters = (await this.loadMasterList()).map(v => toInt(v)).filter(Boolean)
      if (!masters.length) throw new Error("[rkey] no master QQ configured")

      for (const uid of masters) {
        try {
          const sent = await this.sendProbeMessage(bot, "private", uid)
          const ref = this.extractSendRef(protocol, sent)
          const detail = await this.getMessageDetail(bot, protocol, {
            scene: "private",
            targetId: uid,
            ref,
          })
          const suffix = extractMessageRkey(detail)
          if (suffix) return { value: suffix, expired_time: expireAt }
        } catch (err) {
          this.log?.warn?.(`[rkey] private probe for ${uid} failed:`, err?.message || err)
        }
      }

      throw new Error("[rkey] failed to probe private rkey from all masters")
    }

    const groups = this.shuffle(await this.getGroupTargets(bot))
    if (!groups.length) throw new Error("[rkey] no available group for probe")

    for (const gid of groups) {
      let ref = null
      try {
        const sent = await this.sendProbeMessage(bot, "group", gid)
        ref = this.extractSendRef(protocol, sent)
        const detail = await this.getMessageDetail(bot, protocol, {
          scene: "group",
          targetId: gid,
          ref,
        })
        const suffix = extractMessageRkey(detail)
        if (suffix) {
          await this.recallProbeMessage(bot, protocol, {
            scene: "group",
            targetId: gid,
            ref,
          }).catch(() => false)
          ref = null
          return { value: suffix, expired_time: expireAt }
        }
      } catch (err) {
        this.log?.warn?.(`[rkey] group probe for ${gid} failed:`, err?.message || err)
      } finally {
        if (ref) {
          await this.recallProbeMessage(bot, protocol, {
            scene: "group",
            targetId: gid,
            ref,
          }).catch(() => false)
        }
      }
    }

    throw new Error("[rkey] failed to probe group rkey from all groups")
  }
}

const defaultRkeyService = new RkeyService()

export {
  DEFAULT_SERVER_URL,
  LOCAL_TTL_SEC,
  RkeyService,
  applyRkeyToUrl,
  extractRkeySuffixFromUrl,
  normalizePublicBundle,
  stripRkeyFromUrl,
}

export async function getRkeyBundle(options = {}) {
  return await defaultRkeyService.getRkeyBundle(options)
}

export async function getSceneRkey(scene, options = {}) {
  return await defaultRkeyService.getSceneRkey(scene, options)
}

export async function refreshRkeyBundle() {
  return await defaultRkeyService.refreshRkey()
}

export function getRkeySnapshot() {
  return defaultRkeyService.getSnapshot()
}

export default defaultRkeyService
