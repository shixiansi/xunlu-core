import path from "node:path"

import cfg from "../../../lib/config.js"
import env from "../../../lib/env.js"
import YamlReader from "../../../utils/YamlReader.js"
import { resolvePrefixConfig } from "../../../Bot/runtime/prefix-compat.js"

function normalizeString(value) {
  return String(value ?? "").trim()
}

function normalizePrefixAliases(values, { fallback = [] } = {}) {
  const list = Array.isArray(values)
    ? values
    : values !== undefined && values !== null
      ? [values]
      : fallback

  const seen = new Set()
  const out = []
  for (const value of list) {
    const text = normalizeString(value)
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(text)
  }
  return out
}

function groupNodePath(groupId, field) {
  return `INTEGER__${normalizeString(groupId)}.${field}`
}

function setGroupField(reader, groupId, field, value) {
  const gid = Number(groupId)
  const key = Number.isFinite(gid) ? gid : normalizeString(groupId)
  reader.document.setIn([key, field], value)
  reader.save()
}

function getYunzaiGroupConfigPath() {
  return path.resolve(process.cwd(), "config", "config", "group.yaml")
}

function getYunzaiGroupConfigReader(filePath = getYunzaiGroupConfigPath()) {
  return new YamlReader(filePath)
}

function getStandaloneGroupConfigReader() {
  return cfg.getConfigReader("group", "user")
}

export async function getCurrentGroupPrefixState(groupId, options = {}) {
  const envName = normalizeString(options.envName || env.CurEnv)
  const standaloneConfigData =
    options.standaloneConfigData ?? options.standaloneReader?.jsonData
  const config = await resolvePrefixConfig(groupId, {
    ...options,
    envName,
    standaloneConfigData,
  })

  const aliases = normalizePrefixAliases(config?.botAlias, {
    fallback: envName === "QQBot-YunZai" ? [] : ["#"],
  })
  const enabled =
    config?.source === "yunzai"
      ? Number(config?.onlyReplyAt ?? 0) !== 0
      : Boolean(config?.prefix_enabled)

  return {
    envName,
    source: config?.source || "xunlu",
    enabled,
    aliases,
    prefix: aliases[0] || "#",
    mode: config?.source === "yunzai" ? Number(config?.onlyReplyAt ?? 0) || 0 : undefined,
  }
}

export async function setCurrentGroupPrefix(groupId, prefix, options = {}) {
  const nextPrefix = normalizeString(prefix)
  if (!nextPrefix) throw new Error("prefix is required")

  const envName = normalizeString(options.envName || env.CurEnv)
  const aliases = [nextPrefix]
  const currentState = await getCurrentGroupPrefixState(groupId, options)

  if (envName === "QQBot-YunZai") {
    const reader = getYunzaiGroupConfigReader(options.groupFilePath)
    setGroupField(reader, groupId, "botAlias", aliases)
    return {
      ...currentState,
      source: "yunzai",
      aliases,
      prefix: nextPrefix,
    }
  }

  const reader = options.standaloneReader || getStandaloneGroupConfigReader()
  setGroupField(reader, groupId, "botAlias", aliases)
  const state = await getCurrentGroupPrefixState(groupId, options)
  return {
    ...state,
    aliases,
    prefix: nextPrefix,
  }
}

export async function setCurrentGroupPrefixEnabled(groupId, enabled, options = {}) {
  const envName = normalizeString(options.envName || env.CurEnv)
  const nextEnabled = Boolean(enabled)
  const currentState = await getCurrentGroupPrefixState(groupId, options)
  const nextAliases = currentState.aliases.length ? currentState.aliases : nextEnabled ? ["#"] : currentState.aliases

  if (envName === "QQBot-YunZai") {
    const reader = getYunzaiGroupConfigReader(options.groupFilePath)
    if (nextEnabled && !currentState.aliases.length) {
      setGroupField(reader, groupId, "botAlias", ["#"])
    }
    setGroupField(reader, groupId, "onlyReplyAt", nextEnabled ? 1 : 0)
    return {
      ...currentState,
      source: "yunzai",
      enabled: nextEnabled,
      aliases: nextAliases,
      prefix: nextAliases[0] || "#",
      mode: nextEnabled ? 1 : 0,
    }
  }

  const reader = options.standaloneReader || getStandaloneGroupConfigReader()
  if (nextEnabled && !currentState.aliases.length) {
    setGroupField(reader, groupId, "botAlias", ["#"])
  }
  setGroupField(reader, groupId, "prefix_enabled", nextEnabled)
  return await getCurrentGroupPrefixState(groupId, options)
}

export function formatGroupPrefixState(state = {}) {
  const aliases = normalizePrefixAliases(state.aliases, { fallback: [] })
  const prefixText = aliases.length ? aliases.join(" / ") : "#"
  const modeText = state.enabled ? "开启" : "关闭"
  return `当前群前缀：${prefixText}\n当前群前缀限制：${modeText}`
}

export const __test = {
  formatGroupPrefixState,
  getYunzaiGroupConfigPath,
  groupNodePath,
}
