import { VIDEO_MAX_BYTES } from "./douyin-runtime.js"

export const DOUYIN_VIDEO_MAX_DURATION_SEC = 30 * 60

const DOUYIN_VIDEO_DURATION_RULES = [
  {
    minDuration: 720,
    maxHeight: 360,
    fallbackIndex: 5,
    message: "视频时长超过12分钟",
  },
  {
    minDuration: 480,
    maxHeight: 480,
    fallbackIndex: 4,
    message: "视频时长超过8分钟",
  },
  {
    minDuration: 300,
    maxHeight: 720,
    fallbackIndex: 3,
    message: "视频时长超过5分钟",
  },
  {
    minDuration: 180,
    maxHeight: 1080,
    fallbackIndex: 2,
    message: "视频时长超过3分钟",
  },
  {
    minDuration: 120,
    maxHeight: 1080,
    fallbackIndex: 1,
    message: "视频时长超过2分钟",
  },
]

export function getVideoStreamHeight(stream = {}) {
  const directHeight = Number(stream?.height || stream?.maxHeight || stream?.max_height || 0)
  if (Number.isFinite(directHeight) && directHeight > 0) return Math.floor(directHeight)

  const label = String(stream?.qualityLabel || stream?.quality_label || "")
    .trim()
    .toLowerCase()
  if (!label) return 0

  const matched = label.match(/(2160|1440|1080|960|720|540|480|360|240)p/i)
  return matched ? Number(matched[1]) : 0
}

export function formatVideoStreamQuality(stream = {}) {
  const label = String(stream?.qualityLabel || stream?.quality_label || "").trim()
  if (label) return label

  const height = getVideoStreamHeight(stream)
  if (height > 0) return `${height}P`

  return "当前可用档位"
}

export function getVideoStreamDataSize(stream = {}) {
  const size = Number(stream?.dataSize ?? stream?.data_size ?? 0)
  return Number.isFinite(size) && size > 0 ? Math.floor(size) : 0
}

export function getOrderedVideoStreams(aweme = {}) {
  const streams = Array.isArray(aweme?.video?.streams)
    ? aweme.video.streams.filter(item => String(item?.url || "").trim())
    : []
  if (streams.length > 0) return streams

  const fallbackUrl = String(aweme?.video?.url || "").trim()
  return fallbackUrl ? [{ url: fallbackUrl, qualityLabel: "默认" }] : []
}

export function getVideoSkipReason(aweme = {}) {
  const durationSec = Number(aweme?.video?.duration || 0)
  if (durationSec > DOUYIN_VIDEO_MAX_DURATION_SEC) {
    return `视频时长超过30分钟，已跳过视频解析，请前往抖音查看原链接。\n链接：${aweme?.link || "无"}`
  }

  const streams = getOrderedVideoStreams(aweme)
  const sizedStreams = streams.map(getVideoStreamDataSize).filter(size => size > 0)
  if (sizedStreams.length > 0 && sizedStreams.every(size => size > VIDEO_MAX_BYTES)) {
    return `当前视频所有可用清晰度均超过 ${Math.round(VIDEO_MAX_BYTES / 1024 / 1024)}MB，已跳过视频发送，请前往抖音查看原链接。\n链接：${aweme?.link || "无"}`
  }

  return ""
}

export function isOversizedVideoError(err) {
  const message = String(err?.message || err || "")
  return /download size exceeds limit/i.test(message) || /video too large/i.test(message)
}

export function pickPreferredVideoPlan(aweme = {}) {
  const streams = getOrderedVideoStreams(aweme)
  const durationSec = Number(aweme?.video?.duration || 0)

  if (streams.length === 0) {
    return {
      durationSec,
      streams,
      startIndex: -1,
      selectedStream: null,
      notice: "",
    }
  }

  const rule = DOUYIN_VIDEO_DURATION_RULES.find(item => durationSec >= item.minDuration) || null
  if (!rule) {
    return {
      durationSec,
      streams,
      startIndex: 0,
      selectedStream: streams[0],
      notice: "",
    }
  }

  let startIndex = streams.findIndex(stream => {
    const height = getVideoStreamHeight(stream)
    return height > 0 && height <= rule.maxHeight
  })
  if (startIndex < 0) {
    startIndex = Math.min(rule.fallbackIndex, streams.length - 1)
  }

  const selectedStream = streams[startIndex] || streams[0]
  return {
    durationSec,
    streams,
    startIndex,
    selectedStream,
    notice:
      startIndex > 0
        ? `${rule.message}，已自动降级到 ${formatVideoStreamQuality(selectedStream)}`
        : "",
  }
}
