import { UniversalMessage, UniversalSegmentType } from "../../../Bot/message/universal-message.js"

import { filterLearningSegments } from "./signature.js"

function uniqueProtocols(list) {
  const out = []
  const seen = new Set()
  for (const item of list) {
    const p = String(item || "").toLowerCase().trim()
    if (!p) continue
    if (seen.has(p)) continue
    seen.add(p)
    out.push(p)
  }
  return out
}

function looksLikeUniversalSegments(rawSegments) {
  const arr = Array.isArray(rawSegments) ? rawSegments : []
  if (!arr.length) return false
  const types = Object.values(UniversalSegmentType)
  return arr.some(seg => seg && typeof seg === "object" && types.includes(seg.type))
}

export function rawToLearningSegments(rawSegments, { protocolHints = [] } = {}) {
  const arr = Array.isArray(rawSegments) ? rawSegments : []
  if (!arr.length) return []

  // icqq 流程里 MessageDB 可能存的是 Universal 段，直接走过滤即可
  if (looksLikeUniversalSegments(arr)) {
    return filterLearningSegments(arr)
  }

  const protocols = uniqueProtocols([
    ...protocolHints,
    "milky",
    "onebotv11",
    "icqq",
  ])

  let best = []
  let bestScore = -1

  for (const p of protocols) {
    try {
      const universal = UniversalMessage.from(p, arr).segments
      const segments = filterLearningSegments(universal)
      if (!segments.length) continue
      // 简单评分：段越多越好，其次偏好含图片/表情
      const hasImg = segments.some(s => s?.type === UniversalSegmentType.IMAGE)
      const hasFace = segments.some(s => s?.type === UniversalSegmentType.EMOJI)
      const score = segments.length * 10 + (hasImg ? 5 : 0) + (hasFace ? 2 : 0)
      if (score > bestScore) {
        best = segments
        bestScore = score
      }
    } catch {
      // try next
    }
  }

  return best
}

