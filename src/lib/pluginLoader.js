import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { normalizePluginDefinition } from "../plugins/define-plugin.js"

function getLogger() {
  const lg = globalThis.logger
  if (lg && typeof lg === "object") return lg
  return {
    info: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  }
}

function discoverPluginEntries(dir) {
  if (!fs.existsSync(dir)) return []

  const discovered = []
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry)
    const stat = fs.statSync(fullPath)

    if (stat.isDirectory()) {
      const entryPath = path.join(fullPath, "index.js")
      if (!fs.existsSync(entryPath)) continue
      discovered.push({
        entryName: entry,
        entryPath,
        rootDir: fullPath,
      })
      continue
    }

    if (!entry.endsWith(".js")) continue

    const baseName = entry.replace(/\.js$/i, "")
    const splitDir = path.join(dir, baseName)
    if (fs.existsSync(splitDir) && fs.statSync(splitDir).isDirectory()) {
      const splitEntry = path.join(splitDir, "index.js")
      if (fs.existsSync(splitEntry)) {
        discovered.push({
          entryName: baseName,
          entryPath: splitEntry,
          rootDir: splitDir,
        })
      }
      continue
    }

    discovered.push({
      entryName: baseName,
      entryPath: fullPath,
      rootDir: path.dirname(fullPath),
    })
  }

  return discovered
}

function hasWebuiProviderFile(rootDir) {
  return fs.existsSync(path.join(rootDir, "webui", "index.js"))
}

function createImportUrl(entryPath, cacheBust = false) {
  const baseUrl = pathToFileURL(entryPath).href
  return cacheBust ? `${baseUrl}?update=${Date.now()}` : baseUrl
}

function createPluginRecord(implementation, meta) {
  const normalized = normalizePluginDefinition(implementation, {
    hasWebuiFile: hasWebuiProviderFile(meta.rootDir),
  })

  const plugin = {
    name: normalized.name,
    title: normalized.title,
    shortName: normalized.shortName,
    aliases: normalized.aliases,
    helpHidden: Boolean(normalized.helpHidden),
    implementation: normalized,
    entryPath: meta.entryPath,
    rootDir: meta.rootDir,
  }

  if (typeof normalized.onBotEvent === "function") {
    plugin.onBotEvent = normalized.onBotEvent
  }

  return plugin
}

// 只做模块发现、导入与插件定义校验；不主动创建 express 或调用 register
export async function loadPlugins(dir, options = {}) {
  const logger = getLogger()
  const cacheBust = Boolean(options.cacheBust)
  const plugins = []
  const loadedTargets = new Set()

  // 获取禁用插件列表
  const disabledPlugins = Array.isArray(options.disabledPlugins) ? options.disabledPlugins : []

  for (const candidate of discoverPluginEntries(dir)) {
    // 检查插件是否被禁用
    if (disabledPlugins.includes(candidate.entryName)) {
      logger.info?.(`[pluginLoader] skip disabled plugin: ${candidate.entryName}`)
      continue
    }

    try {
      const importUrl = createImportUrl(candidate.entryPath, cacheBust)
      const baseUrl = pathToFileURL(candidate.entryPath).href
      if (loadedTargets.has(baseUrl)) continue

      const mod = await import(importUrl)
      loadedTargets.add(baseUrl)

      if (!("default" in mod)) {
        logger.warn?.(
          `[pluginLoader] skip ${candidate.entryName}: module has no default export (${candidate.entryPath})`,
        )
        continue
      }

      const implementation = mod.default
      const plugin = createPluginRecord(implementation, candidate)
      plugins.push(plugin)
      logger.info?.(`xunlu-core加载插件: ${plugin.name}`)
    } catch (error) {
      logger.warn?.(
        `[pluginLoader] skip ${candidate.entryName}: ${error?.message || error}`,
      )
    }
  }

  return plugins
}

export default loadPlugins
