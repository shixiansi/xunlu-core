import {
  UniversalSegmentType,
  classifyMediaReference,
} from "../../../Bot/message/index.js"
import { applyRkeyToUrl, getSceneRkey } from "../../../utils/rkey.js"

function isOnebotLikeProtocol(protocol) {
  const text = String(protocol || "").trim().toLowerCase()
  return text.includes("onebot")
}

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value)
}

function isQqNtMediaUrl(value) {
  return isHttpUrl(value) && String(value).startsWith("https://multimedia.nt.qq.com.cn")
}

function getImageCandidateUrl(data = {}) {
  const candidates = [data.url, data.file, data.temp_url, data.fileId, data.path, data.uri]
  return candidates.find(value => isHttpUrl(value)) || ""
}

function getOnebotDirectImageRef(data = {}) {
  const candidates = [data.file, data.id, data.fileId, data.path, data.uri, data.url]
  for (const raw of candidates) {
    const text = String(raw || "").trim()
    if (!text) continue
    const kind = classifyMediaReference(text).kind
    if (kind === "base64" || kind === "fileUri") return text
    if (kind === "absolutePath" || kind === "relativePath" || kind === "opaqueId") return text
    if (kind === "url" || kind === "dataUri" || kind === "basename" || kind === "empty") continue
  }
  return ""
}

const imageBase64Cache = new Map()

function cleanupExpiredImageCache(now = Date.now()) {
  if (imageBase64Cache.size <= 200) return
  for (const [key, item] of imageBase64Cache.entries()) {
    if (!item || !item.expireAt || item.expireAt <= now) imageBase64Cache.delete(key)
  }
}

async function downloadImageAsBase64(url, { timeoutMs = 8000 } = {}) {
  const raw = String(url || "").trim()
  if (!raw) return ""

  const now = Date.now()
  const hit = imageBase64Cache.get(raw)
  if (hit && hit.expireAt > now && hit.value) return hit.value

  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(),
    Math.max(1000, Math.floor(Number(timeoutMs) || 8000)),
  )

  try {
    const res = await fetch(raw, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        Referer: "https://im.qq.com/",
      },
    })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`)
    }

    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length) return ""

    const value = `base64://${buf.toString("base64")}`
    imageBase64Cache.set(raw, { value, expireAt: now + 10 * 60 * 1000 })
    cleanupExpiredImageCache(now)
    return value
  } finally {
    clearTimeout(timer)
  }
}

export function patchImageSegmentsWithRkeyValue(segments, rkeySuffix = "") {
  const list = Array.isArray(segments) ? segments : []
  const suffix = String(rkeySuffix || "").trim()
  if (!list.length || !suffix) return list

  let changed = false
  const out = list.map(seg => {
    if (!seg || seg.type !== UniversalSegmentType.IMAGE) return seg
    const data = seg.data && typeof seg.data === "object" ? seg.data : {}
    const next = { ...seg, data: { ...data } }

    const patchHttpField = (key, { mirrorToUrl = true } = {}) => {
      if (typeof next.data[key] !== "string" || !/^https?:\/\//.test(next.data[key])) return
      const patched = applyRkeyToUrl(next.data[key], suffix)
      if (!patched) return
      if (patched !== next.data[key]) {
        next.data[key] = patched
        changed = true
      }
      if (mirrorToUrl && patched !== next.data.url) {
        next.data.url = patched
        changed = true
      }
    }

    patchHttpField("url", { mirrorToUrl: false })
    patchHttpField("temp_url")
    patchHttpField("file")
    patchHttpField("fileId")
    patchHttpField("path")
    patchHttpField("uri")

    return next
  })

  return changed ? out : list
}

export async function prepareOutboundLearningSegments(
  segments,
  {
    protocol = "",
    runtimeProtocolHint = "",
    rkeySuffix = undefined,
    downloadImage = downloadImageAsBase64,
  } = {},
) {
  const list = Array.isArray(segments) ? segments : []
  if (!list.length) return list

  const protocolName = String(protocol || runtimeProtocolHint || globalThis.Bot?.adapterType || "")
    .trim()
    .toLowerCase()

  let resolvedRkeySuffix = rkeySuffix === undefined ? undefined : String(rkeySuffix || "").trim()
  let rkeyLoaded = resolvedRkeySuffix !== undefined
  const ensureRkeySuffix = async () => {
    if (!rkeyLoaded) {
      rkeyLoaded = true
      resolvedRkeySuffix = String((await getSceneRkey("group"))?.value || "").trim()
    }
    return resolvedRkeySuffix || ""
  }

  if (!isOnebotLikeProtocol(protocolName)) {
    let changed = false
    let working = list

    if (list.some(seg => isQqNtMediaUrl(getImageCandidateUrl(seg?.data || {})))) {
      const suffix = await ensureRkeySuffix()
      const patched = patchImageSegmentsWithRkeyValue(list, suffix)
      if (patched !== list) {
        working = patched
        changed = true
      }
    }

    const out = await Promise.all(
      working.map(async seg => {
        if (!seg || seg.type !== UniversalSegmentType.IMAGE) return seg
        const data = seg.data && typeof seg.data === "object" ? { ...seg.data } : {}
        const candidateUrl = getImageCandidateUrl(data)
        if (!isQqNtMediaUrl(candidateUrl)) return seg

        try {
          const base64 = typeof downloadImage === "function" ? await downloadImage(candidateUrl) : ""
          if (!base64) throw new Error("empty image body")
          changed = true
          delete data.temp_url
          if (isHttpUrl(data.fileId)) delete data.fileId
          if (isHttpUrl(data.path)) delete data.path
          if (isHttpUrl(data.uri)) delete data.uri
          return {
            ...seg,
            data: {
              ...data,
              url: base64,
            },
          }
        } catch {
          if (data.url === candidateUrl) return seg
          changed = true
          return {
            ...seg,
            data: {
              ...data,
              url: candidateUrl,
            },
          }
        }
      }),
    )

    return changed ? out : working
  }

  let changed = false
  const out = await Promise.all(
    list.map(async seg => {
      if (!seg || seg.type !== UniversalSegmentType.IMAGE) return seg
      const data = seg.data && typeof seg.data === "object" ? { ...seg.data } : {}
      const stripUnsafeBasenameRefs = nextData => {
        let removed = false
        for (const key of ["fileId", "path", "uri"]) {
          if (classifyMediaReference(nextData?.[key]).kind === "basename") {
            delete nextData[key]
            removed = true
          }
        }
        return removed
      }

      const originalUrl = getImageCandidateUrl(data)
      if (originalUrl) {
        let outboundUrl = originalUrl
        if (isQqNtMediaUrl(originalUrl)) {
          const suffix = await ensureRkeySuffix()
          outboundUrl = suffix ? applyRkeyToUrl(originalUrl, suffix) : originalUrl
          try {
            const base64 = typeof downloadImage === "function" ? await downloadImage(outboundUrl) : ""
            if (!base64) throw new Error("empty image body")
            changed = true
            delete data.temp_url
            if (isHttpUrl(data.fileId)) delete data.fileId
            if (isHttpUrl(data.path)) delete data.path
            if (isHttpUrl(data.uri)) delete data.uri
            return {
              ...seg,
              data: {
                ...data,
                url: base64,
              },
            }
          } catch (err) {
            if (isHttpUrl(outboundUrl)) {
              changed = true
              delete data.temp_url
              stripUnsafeBasenameRefs(data)
              return {
                ...seg,
                data: {
                  ...data,
                  url: outboundUrl,
                },
              }
            }
            const fallbackRef = getOnebotDirectImageRef(data)
            if (fallbackRef) {
              changed = true
              delete data.temp_url
              delete data.uri
              delete data.path
              return {
                ...seg,
                data: {
                  ...data,
                  url: "",
                  fileId: fallbackRef,
                },
              }
            }
            changed = true
            console.warn("[learning_chat] QQNT image fallback to text:", err?.message || err)
            return {
              type: UniversalSegmentType.TEXT,
              data: { content: String(data.summary || "[图片]") },
            }
          }
        }

        const removedUnsafeRefs = stripUnsafeBasenameRefs(data)
        if (outboundUrl !== data.url || removedUnsafeRefs) {
          changed = true
          return {
            ...seg,
            data: {
              ...data,
              url: outboundUrl,
            },
          }
        }
        return seg
      }

      const directRef = getOnebotDirectImageRef(data)
      if (directRef) {
        changed = true
        delete data.temp_url
        delete data.uri
        delete data.path
        return {
          ...seg,
          data: {
            ...data,
            url: "",
            fileId: directRef,
          },
        }
      }

      if ([data.fileId, data.path, data.uri, data.url].some(v => classifyMediaReference(v).kind === "basename")) {
        changed = true
        console.warn("[learning_chat] basename-only image fallback to text:", data)
        return {
          type: UniversalSegmentType.TEXT,
          data: { content: String(data.summary || "[图片]") },
        }
      }

      const suffix = await ensureRkeySuffix()
      const candidateUrl = suffix ? applyRkeyToUrl(getImageCandidateUrl(data), suffix) : getImageCandidateUrl(data)
      if (!isQqNtMediaUrl(candidateUrl)) return seg

      try {
        const base64 = typeof downloadImage === "function" ? await downloadImage(candidateUrl) : ""
        if (!base64) throw new Error("empty image body")
        changed = true
        delete data.temp_url
        if (isHttpUrl(data.fileId)) delete data.fileId
        if (isHttpUrl(data.path)) delete data.path
        if (isHttpUrl(data.uri)) delete data.uri
        return {
          ...seg,
          data: {
            ...data,
            url: base64,
          },
        }
      } catch (err) {
        if (isHttpUrl(candidateUrl)) {
          changed = true
          delete data.temp_url
          stripUnsafeBasenameRefs(data)
          return {
            ...seg,
            data: {
              ...data,
              url: candidateUrl,
            },
          }
        }
        const fallbackRef = getOnebotDirectImageRef(data)
        if (fallbackRef) {
          changed = true
          delete data.temp_url
          delete data.uri
          delete data.path
          return {
            ...seg,
            data: {
              ...data,
              url: "",
              fileId: fallbackRef,
            },
          }
        }
        changed = true
        console.warn("[learning_chat] QQNT image fallback to text:", err?.message || err)
        return {
          type: UniversalSegmentType.TEXT,
          data: { content: String(data.summary || "[图片]") },
        }
      }
    }),
  )

  return changed ? out : list
}

export async function sendLearningSegments(
  gid,
  segments,
  {
    send,
    protocol = "",
    runtimeProtocolHint = "",
    rkeySuffix = undefined,
    downloadImage = downloadImageAsBase64,
    afterSend = null,
  } = {},
) {
  const sendFn = send || globalThis.Bot?.sendMessage
  if (typeof sendFn !== "function") return false

  const outbound = await prepareOutboundLearningSegments(segments, {
    protocol,
    runtimeProtocolHint,
    rkeySuffix,
    downloadImage,
  }).catch(() => segments)

  await sendFn({ group_id: Number(gid) || gid }, outbound)
  if (typeof afterSend === "function") afterSend(gid)
  return true
}
