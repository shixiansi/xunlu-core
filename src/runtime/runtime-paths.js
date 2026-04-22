import fs from "node:fs"
import path from "node:path"

const LEGACY_DATA_MIGRATIONS = [
  {
    legacySegments: ["src", "plugins", "bilibili", "data"],
    targetSegments: ["data", "bilibili"],
  },
  {
    legacySegments: ["src", "plugins", "qun-daily", "data"],
    targetSegments: ["data", "qun-daily"],
  },
]

function readJsonFile(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"))
  } catch {
    return fallback
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
  return dirPath
}

function hasAnyEntry(dirPath) {
  try {
    return fs.readdirSync(dirPath).length > 0
  } catch {
    return false
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

    for (const migration of LEGACY_DATA_MIGRATIONS) {
      const sourcePath = path.join(this.rootDir, ...migration.legacySegments)
      const targetPath = path.join(this.rootDir, ...migration.targetSegments)
      if (!fs.existsSync(sourcePath) || !hasAnyEntry(sourcePath)) continue
      copyMissingTree(sourcePath, targetPath)
    }

    this.layoutReady = true
    return this.rootDir
  }

  resolveUnderRoot(...segments) {
    return path.join(this.rootDir, ...segments.filter(Boolean))
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
