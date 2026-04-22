import fs from "fs"
import path from "path"
import { UniversalMessageSegment } from "./universal-message.js"

function shouldPreserveAsPath(value) {
  if (typeof value !== "string") return false
  return (
    /^[a-zA-Z]:[\\/]/.test(value) ||
    value.startsWith("\\\\") ||
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith("file://")
  )
}

function normalizeSegmentFileData(type, file, name) {
  const data = { file, ...(name ? { name } : {}) }

  if (Buffer.isBuffer(data.file)) {
    data.file = `base64://${data.file.toString("base64")}`
    return data
  }

  if (typeof data.file !== "string") return data

  const localPath = data.file.replace(/^file:\/\//, "")
  if (!data.path && shouldPreserveAsPath(data.file)) {
    data.path = data.file
  }
  if (!fs.existsSync(localPath)) return data

  if (!data.name) {
    data.name = path.basename(localPath)
  }
  if (type === "video") {
    data.path = localPath
    return data
  }

  data.path = localPath
  data.file = `base64://${fs.readFileSync(localPath).toString("base64")}`
  return data
}

export const segment = {
  image(file, name) {
    const data = normalizeSegmentFileData("image", file, name)
    if (!data.name) delete data.name
    return UniversalMessageSegment.image({
      file: data.file,
      ...(data.path ? { path: data.path } : {}),
      ...(data.name ? { name: data.name } : {}),
    })
  },

  record(file, name) {
    const data = normalizeSegmentFileData("record", file, name)
    return UniversalMessageSegment.record({
      file: data.file,
      ...(data.path ? { path: data.path } : {}),
      ...(data.name ? { name: data.name } : {}),
    })
  },

  video(file) {
    const data = normalizeSegmentFileData("video", file)
    return UniversalMessageSegment.video({
      file: data.file,
      ...(data.path ? { path: data.path } : {}),
    })
  },

  file(file, name) {
    const data = normalizeSegmentFileData("file", file, name)
    return UniversalMessageSegment.file({
      file: data.file,
      ...(data.path ? { path: data.path } : {}),
      ...(data.name ? { name: data.name } : {}),
    })
  },
}
