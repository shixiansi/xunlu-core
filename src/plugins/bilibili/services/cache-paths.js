import path from "node:path"

import {
  getPluginDataPath,
  getPluginResourcePath,
  getPluginTempPath,
} from "#utils"

export function toRootRelative(absPath = "", rootPath = "") {
  return path.relative(rootPath, absPath).replace(/\\/g, "/")
}

export function createBilibiliCachePaths(rootPath) {
  const videoPath = getPluginTempPath("bilibili", "video")
  const videoDir = toRootRelative(videoPath, rootPath)
  const groupDataDir = toRootRelative(getPluginDataPath("bilibili", "group"), rootPath)
  const dynamicForwardDir = toRootRelative(getPluginTempPath("bilibili", "dynamic-forward"), rootPath)
  const backgroundDir = toRootRelative(
    getPluginDataPath("bilibili", "bg"),
    rootPath,
  )

  return {
    videoPath,
    videoDir,
    groupDataDir,
    dynamicForwardDir,
    backgroundDir,
    getGroupDataFile(groupId) {
      return `${groupDataDir}/${groupId}.json`
    },
    getVideoCachePaths(bv) {
      return {
        basePath: videoPath,
        videoPath: path.join(videoPath, `source_${bv}.mp4`),
        audioPath: path.join(videoPath, `source_${bv}.mp3`),
        resultPath: path.join(videoPath, `${bv}.mp4`),
      }
    },
    getLiveClipPath(roomId, now = Date.now()) {
      return path.join(videoPath, `live_${roomId}_${now}.mp4`)
    },
    getDynamicForwardCachePath(dynamicId, index, source = "", now = Date.now()) {
      let ext = ".jpg"
      try {
        const pathname = new URL(source).pathname
        const nextExt = path.extname(pathname)
        if (nextExt && nextExt.length <= 10) ext = nextExt
      } catch {}

      return `${dynamicForwardDir}/${dynamicId}_${now}_${index}${ext}`
    },
    toAbsolutePath(rootRelativePath = "") {
      return path.join(rootPath, rootRelativePath)
    },
  }
}
