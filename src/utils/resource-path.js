import path from "node:path"

import { getRuntimePaths } from "../runtime/runtime-context.js"

export function getResourcePath(...segments) {
  return getRuntimePaths().getResourcePath(...segments)
}

export function getPluginResourcePath(pluginName, ...segments) {
  const normalizedName = String(pluginName || "").trim()
  return path.join(getRuntimePaths().rootDir, "src", "plugins", normalizedName, "resources", ...segments)
}

export function getPluginDataPath(pluginName, ...segments) {
  return getRuntimePaths().getPluginDataDir(pluginName, ...segments)
}

export function getPluginTempPath(pluginName, ...segments) {
  return getRuntimePaths().getPluginTempDir(pluginName, ...segments)
}
