import fs from "node:fs"
import path from "node:path"

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
  return dirPath
}

export function fileExists(filePath) {
  return fs.existsSync(filePath)
}

export function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"))
  } catch (error) {
    if (arguments.length >= 2) return fallback
    throw error
  }
}

export function writeJsonFile(filePath, data, options = {}) {
  const spaces = Number.isInteger(options.spaces) ? options.spaces : 2
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, spaces)}\n`, "utf8")
}

export function removeFileQuietly(filePath) {
  try {
    if (filePath) fs.rmSync(filePath, { force: true })
  } catch {}
}

export function removeDirQuietly(dirPath) {
  try {
    if (dirPath) fs.rmSync(dirPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
  } catch {}
}

export function sanitizeFilename(filename, options = {}) {
  const { isUnix = false, replacement = "_" } = options
  const source = String(filename || "").trim()
  if (!source) return "unnamed_file"

  const illegalCharsRegex = isUnix ? /[\/]/g : /[<>:"\/\\|?*]/g
  const sanitized = source.replace(illegalCharsRegex, replacement).trim().replace(/^\.+|\.+$/g, "")
  return sanitized || "unnamed_file"
}
