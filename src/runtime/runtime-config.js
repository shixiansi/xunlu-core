import fs from "node:fs"
import path from "node:path"

import chokidar from "chokidar"
import lodash from "lodash"

import YamlReader from "../utils/YamlReader.js"

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
  return dirPath
}

function listConfigItems(baseDir, relativePath = "") {
  const currentDir = relativePath ? path.join(baseDir, relativePath) : baseDir
  if (!fs.existsSync(currentDir)) return []

  const items = []
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const nextRelative = relativePath ? path.join(relativePath, entry.name) : entry.name
    if (entry.isDirectory()) {
      items.push({
        path: nextRelative,
        isDirectory: true,
      })
      items.push(...listConfigItems(baseDir, nextRelative))
      continue
    }
    items.push({
      path: nextRelative,
      isDirectory: false,
    })
  }
  return items
}

function copyMissingTree(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) return false
  const stat = fs.statSync(sourceDir)
  if (stat.isDirectory()) {
    ensureDir(targetDir)
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
      copyMissingTree(path.join(sourceDir, entry.name), path.join(targetDir, entry.name))
    }
    return true
  }
  if (!fs.existsSync(targetDir)) {
    ensureDir(path.dirname(targetDir))
    fs.copyFileSync(sourceDir, targetDir)
  }
  return true
}

export class RuntimeConfigManager {
  constructor(options = {}) {
    this.rootDir = path.resolve(String(options.rootDir || process.cwd()))
    this.configCache = new Map()
    this.fileWatchers = new Map()
    this.isWatcherEnabled = options.isWatcher !== false
    this.defaultConfigDir = path.join(this.rootDir, "config", "default_config")
    this.userConfigDir = path.join(this.rootDir, "config", "config")

    this.initialize()
  }

  initialize() {
    this.ensureConfigDirectoryExists()
    this.syncConfigFiles()
    this.syncConfigurationKeys()
  }

  ensureConfigDirectoryExists() {
    ensureDir(this.userConfigDir)
    if (!fs.existsSync(this.defaultConfigDir)) return
    copyMissingTree(this.defaultConfigDir, this.userConfigDir)
  }

  syncConfigFiles() {
    if (!fs.existsSync(this.defaultConfigDir)) return
    const sourceFiles = listConfigItems(this.defaultConfigDir)
    const targetFiles = listConfigItems(this.userConfigDir)
    const targetPaths = new Set(targetFiles.map(item => item.path))

    for (const item of sourceFiles) {
      if (targetPaths.has(item.path)) continue
      const sourcePath = path.join(this.defaultConfigDir, item.path)
      const targetPath = path.join(this.userConfigDir, item.path)
      copyMissingTree(sourcePath, targetPath)
    }
  }

  syncConfigurationKeys() {
    for (const configName of this.defaultConfigList) {
      try {
        const defaultConfig = this.loadConfigData(configName, "default")
        const userConfig = this.loadConfigData(configName, "user")
        const missingKeys = this.findMissingKeys(defaultConfig, userConfig)

        for (const key of missingKeys) {
          if (defaultConfig && defaultConfig[key] !== undefined) {
            this.setConfigValue(configName, key, defaultConfig[key])
          }
        }
      } catch (error) {
        console.warn(`[xunlu-core] sync config failed: ${configName}`, error?.message || error)
      }
    }
  }

  get packageInfo() {
    return JSON.parse(fs.readFileSync(path.join(this.rootDir, "package.json"), "utf8"))
  }

  get defaultConfigList() {
    return this.getConfigurationList(this.defaultConfigDir)
  }

  get userConfigList() {
    return this.getConfigurationList(this.userConfigDir)
  }

  getConfigurationList(baseDir) {
    if (!fs.existsSync(baseDir)) return []

    const configList = []
    const visit = (currentDir, names = []) => {
      for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          visit(path.join(currentDir, entry.name), [...names, entry.name])
          continue
        }
        if (!entry.name.endsWith(".config.yaml")) continue
        const configName = [...names, entry.name.replace(/\.config\.yaml$/i, "")].join(".")
        if (configName) configList.push(configName)
      }
    }

    visit(baseDir)
    return configList
  }

  getConfigDir(configType = "user") {
    return configType === "default" ? this.defaultConfigDir : this.userConfigDir
  }

  getConfigFilePath(configName, configType = "user") {
    const safeName = String(configName || "").trim()
    const parts = safeName.split(".").filter(Boolean)
    return path.join(this.getConfigDir(configType), ...parts) + ".config.yaml"
  }

  ensureUserConfigFile(configName) {
    const filePath = this.getConfigFilePath(configName, "user")
    if (fs.existsSync(filePath)) return filePath

    const defaultPath = this.getConfigFilePath(configName, "default")
    if (fs.existsSync(defaultPath)) {
      copyMissingTree(defaultPath, filePath)
      return filePath
    }

    ensureDir(path.dirname(filePath))
    fs.writeFileSync(filePath, "{}\n", "utf8")
    return filePath
  }

  loadConfigData(configName, configType = "user") {
    const filePath = this.getConfigFilePath(configName, configType)
    try {
      return new YamlReader(filePath).jsonData
    } catch (error) {
      console.warn(`[xunlu-core] load config failed: ${filePath}`, error?.message || error)
      return null
    }
  }

  findMissingKeys(sourceObj = {}, targetObj = {}) {
    if (!sourceObj) return Object.keys(targetObj || {})
    if (!targetObj) return Object.keys(sourceObj || {})
    return lodash.difference(lodash.keys(sourceObj), lodash.keys(targetObj))
  }

  getCacheKey(configName, configType = "user") {
    return `${String(configType || "user")}:${String(configName || "").trim()}`
  }

  getConfig(configName = "", configType = "user") {
    const cacheKey = this.getCacheKey(configName, configType)
    if (this.configCache.has(cacheKey)) {
      return this.configCache.get(cacheKey).jsonData
    }

    const filePath =
      configType === "user"
        ? this.ensureUserConfigFile(configName)
        : this.getConfigFilePath(configName, configType)
    const configReader = new YamlReader(filePath)
    this.configCache.set(cacheKey, configReader)

    if (configType === "user" && this.isWatcherEnabled && !this.fileWatchers.has(configName)) {
      this.setupFileWatcher(configName)
    }

    return configReader.jsonData
  }

  getConfigReader(configName, configType = "user") {
    const cacheKey = this.getCacheKey(configName, configType)
    if (!this.configCache.has(cacheKey)) {
      this.getConfig(configName, configType)
    }
    return this.configCache.get(cacheKey)
  }

  setConfigValue(configName, key, value) {
    const config = this.getConfigReader(configName, "user")
    config.set(key, value)
  }

  addToConfigArray(configName, key, value) {
    const config = this.getConfigReader(configName, "user")
    config.addIn(key, value)
  }

  setupFileWatcher(configName) {
    const filePath = this.getConfigFilePath(configName, "user")
    const watcher = chokidar.watch(filePath).on("change", () => {
      this.handleConfigChange(configName)
    })
    this.fileWatchers.set(configName, watcher)
  }

  handleConfigChange(configName) {
    this.configCache.delete(this.getCacheKey(configName, "user"))
    this.getConfig(configName, "user")
  }

  cleanup() {
    for (const watcher of this.fileWatchers.values()) {
      watcher.close()
    }
    this.fileWatchers.clear()
    this.configCache.clear()
  }
}

export function createRuntimeConfigManager(options = {}) {
  return new RuntimeConfigManager(options)
}

export default RuntimeConfigManager
