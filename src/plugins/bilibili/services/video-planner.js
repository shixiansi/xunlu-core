export const BILIBILI_VIDEO_MAX_SOURCE_BYTES = 80 * 1024 * 1024
export const BILIBILI_VIDEO_MAX_RESULT_BYTES = 70 * 1024 * 1024

const BILIBILI_VIDEO_QUALITY_LABELS = {
  120: "4K",
  116: "1080P60",
  112: "1080P+",
  80: "1080P",
  74: "720P60",
  64: "720P",
  32: "480P",
  16: "360P",
}

export function formatBytes(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

export function formatVideoQuality(qn) {
  const normalized = Number(qn)
  return BILIBILI_VIDEO_QUALITY_LABELS[normalized] || `QN ${qn}`
}

export function createVideoTooLargeError(stage, actualBytes, limitBytes) {
  const error = new Error(`video too large at ${stage}: ${actualBytes} > ${limitBytes}`)
  error.code = "BILIBILI_VIDEO_TOO_LARGE"
  error.stage = stage
  error.actualBytes = Number(actualBytes) || 0
  error.limitBytes = Number(limitBytes) || 0
  return error
}

export function normalizeVideoSizeError(err) {
  if (err?.code === "BILIBILI_VIDEO_TOO_LARGE") return err
  const message = String(err?.message || err || "")
  const matched = message.match(/download size exceeds limit(?: before resume)?: (\d+) > (\d+)/i)
  if (!matched) return err
  return createVideoTooLargeError("download", Number(matched[1]), Number(matched[2]))
}

export function estimateMuxedVideoBytes({
  duration = 0,
  videoBandwidth = 0,
  audioBandwidth = 0,
  overheadRatio = 1.03,
} = {}) {
  const seconds = Number(duration)
  const videoBitsPerSec = Number(videoBandwidth)
  const audioBitsPerSec = Number(audioBandwidth)
  if (!Number.isFinite(seconds) || seconds <= 0) return 0
  if (!Number.isFinite(videoBitsPerSec) || videoBitsPerSec <= 0) return 0
  const totalBitsPerSec = videoBitsPerSec + (Number.isFinite(audioBitsPerSec) ? audioBitsPerSec : 0)
  return Math.ceil((totalBitsPerSec * seconds * overheadRatio) / 8)
}

export function pickEstimatedSendableStream(
  playInfo = {},
  preferredQn,
  limitBytes = BILIBILI_VIDEO_MAX_RESULT_BYTES,
) {
  const streams = Array.isArray(playInfo?.videoStreams) ? playInfo.videoStreams : []
  const audioBandwidth = Number(playInfo?.audioBandwidth || playInfo?.audioStream?.bandwidth || 0)
  const duration = Number(playInfo?.duration || 0)
  if (streams.length === 0) return null

  const uniqueSorted = [...streams]
    .filter(item => Number.isFinite(Number(item?.qn)) && item?.url)
    .sort((a, b) => Number(b.qn) - Number(a.qn))

  const preferred = Number(preferredQn)
  const preferredList = uniqueSorted.filter(item =>
    Number.isFinite(preferred) ? Number(item.qn) <= preferred : true,
  )
  const candidates = preferredList.length > 0 ? preferredList : uniqueSorted

  for (const item of candidates) {
    const estimatedBytes = estimateMuxedVideoBytes({
      duration,
      videoBandwidth: item.bandwidth,
      audioBandwidth,
    })
    if (!estimatedBytes || estimatedBytes <= limitBytes) {
      return {
        ...item,
        estimatedBytes,
        duration,
        audioBandwidth,
      }
    }
  }

  return {
    ...candidates[candidates.length - 1],
    estimatedBytes: estimateMuxedVideoBytes({
      duration,
      videoBandwidth: candidates[candidates.length - 1]?.bandwidth,
      audioBandwidth,
    }),
    duration,
    audioBandwidth,
    exceedsLimit: true,
  }
}
