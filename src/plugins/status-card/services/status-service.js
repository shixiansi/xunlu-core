import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

import fetch from "node-fetch"
import systeminformation from "systeminformation"

import cfg from "../../../lib/config.js"
import { resolveStatusCardBuiltinAsset } from "../model/config.js"

const TEST_HOOK_KEY = "__XUNLU_STATUS_CARD_TEST_HOOKS__"
const DEFAULT_REMOTE_ASSET_TIMEOUT_MS = 12000
const DEFAULT_REMOTE_ASSET_MAX_BYTES = 10 * 1024 * 1024

function getTestHooks() {
  const hooks = globalThis[TEST_HOOK_KEY]
  return hooks && typeof hooks === "object" ? hooks : {}
}

export function setStatusCardTestHooks(hooks = null) {
  if (hooks && typeof hooks === "object") {
    globalThis[TEST_HOOK_KEY] = hooks
    return
  }
  delete globalThis[TEST_HOOK_KEY]
}

function getMergedOptions(options = {}) {
  return {
    ...getTestHooks(),
    ...(options && typeof options === "object" ? options : {}),
  }
}

function getNowValue(options = {}) {
  const raw = options.now
  if (typeof raw === "function") {
    const value = raw()
    return value instanceof Date ? value : new Date(value)
  }
  if (raw instanceof Date) return raw
  if (raw !== undefined) return new Date(raw)
  return new Date()
}

function getSiLibrary(options = {}) {
  return options.siLib || options.si || systeminformation
}

function getWaitFn(options = {}) {
  if (typeof options.wait === "function") return options.wait
  return ms => new Promise(resolve => setTimeout(resolve, ms))
}

function getFetchFn(options = {}) {
  if (typeof options.fetch === "function") return options.fetch
  const hooks = getTestHooks()
  if (typeof hooks.fetch === "function") return hooks.fetch
  return fetch
}

function safeString(value, fallback = "") {
  const text = String(value ?? "").trim()
  return text || fallback
}

function toFiniteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function firstItem(value) {
  if (Array.isArray(value)) return value[0] || null
  return value && typeof value === "object" ? value : null
}

function clampInteger(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(min, Math.min(max, Math.round(number)))
}

function sizeOfCollection(value) {
  if (value instanceof Map || value instanceof Set) return value.size
  if (Array.isArray(value)) return value.length
  if (value && typeof value === "object") return Object.keys(value).length
  return 0
}

function isAbsolutePath(value) {
  return path.isAbsolute(value) || /^[a-z]:[\\/]/i.test(value)
}

function normalizeMimeType(value) {
  const text = safeString(value).toLowerCase().split(";")[0].trim()
  if (text.startsWith("image/")) return text
  if (text === "application/svg+xml") return "image/svg+xml"
  return ""
}

function guessMimeTypeFromUrl(sourceUrl = "") {
  const text = safeString(sourceUrl)
  if (!text) return ""

  try {
    const pathname = new URL(text).pathname.toLowerCase()
    if (pathname.endsWith(".png")) return "image/png"
    if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg"
    if (pathname.endsWith(".gif")) return "image/gif"
    if (pathname.endsWith(".webp")) return "image/webp"
    if (pathname.endsWith(".svg")) return "image/svg+xml"
    if (pathname.endsWith(".bmp")) return "image/bmp"
    if (pathname.endsWith(".avif")) return "image/avif"
  } catch {}

  return ""
}

function detectImageMimeType(buffer, contentType = "", sourceUrl = "") {
  const headerMime = normalizeMimeType(contentType)
  if (headerMime) return headerMime
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return guessMimeTypeFromUrl(sourceUrl)

  const head = buffer.subarray(0, Math.min(buffer.length, 64))
  if (
    head.length >= 8 &&
    head[0] === 0x89 &&
    head[1] === 0x50 &&
    head[2] === 0x4e &&
    head[3] === 0x47 &&
    head[4] === 0x0d &&
    head[5] === 0x0a &&
    head[6] === 0x1a &&
    head[7] === 0x0a
  ) {
    return "image/png"
  }
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return "image/jpeg"
  }
  if (head.length >= 6) {
    const ascii = head.toString("ascii", 0, 6)
    if (ascii === "GIF87a" || ascii === "GIF89a") return "image/gif"
  }
  if (head.length >= 12) {
    const riff = head.toString("ascii", 0, 4)
    const webp = head.toString("ascii", 8, 12)
    if (riff === "RIFF" && webp === "WEBP") return "image/webp"
  }
  if (head.length >= 12) {
    const ftyp = head.toString("ascii", 4, 12)
    if (ftyp.startsWith("ftypavif")) return "image/avif"
  }
  if (head.length >= 2 && head[0] === 0x42 && head[1] === 0x4d) {
    return "image/bmp"
  }

  const preview = buffer.toString("utf8", 0, Math.min(buffer.length, 512)).trimStart()
  if (preview.startsWith("<svg") || (preview.startsWith("<?xml") && preview.includes("<svg"))) {
    return "image/svg+xml"
  }

  return guessMimeTypeFromUrl(sourceUrl)
}

async function readResponseBuffer(response, maxBytes = DEFAULT_REMOTE_ASSET_MAX_BYTES) {
  if (!response) throw new Error("empty response")

  if (typeof response.arrayBuffer === "function") {
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > maxBytes) {
      throw new Error(`remote asset exceeds max size: ${buffer.length} > ${maxBytes}`)
    }
    return buffer
  }

  if (typeof response.buffer === "function") {
    const buffer = await response.buffer()
    if (buffer.length > maxBytes) {
      throw new Error(`remote asset exceeds max size: ${buffer.length} > ${maxBytes}`)
    }
    return buffer
  }

  throw new Error("response body reader unavailable")
}

async function fetchRemoteImageAsDataUrl(sourceUrl = "", options = {}) {
  const url = safeString(sourceUrl)
  if (!/^https?:\/\//i.test(url)) return ""

  const fetchFn = getFetchFn(options)
  if (typeof fetchFn !== "function") return ""

  const timeoutMs = clampInteger(
    options.timeoutMs,
    DEFAULT_REMOTE_ASSET_TIMEOUT_MS,
    1000,
    60000,
  )
  const maxBytes = clampInteger(
    options.maxBytes,
    DEFAULT_REMOTE_ASSET_MAX_BYTES,
    64 * 1024,
    32 * 1024 * 1024,
  )

  const controller = typeof AbortController === "function" ? new AbortController() : null
  const timeout = controller
    ? setTimeout(() => {
        controller.abort()
      }, timeoutMs)
    : null

  try {
    const response = await fetchFn(url, {
      redirect: "follow",
      signal: controller?.signal,
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "User-Agent": "xunlu-status-card/0.1.0",
      },
    })

    if (!response?.ok) {
      throw new Error(`request failed: ${response?.status || "unknown"} ${response?.statusText || ""}`.trim())
    }

    const contentLength = Number(response.headers?.get?.("content-length") || 0)
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new Error(`remote asset exceeds max size: ${contentLength} > ${maxBytes}`)
    }

    const buffer = await readResponseBuffer(response, maxBytes)
    const mimeType = detectImageMimeType(buffer, response.headers?.get?.("content-type"), url)
    if (!mimeType) return ""

    return `data:${mimeType};base64,${buffer.toString("base64")}`
  } catch {
    return ""
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

function formatDateTime(date) {
  const d = date instanceof Date ? date : new Date(date)
  const pad = number => String(number).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}:${pad(d.getSeconds())}`
}

function trimText(text, maxLength = 72) {
  const normalized = safeString(text)
  if (!normalized) return "N/A"
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1)}...`
}

function formatBytes(bytes, digits = 2) {
  const value = toFiniteNumber(bytes)
  if (value === null || value < 0) return "N/A"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let current = value
  let unitIndex = 0
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024
    unitIndex += 1
  }
  const decimals = current >= 100 || unitIndex === 0 ? 0 : digits
  return `${current.toFixed(decimals)} ${units[unitIndex]}`
}

function formatSpeed(bytesPerSecond) {
  const value = toFiniteNumber(bytesPerSecond)
  if (value === null || value < 0) return "N/A"
  return `${formatBytes(value)}/s`
}

function formatPercent(value, digits = 2) {
  const number = toFiniteNumber(value)
  if (number === null) return "N/A"
  return `${number.toFixed(digits)}%`
}

function formatFrequencyGHz(value) {
  const number = toFiniteNumber(value)
  if (number === null || number <= 0) return "N/A"
  return `${number.toFixed(number >= 10 ? 1 : 2)}GHz`
}

function formatUsageLine(used, total) {
  const usedNumber = toFiniteNumber(used)
  const totalNumber = toFiniteNumber(total)
  if (usedNumber === null || totalNumber === null || totalNumber <= 0) return "N/A"
  return `${formatBytes(usedNumber)} / ${formatBytes(totalNumber)}`
}

function formatSampleMs(sampleMs) {
  const number = toFiniteNumber(sampleMs)
  if (number === null) return "sample N/A"
  return `sample ${(number / 1000).toFixed(1)}s`
}

function humanizeProtocol(protocol) {
  const value = safeString(protocol).toLowerCase()
  if (value === "onebotv11") return "OneBotV11"
  if (value === "milky") return "Milky"
  if (value === "icqq") return "ICQQ"
  return safeString(protocol, "Unknown")
}

function humanizePlatform(platform) {
  const value = safeString(platform).toLowerCase()
  if (value === "win32") return "Windows"
  if (value === "darwin") return "macOS"
  if (value === "linux") return "Linux"
  return safeString(platform, "Unknown")
}

function resolveDefaultDiskPath(platform = process.platform) {
  if (String(platform).toLowerCase() === "win32") {
    const cwdRoot = path.parse(process.cwd()).root
    if (cwdRoot) return cwdRoot
    return `${process.env.SystemDrive || "C:"}\\`
  }
  return "/"
}

function normalizeComparePath(value, platform = process.platform) {
  const text = safeString(value)
  if (!text) return ""

  let normalized = text.replace(/[\\/]+/g, "/")
  if (String(platform).toLowerCase() === "win32") normalized = normalized.toLowerCase()
  if (normalized.length > 1 && normalized.endsWith("/")) normalized = normalized.slice(0, -1)
  return normalized
}

function pickDiskEntry(entries = [], targetPath = "", platform = process.platform) {
  const list = Array.isArray(entries) ? entries.filter(Boolean) : []
  if (!list.length) return null

  const fallback =
    list
      .filter(item => toFiniteNumber(item?.size) !== null)
      .sort((left, right) => (toFiniteNumber(right?.size) || 0) - (toFiniteNumber(left?.size) || 0))[0] ||
    list[0]

  const target = normalizeComparePath(targetPath, platform)
  if (!target) return fallback

  let best = null
  let bestScore = -1

  for (const entry of list) {
    const mount = safeString(entry?.mount || entry?.fs || entry?.mounted)
    const normalizedMount = normalizeComparePath(mount, platform)
    if (!normalizedMount) continue

    let score = 0
    if (target === normalizedMount) score = 400 + normalizedMount.length
    else if (target.startsWith(`${normalizedMount}/`) || target.startsWith(normalizedMount)) {
      score = 300 + normalizedMount.length
    } else if (normalizedMount.startsWith(`${target}/`) || normalizedMount.startsWith(target)) {
      score = 200 + target.length
    } else if (
      String(platform).toLowerCase() === "win32" &&
      /^[a-z]:/i.test(target) &&
      /^[a-z]:/i.test(normalizedMount) &&
      target.slice(0, 2) === normalizedMount.slice(0, 2)
    ) {
      score = 100 + normalizedMount.length
    }

    if (score > bestScore) {
      bestScore = score
      best = entry
    }
  }

  return best || fallback
}

function pickNetworkInterface(interfaces = []) {
  const list = Array.isArray(interfaces) ? interfaces.filter(Boolean) : []
  if (!list.length) return null

  const candidates = [
    item => item.default === true && item.internal !== true,
    item => safeString(item.operstate).toLowerCase() === "up" && item.internal !== true,
    item => item.internal !== true,
    () => true,
  ]

  for (const matcher of candidates) {
    const found = list.find(matcher)
    if (found) return found
  }
  return null
}

async function safeCall(fn, fallback) {
  try {
    const value = await fn()
    return value === undefined ? fallback : value
  } catch {
    return fallback
  }
}

function resolveAdapterLabel(runtime = {}) {
  const adapterType = safeString(runtime.adapterType)
  if (adapterType && !/^(mock|local)$/i.test(adapterType)) return adapterType
  return humanizeProtocol(runtime.protocol)
}

function buildAccountLine(runtime = {}) {
  const userId = safeString(runtime?.loginInfo?.userId, "N/A")
  return `${userId} · ${runtime.friendCount || 0} Friends & ${runtime.groupCount || 0} Groups`
}

function buildQqAvatarUrl(qqNumber) {
  const qq = safeString(qqNumber)
  if (!/^\d{5,}$/.test(qq)) return ""
  return `https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(qq)}&s=640`
}

function resolveConfiguredAsset(kind, rawValue, runtime = {}) {
  const value = safeString(rawValue)
  if (kind === "avatar") {
    if (/^(bot|bot-avatar)$/i.test(value) || /^builtin:avatar$/i.test(value)) {
      const botAvatar = buildQqAvatarUrl(runtime?.loginInfo?.userId)
      if (botAvatar) {
        return {
          isBuiltin: false,
          path: "",
          src: botAvatar,
        }
      }
    }

    if (/^qq:(\d+)$/i.test(value)) {
      const qqAvatar = buildQqAvatarUrl(RegExp.$1)
      if (qqAvatar) {
        return {
          isBuiltin: false,
          path: "",
          src: qqAvatar,
        }
      }
    }
  }

  if (/^builtin:/i.test(value)) {
    const builtinName = value.slice(8).trim().toLowerCase() || "default"
    return {
      isBuiltin: true,
      path: resolveStatusCardBuiltinAsset(kind, builtinName),
      src: "",
    }
  }

  if (/^https?:\/\//i.test(value) || /^file:\/\//i.test(value)) {
    return {
      isBuiltin: false,
      path: "",
      src: value,
    }
  }

  if (isAbsolutePath(value) && fs.existsSync(value)) {
    return {
      isBuiltin: false,
      path: "",
      src: pathToFileURL(path.resolve(value)).href,
    }
  }

  return {
    isBuiltin: true,
    path: resolveStatusCardBuiltinAsset(kind, "default"),
    src: "",
  }
}

function summarizeGpu(graphics) {
  const controllers = Array.isArray(graphics?.controllers) ? graphics.controllers : []
  const values = []

  for (const controller of controllers) {
    const model = safeString(controller?.model)
    if (!model) continue
    if (!values.includes(model)) values.push(model)
  }

  if (!values.length) return "N/A"
  return trimText(values.slice(0, 2).join(" / "), 84)
}

function toUsagePercent(used, total) {
  const usedNumber = toFiniteNumber(used)
  const totalNumber = toFiniteNumber(total)
  if (usedNumber === null || totalNumber === null || totalNumber <= 0) return null
  return (usedNumber / totalNumber) * 100
}

async function sampleNetworkSnapshot(siLib, sampleMs, waitFn) {
  const interfaces = await safeCall(async () => await siLib.networkInterfaces(), [])
  const selected = pickNetworkInterface(interfaces)
  if (!selected) {
    return {
      enabled: true,
      supported: false,
      name: "N/A",
      ip: "",
      sampleMs,
      downloadBps: null,
      uploadBps: null,
    }
  }

  const ifaceName = safeString(selected.iface || selected.ifaceName || selected.name)
  const first = firstItem(await safeCall(async () => await siLib.networkStats(ifaceName || undefined), []))
  await waitFn(sampleMs)
  const second = firstItem(await safeCall(async () => await siLib.networkStats(ifaceName || undefined), []))

  let downloadBps = toFiniteNumber(second?.rx_sec)
  let uploadBps = toFiniteNumber(second?.tx_sec)

  if ((downloadBps === null || uploadBps === null) && first && second) {
    const seconds = Math.max(sampleMs / 1000, 0.2)
    const rxStart = toFiniteNumber(first.rx_bytes)
    const rxEnd = toFiniteNumber(second.rx_bytes)
    const txStart = toFiniteNumber(first.tx_bytes)
    const txEnd = toFiniteNumber(second.tx_bytes)

    if (rxStart !== null && rxEnd !== null) downloadBps = Math.max(0, (rxEnd - rxStart) / seconds)
    if (txStart !== null && txEnd !== null) uploadBps = Math.max(0, (txEnd - txStart) / seconds)
  }

  return {
    enabled: true,
    supported: downloadBps !== null && uploadBps !== null,
    name: ifaceName || "N/A",
    ip: safeString(selected.ip4 || selected.ip6),
    sampleMs,
    downloadBps,
    uploadBps,
  }
}

export async function collectSystemSnapshot(config = {}, options = {}) {
  const merged = getMergedOptions(options)
  if (merged.systemSnapshot) return merged.systemSnapshot

  const siLib = getSiLibrary(merged)
  const waitFn = getWaitFn(merged)
  const platform = safeString(merged.platform, process.platform).toLowerCase()
  const diskPath =
    safeString(config?.display?.disk_path).toLowerCase() === "auto"
      ? resolveDefaultDiskPath(platform)
      : safeString(config?.display?.disk_path, resolveDefaultDiskPath(platform))
  const sampleMs = clampInteger(config?.display?.net_sample_ms, 1000, 200, 5000)

  const networkPromise =
    config?.display?.show_network === false
      ? Promise.resolve({
          enabled: false,
          supported: false,
          name: "N/A",
          ip: "",
          sampleMs,
          downloadBps: null,
          uploadBps: null,
        })
      : sampleNetworkSnapshot(siLib, sampleMs, waitFn)

  const [load, cpuInfo, cpuSpeed, memory, fsSize, osInfo, graphics, network] = await Promise.all([
    safeCall(async () => await siLib.currentLoad(), {}),
    safeCall(async () => await siLib.cpu(), {}),
    safeCall(
      async () =>
        typeof siLib.cpuCurrentSpeed === "function"
          ? await siLib.cpuCurrentSpeed()
          : typeof siLib.cpuCurrentspeed === "function"
            ? await siLib.cpuCurrentspeed()
            : {},
      {},
    ),
    safeCall(async () => await siLib.mem(), {}),
    safeCall(async () => await siLib.fsSize(), []),
    safeCall(async () => await siLib.osInfo(), {}),
    safeCall(async () => await siLib.graphics(), {}),
    networkPromise,
  ])

  const diskEntry = pickDiskEntry(fsSize, diskPath, platform)
  const usedMemory = toFiniteNumber(memory?.active ?? memory?.used)
  const totalMemory = toFiniteNumber(memory?.total)
  const usedDisk = toFiniteNumber(diskEntry?.used)
  const totalDisk = toFiniteNumber(diskEntry?.size)

  return {
    cpu: {
      model: safeString(cpuInfo?.brand || cpuInfo?.manufacturer, "N/A"),
      usagePercent: toFiniteNumber(load?.currentLoad),
      speedGHz: toFiniteNumber(cpuSpeed?.avg ?? cpuInfo?.speed ?? cpuInfo?.speedMax),
      cores: toFiniteNumber(cpuInfo?.physicalCores ?? cpuInfo?.processors),
      threads: toFiniteNumber(cpuInfo?.cores),
    },
    memory: {
      used: usedMemory,
      total: totalMemory,
      usagePercent: toUsagePercent(usedMemory, totalMemory),
    },
    network,
    disk: {
      path: diskPath,
      mount: safeString(diskEntry?.mount || diskEntry?.fs || diskPath, diskPath),
      used: usedDisk,
      total: totalDisk,
      usagePercent: toUsagePercent(usedDisk, totalDisk),
    },
    system: {
      platform: safeString(osInfo?.platform, platform),
      distro: safeString(osInfo?.distro || osInfo?.codename || osInfo?.platform, humanizePlatform(platform)),
      release: safeString(osInfo?.release || osInfo?.build || os.release()),
      arch: safeString(osInfo?.arch || os.arch()),
      hostname: safeString(osInfo?.hostname || os.hostname()),
    },
    gpu: {
      summary: config?.display?.show_gpu === false ? "Disabled" : summarizeGpu(graphics),
    },
  }
}

async function safeCtxCall(ctx, methodName, fallback) {
  const fn = ctx?.[methodName]
  if (typeof fn !== "function") return fallback
  try {
    const value = await fn.call(ctx)
    return value === undefined ? fallback : value
  } catch {
    return fallback
  }
}

export async function collectRuntimeSnapshot(ctx, options = {}) {
  const merged = getMergedOptions(options)
  if (merged.runtimeSnapshot) return merged.runtimeSnapshot

  const [plugins, commands, friends, groups, loginInfo] = await Promise.all([
    safeCtxCall(ctx, "listPlugins", []),
    safeCtxCall(ctx, "listCommands", []),
    safeCtxCall(ctx, "getFriendList", new Map()),
    safeCtxCall(ctx, "getGroupList", new Map()),
    safeCtxCall(ctx, "getLoginInfo", {}),
  ])

  return {
    protocol: safeString(ctx?.protocol, "unknown"),
    adapterType: safeString(ctx?.adapterType, ""),
    pluginCount: sizeOfCollection(plugins),
    commandCount: sizeOfCollection(commands),
    friendCount: sizeOfCollection(friends),
    groupCount: sizeOfCollection(groups),
    loginInfo: {
      userId: safeString(loginInfo?.user_id || loginInfo?.uin || loginInfo?.id, "N/A"),
      nickname: safeString(loginInfo?.nickname || loginInfo?.name || loginInfo?.nick, ""),
    },
    appVersion: safeString(cfg?.packageInfo?.version, "0.1.0"),
  }
}

function resolveBadgeText(config = {}, runtime = {}) {
  const badgeMode = safeString(config?.theme?.badge_mode, "adapter").toLowerCase()
  if (badgeMode === "none") return ""
  if (badgeMode === "protocol") return humanizeProtocol(runtime.protocol)
  if (badgeMode === "title") return safeString(config?.theme?.title, "")
  return resolveAdapterLabel(runtime)
}

function buildCpuMetric(system = {}) {
  const usageText = formatPercent(system?.cpu?.usagePercent)
  const speedText = formatFrequencyGHz(system?.cpu?.speedGHz)
  const value =
    usageText === "N/A" && speedText === "N/A"
      ? "N/A"
      : usageText === "N/A"
        ? speedText
        : speedText === "N/A"
          ? usageText
          : `${usageText} (${speedText})`

  const cores = toFiniteNumber(system?.cpu?.cores)
  const threads = toFiniteNumber(system?.cpu?.threads)
  const noteParts = []
  if (cores !== null) noteParts.push(`${cores} cores`)
  if (threads !== null) noteParts.push(`${threads} threads`)
  return {
    tone: "cpu",
    shortLabel: "C",
    label: "CPU",
    value,
    note: noteParts.join(" / ") || "N/A",
  }
}

function buildMemoryMetric(system = {}) {
  return {
    tone: "ram",
    shortLabel: "R",
    label: "RAM",
    value: formatUsageLine(system?.memory?.used, system?.memory?.total),
    note:
      system?.memory?.usagePercent !== null && system?.memory?.usagePercent !== undefined
        ? `${formatPercent(system.memory.usagePercent)} used`
        : "N/A",
  }
}

function buildNetworkMetric(system = {}, config = {}) {
  const network = system?.network || {}
  let value = "N/A"
  let note = "N/A"

  if (config?.display?.show_network === false || network.enabled === false) {
    note = "disabled by config"
  } else if (network.supported) {
    value = `${formatSpeed(network.downloadBps)} / ${formatSpeed(network.uploadBps)}`
    const parts = []
    if (safeString(network.name)) parts.push(network.name)
    if (safeString(network.ip)) parts.push(network.ip)
    parts.push(formatSampleMs(network.sampleMs))
    note = parts.join(" · ")
  } else {
    note = safeString(network.name, "No active interface")
  }

  return {
    tone: "net",
    shortLabel: "N",
    label: "NET",
    value,
    note,
  }
}

function buildDiskMetric(system = {}) {
  const disk = system?.disk || {}
  const noteParts = []
  if (safeString(disk.mount)) noteParts.push(disk.mount)
  if (disk.usagePercent !== null && disk.usagePercent !== undefined) {
    noteParts.push(`${formatPercent(disk.usagePercent)} used`)
  }

  return {
    tone: "disk",
    shortLabel: "D",
    label: "DISK",
    value: formatUsageLine(disk.used, disk.total),
    note: noteParts.join(" · ") || "N/A",
  }
}

export function createStatusCardViewModel({ system = {}, runtime = {}, config = {}, now = new Date() } = {}) {
  const generatedAt = formatDateTime(now)
  const displayName = safeString(runtime?.loginInfo?.nickname, safeString(config?.theme?.title, "xunlu-core"))
  const cardTitle = safeString(config?.theme?.title, safeString(runtime?.loginInfo?.userId, "Status Card"))
  const badgeText = resolveBadgeText(config, runtime)
  const adapterText = resolveAdapterLabel(runtime)
  const accountLine = buildAccountLine(runtime)
  const footerMeta = `${displayName} · v${safeString(runtime?.appVersion, "0.1.0")} · ${generatedAt}`
  const systemLine = trimText(
    [safeString(system?.system?.distro), safeString(system?.system?.release), safeString(system?.system?.arch)]
      .filter(Boolean)
      .join(" / "),
    88,
  )

  return {
    heroBackground: resolveConfiguredAsset("background", config?.theme?.background, runtime),
    avatarImage: resolveConfiguredAsset("avatar", config?.theme?.avatar, runtime),
    doodleImage: resolveConfiguredAsset("doodle", config?.theme?.doodle),
    displayName,
    cardTitle,
    badgeText,
    metrics: [
      buildCpuMetric(system),
      buildMemoryMetric(system),
      buildNetworkMetric(system, config),
      buildDiskMetric(system),
    ],
    metaRows: [
      { label: "CPU", value: trimText(system?.cpu?.model || "N/A", 88) },
      { label: "System", value: systemLine || "N/A" },
      { label: "GPU", value: trimText(system?.gpu?.summary || "N/A", 88) },
      { label: "Plugins", value: `${runtime?.pluginCount || 0} loaded` },
      { label: "Features", value: `${runtime?.commandCount || 0} commands` },
      { label: "Adapter", value: `${adapterText} / ${humanizeProtocol(runtime?.protocol)}` },
      { label: "Account", value: trimText(accountLine, 88) },
    ],
    footerSignature: safeString(config?.theme?.footer_signature, "Kawaii Status"),
    footerMeta,
  }
}

export async function prepareStatusCardRenderData(viewModel = {}, options = {}) {
  const source = viewModel && typeof viewModel === "object" ? viewModel : {}
  const next = {
    ...source,
    heroBackground:
      source.heroBackground && typeof source.heroBackground === "object"
        ? { ...source.heroBackground }
        : source.heroBackground,
  }

  const backgroundSrc = safeString(next?.heroBackground?.src)
  if (backgroundSrc && /^https?:\/\//i.test(backgroundSrc)) {
    const inlined = await fetchRemoteImageAsDataUrl(backgroundSrc, options)
    if (inlined) next.heroBackground.src = inlined
  }

  return next
}

export function buildStatusCardFallbackText(viewModel = {}) {
  const metrics = Array.isArray(viewModel.metrics) ? viewModel.metrics : []
  const metaRows = Array.isArray(viewModel.metaRows) ? viewModel.metaRows : []
  const lines = [
    `${safeString(viewModel.displayName, "Status Card")} | ${safeString(viewModel.cardTitle, "系统状态")}`,
  ]

  if (safeString(viewModel.badgeText)) {
    lines.push(`Badge: ${viewModel.badgeText}`)
  }

  lines.push("")

  for (const metric of metrics) {
    lines.push(`${metric.label}: ${metric.value}`)
    if (safeString(metric.note)) lines.push(`  ${metric.note}`)
  }

  lines.push("")

  for (const row of metaRows) {
    lines.push(`${row.label}: ${row.value}`)
  }

  lines.push("")
  lines.push(`${safeString(viewModel.footerSignature, "Kawaii Status")} | ${safeString(viewModel.footerMeta)}`)
  return lines.join("\n").trim()
}

function buildEmptySystemSnapshot(config = {}) {
  return {
    cpu: {
      model: "N/A",
      usagePercent: null,
      speedGHz: null,
      cores: null,
      threads: null,
    },
    memory: {
      used: null,
      total: null,
      usagePercent: null,
    },
    network: {
      enabled: config?.display?.show_network !== false,
      supported: false,
      name: "N/A",
      ip: "",
      sampleMs: clampInteger(config?.display?.net_sample_ms, 1000, 200, 5000),
      downloadBps: null,
      uploadBps: null,
    },
    disk: {
      path: resolveDefaultDiskPath(process.platform),
      mount: resolveDefaultDiskPath(process.platform),
      used: null,
      total: null,
      usagePercent: null,
    },
    system: {
      platform: process.platform,
      distro: humanizePlatform(process.platform),
      release: os.release(),
      arch: os.arch(),
      hostname: os.hostname(),
    },
    gpu: {
      summary: config?.display?.show_gpu === false ? "Disabled" : "N/A",
    },
  }
}

function buildEmptyRuntimeSnapshot() {
  return {
    protocol: "unknown",
    adapterType: "",
    pluginCount: 0,
    commandCount: 0,
    friendCount: 0,
    groupCount: 0,
    loginInfo: {
      userId: "N/A",
      nickname: "",
    },
    appVersion: safeString(cfg?.packageInfo?.version, "0.1.0"),
  }
}

export async function buildStatusCardPayload(ctx, config = {}, options = {}) {
  const merged = getMergedOptions(options)
  const now = getNowValue(merged)

  let systemSnapshot
  let runtimeSnapshot

  try {
    systemSnapshot = await collectSystemSnapshot(config, merged)
  } catch {
    systemSnapshot = buildEmptySystemSnapshot(config)
  }

  try {
    runtimeSnapshot = await collectRuntimeSnapshot(ctx, merged)
  } catch {
    runtimeSnapshot = buildEmptyRuntimeSnapshot()
  }

  const data = createStatusCardViewModel({
    system: systemSnapshot || buildEmptySystemSnapshot(config),
    runtime: runtimeSnapshot || buildEmptyRuntimeSnapshot(),
    config,
    now,
  })

  return {
    data,
    fallbackText: buildStatusCardFallbackText(data),
    snapshots: {
      system: systemSnapshot,
      runtime: runtimeSnapshot,
    },
  }
}

