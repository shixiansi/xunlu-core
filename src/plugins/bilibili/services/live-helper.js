import fs from "node:fs"

import { segment } from "../../../Bot/message/index.js"
import { createVideoTooLargeError } from "./video-planner.js"

export const BILIBILI_LIVE_CLIP_DURATION_SEC = 10
export const BILIBILI_LIVE_CLIP_MAX_RESULT_BYTES = 45 * 1024 * 1024

export function formatLiveStatus(status) {
  return Number(status) === 1 ? "直播中" : "未开播"
}

export function pickLiveStream(playInfo = {}) {
  const streams = Array.isArray(playInfo?.streams) ? playInfo.streams : []
  if (streams.length === 0) return null

  const formatPriority = { ts: 3, fmp4: 2, flv: 1 }
  const protocolPriority = { http_hls: 3, http_stream: 2 }

  return [...streams].sort((a, b) => {
    const protocolDiff =
      Number(protocolPriority[b?.protocolName] || 0) - Number(protocolPriority[a?.protocolName] || 0)
    if (protocolDiff !== 0) return protocolDiff

    const formatDiff =
      Number(formatPriority[b?.formatName] || 0) - Number(formatPriority[a?.formatName] || 0)
    if (formatDiff !== 0) return formatDiff

    const httpsDiff = Number(/^https:\/\//i.test(b?.url || "")) - Number(/^https:\/\//i.test(a?.url || ""))
    if (httpsDiff !== 0) return httpsDiff

    return Number(b?.qn || 0) - Number(a?.qn || 0)
  })[0]
}

export async function sendBilibiliLiveClip(ctx, roomInfo = {}, deps = {}) {
  if (Number(roomInfo?.live_status) !== 1) return null

  const {
    bili,
    ffmpeg: ffmpegApi,
    cachePaths,
    cleanupTempFiles = () => {},
    fsModule = fs,
    segmentApi = segment,
  } = deps

  const playInfo = await bili.getLivePlayInfo(roomInfo.room_id)
  if (playInfo?.code) {
    throw new Error(playInfo.message || "获取直播流失败")
  }

  const selectedStream = pickLiveStream(playInfo)
  if (!selectedStream?.url) {
    throw new Error("未找到可用的直播流")
  }

  const clipPath = cachePaths.getLiveClipPath(roomInfo.room_id)
  try {
    await ffmpegApi.saveVideoClip(selectedStream.url, clipPath, {
      durationSec: BILIBILI_LIVE_CLIP_DURATION_SEC,
    })

    const clipSize = fsModule.statSync(clipPath).size
    if (clipSize > BILIBILI_LIVE_CLIP_MAX_RESULT_BYTES) {
      throw createVideoTooLargeError("live_clip", clipSize, BILIBILI_LIVE_CLIP_MAX_RESULT_BYTES)
    }

    return await ctx.reply(segmentApi.video(clipPath))
  } finally {
    cleanupTempFiles([clipPath], "直播切片")
  }
}
