import crypto from "node:crypto"

import { UniversalSegmentType } from "../../../Bot/message/universal-message.js"

function toInt(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.floor(n) : undefined
}

function normalizeHttpUrl(raw) {
  const url = String(raw || "").trim()
  if (!url) return ""
  try {
    const u = new URL(url)
    u.hash = ""
    const params = u.searchParams
    for (const k of Array.from(params.keys())) {
      const kl = String(k).toLowerCase()
      if (kl === "rkey" || kl === "reky") params.delete(k)
    }
    const entries = Array.from(params.entries()).sort((a, b) => {
      const k = String(a[0]).localeCompare(String(b[0]))
      if (k !== 0) return k
      return String(a[1]).localeCompare(String(b[1]))
    })
    const stable = new URLSearchParams(entries).toString()
    u.search = stable ? `?${stable}` : ""
    return u.toString()
  } catch {
    return url
      .replace(/([?&])(rkey|reky)=[^&]*/gi, "$1")
      .replace(/\?&/, "?")
      .replace(/&&+/, "&")
      .replace(/[?&]$/, "")
  }
}

function tryMilkyResourceSha1(resourceId) {
  const raw = String(resourceId || "").trim()
  if (!raw) return ""
  try {
    const buf = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64")
    if (buf.length >= 22 && buf[0] === 0x12 && buf[1] === 0x14) {
      return buf.slice(2, 22).toString("hex").toUpperCase()
    }
  } catch {}
  return ""
}

function normalizeMediaKey(raw) {
  const text = String(raw || "").trim()
  if (!text) return ""
  if (text.startsWith("base64://")) return `base64:${text.length}`
  if (text.startsWith("file://")) return `file:${text.slice("file://".length)}`
  if (text.startsWith("http://") || text.startsWith("https://")) return normalizeHttpUrl(text)
  return text
}

export function filterLearningSegments(segments) {
  const src = Array.isArray(segments) ? segments : []
  const out = []
  for (const seg of src) {
    if (!seg || typeof seg !== "object") continue
    const type = String(seg.type || "")
    const data = seg.data && typeof seg.data === "object" ? seg.data : {}

    if (type === UniversalSegmentType.TEXT) {
      const content = String(data.content ?? "").replace(/\s+/g, " ").trim()
      if (!content) continue
      out.push({ type: UniversalSegmentType.TEXT, data: { content } })
      continue
    }

    if (type === UniversalSegmentType.EMOJI) {
      const id = toInt(data.id)
      if (id === undefined) continue
      out.push({ type: UniversalSegmentType.EMOJI, data: { id } })
      continue
    }

    if (type === UniversalSegmentType.IMAGE) {
      const url = data.url ?? ""
      const fileId = data.fileId ?? ""
      const path = data.path ?? ""
      if (!url && !fileId && !path) continue
      out.push({
        type: UniversalSegmentType.IMAGE,
        data: {
          url: url || undefined,
          fileId: fileId || undefined,
          path: path || undefined,
          summary: data.summary,
          name: data.name,
          width: data.width,
          height: data.height,
        },
      })
      continue
    }
  }
  return out
}

export function buildSignature(segments) {
  const parts = []
  let textLen = 0
  let textJoined = ""

  for (const seg of segments) {
    const type = seg.type
    const data = seg.data || {}
    if (type === UniversalSegmentType.TEXT) {
      const content = String(data.content ?? "").replace(/\s+/g, " ").trim()
      if (!content) continue
      textLen += content.length
      textJoined += content
      parts.push(`t:${content}`)
      continue
    }
    if (type === UniversalSegmentType.EMOJI) {
      const id = toInt(data.id)
      if (id === undefined) continue
      parts.push(`face:${id}`)
      continue
    }
    if (type === UniversalSegmentType.IMAGE) {
      const milkySha1 = tryMilkyResourceSha1(data.fileId)
      const key = milkySha1
        ? `milkysha1:${milkySha1}`
        : normalizeMediaKey(data.fileId || data.url || data.path || "")
      parts.push(key ? `img:${key}` : "img")
      continue
    }
  }

  const sig = parts.join("|").trim()
  const hash = sig ? crypto.createHash("md5").update(sig).digest("hex") : ""

  const preview = segments
    .map(seg => {
      if (seg.type === UniversalSegmentType.TEXT) return String(seg.data?.content ?? "")
      if (seg.type === UniversalSegmentType.EMOJI) return `[face:${seg.data?.id ?? ""}]`
      if (seg.type === UniversalSegmentType.IMAGE) return "[image]"
      return ""
    })
    .filter(Boolean)
    .join("")
    .trim()

  return { sig, hash, preview, textLen, textJoined }
}

