import fs from "node:fs"
import path from "node:path"

import { ensureDir, readJsonFile } from "../utils/file.js"

const LEGACY_RUNTIME_MIGRATIONS = [
  {
    legacySegments: ["src", "plugins", "bilibili", "data"],
    targetSegments: ["data", "bilibili"],
  },
  {
    legacySegments: ["src", "plugins", "bilibili", "resources", "video"],
    targetSegments: ["temp", "bilibili", "video"],
  },
  {
    legacySegments: ["src", "plugins", "bilibili", "resources", "dynamic-forward"],
    targetSegments: ["temp", "bilibili", "dynamic-forward"],
  },
  {
    legacySegments: ["src", "plugins", "bilibili", "resources", "html", "bilibili", "bg"],
    targetSegments: ["data", "bilibili", "bg"],
    onlyIfTargetEmpty: true,
  },
  {
    legacySegments: ["src", "plugins", "qun-daily", "data"],
    targetSegments: ["data", "qun-daily"],
  },
  {
    legacySegments: ["src", "plugins", "pixiv", "temp"],
    targetSegments: ["temp", "pixiv"],
  },
  {
    legacySegments: ["src", "plugins", "pixiv", "model", "temp"],
    targetSegments: ["temp", "pixiv", "mirage"],
  },
  {
    legacySegments: ["src", "plugins", "tts", "resources", "audio"],
    targetSegments: ["temp", "tts", "audio"],
  },
]

function hasAnyEntry(dirPath) {
  try {
    return fs.readdirSync(dirPath).length > 0
  } catch {
    return false
  }
}

function targetDirEmpty(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) return true
    return fs.readdirSync(dirPath).length === 0
  } catch {
    return true
  }
}

function copyMissingTree(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) return false
  const sourceStat = fs.statSync(sourcePath)

  if (sourceStat.isDirectory()) {
    ensureDir(targetPath)
    for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) {
      const nextSource = path.join(sourcePath, entry.name)
      const nextTarget = path.join(targetPath, entry.name)
      copyMissingTree(nextSource, nextTarget)
    }
    return true
  }

  if (!fs.existsSync(targetPath)) {
    ensureDir(path.dirname(targetPath))
    fs.copyFileSync(sourcePath, targetPath)
  }
  return true
}

export class RuntimePaths {
  constructor(options = {}) {
    this.cwd = path.resolve(String(options.cwd || process.cwd()))
    this.packageFile = path.join(this.cwd, "package.json")
    this.packageInfo = readJsonFile(this.packageFile, {})
    this.currentEnv = this.detectEnv()
    this.rootDir = this.resolveRootDir()
    this.layoutReady = false
  }

  detectEnv() {
    const packageName = String(this.packageInfo?.name || "")
    if (/yunzai/i.test(packageName)) return "QQBot-YunZai"
    if (packageName === "xunlu-core") return "xunlu-core"
    return "xunlu-core"
  }

  resolveRootDir() {
    if (this.currentEnv === "QQBot-YunZai") {
      return path.resolve(this.cwd, "plugins", "xunlu-core")
    }
    return this.cwd
  }

  get rootPath() {
    return `${this.rootDir}${path.sep}`
  }

  ensureRuntimeLayout() {
    if (this.layoutReady) return this.rootDir

    ensureDir(path.join(this.rootDir, "data"))
    ensureDir(path.join(this.rootDir, "temp"))

    for (const migration of LEGACY_RUNTIME_MIGRATIONS) {
      const sourcePath = path.join(this.rootDir, ...migration.legacySegments)
      const targetPath = path.join(this.rootDir, ...migration.targetSegments)
      if (!fs.existsSync(sourcePath) || !hasAnyEntry(sourcePath)) continue
      if (migration.onlyIfTargetEmpty && !targetDirEmpty(targetPath)) continue
      copyMissingTree(sourcePath, targetPath)
    }

    this.layoutReady = true
    return this.rootDir
  }

  resolveUnderRoot(...segments) {
    return path.join(this.rootDir, ...segments.filter(Boolean))
  }

  getResourcePath(...segments) {
    return this.resolveUnderRoot("resources", ...segments)
  }

  getDataDir(...segments) {
    this.ensureRuntimeLayout()
    return ensureDir(this.resolveUnderRoot("data", ...segments))
  }

  getTempDir(...segments) {
    this.ensureRuntimeLayout()
    return ensureDir(this.resolveUnderRoot("temp", ...segments))
  }

  getPluginDataDir(pluginName, ...segments) {
    return this.getDataDir(String(pluginName || "").trim(), ...segments)
  }

  getPluginTempDir(pluginName, ...segments) {
    return this.getTempDir(String(pluginName || "").trim(), ...segments)
  }
}

export function createRuntimePaths(options = {}) {
  return new RuntimePaths(options)
}

export default RuntimePaths
