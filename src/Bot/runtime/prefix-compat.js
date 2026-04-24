import path from "node:path"
import { pathToFileURL } from "node:url"

import cfg from "../../lib/config.js"
import env from "../../lib/env.js"

let yunzaiConfigPromise = null

function normalizeString(value) {
  return String(value ?? "").trim()
}

function getGroupOverride(data = {}, groupId) {
  if (!data || typeof data !== "object") return {}
  const key = String(groupId ?? "").trim()
  if (!key) return {}
  return data[key] && typeof data[key] === "object" ? data[key] : {}
}

export function normalizePrefixAliases(input, { fallback = [] } = {}) {
  const values =
    input !== undefined
      ? input
      : fallback !== undefined
        ? fallback
        : []

  const list = Array.isArray(values) ? values : values !== undefined && values !== null ? [values] : []
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

  return out.sort((a, b) => b.length - a.length || a.localeCompare(b, "zh-Hans-CN"))
}

function shouldStripAliasFromMsg(alias = "") {
  return /[A-Za-z0-9\u3400-\u9fff]/.test(String(alias || ""))
}

async function loadYunzaiConfigModule(modulePath) {
  if (!modulePath && yunzaiConfigPromise) return await yunzaiConfigPromise

  const targetPath = modulePath || path.resolve(process.cwd(), "lib", "config", "config.js")
  const importTask = import(pathToFileURL(targetPath).href).catch(() => null)

  if (!modulePath) yunzaiConfigPromise = importTask
  return await importTask
}

export function resolveStandaloneGroupPrefixConfig(groupId, configData = cfg.getConfig("group")) {
  const root = configData && typeof configData === "object" ? configData : {}
  const defaults = root.default && typeof root.default === "object" ? root.default : {}
  const override = getGroupOverride(root, groupId)

  return {
    source: "xunlu",
    prefix_enabled: Boolean(override.prefix_enabled ?? defaults.prefix_enabled ?? false),
    botAlias: normalizePrefixAliases(override.botAlias ?? defaults.botAlias, {
      fallback: ["#"],
    }),
  }
}

export async function loadYunzaiGroupPrefixConfig(groupId, { loadGroupConfig, modulePath } = {}) {
  if (typeof loadGroupConfig === "function") {
    const groupConfig = await loadGroupConfig(groupId)
    if (!groupConfig || typeof groupConfig !== "object") return null
    return {
      source: "yunzai",
      onlyReplyAt: Number(groupConfig.onlyReplyAt ?? 0) || 0,
      botAlias: normalizePrefixAliases(groupConfig.botAlias),
    }
  }

  const mod = await loadYunzaiConfigModule(modulePath)
  const yunzaiCfg = mod?.default ?? mod
  if (!yunzaiCfg || typeof yunzaiCfg.getGroup !== "function") return null

  try {
    const groupConfig = await yunzaiCfg.getGroup(groupId)
    if (!groupConfig || typeof groupConfig !== "object") return null
    return {
      source: "yunzai",
      onlyReplyAt: Number(groupConfig.onlyReplyAt ?? 0) || 0,
      botAlias: normalizePrefixAliases(groupConfig.botAlias),
    }
  } catch {
    return null
  }
}

export async function resolvePrefixConfig(groupId, options = {}) {
  const envName = normalizeString(options.envName || env.CurEnv)
  if (envName === "QQBot-YunZai") {
    const yunzaiConfig = await loadYunzaiGroupPrefixConfig(groupId, options)
    if (yunzaiConfig) return yunzaiConfig
  }
  return resolveStandaloneGroupPrefixConfig(groupId, options.standaloneConfigData)
}

export async function applyPrefixCompatibilityToEvent(event, options = {}) {
  if (!event || typeof event !== "object") {
    return { allow: true, matchedAlias: "", strippedText: "", config: null }
  }
  if (event.__xunluPrefixCompatApplied) {
    return event.__xunluPrefixCompatResult || { allow: true, matchedAlias: "", strippedText: "", config: null }
  }

  const originalText = normalizeString(event.msg ?? event.raw_message)
  if (event.__xunluOriginalMsg === undefined) {
    event.__xunluOriginalMsg = originalText
  }

  const finish = result => {
    event.__xunluPrefixCompatApplied = true
    event.__xunluPrefixCompatResult = result
    return result
  }

  if (!event.group_id || event.isPrivate) {
    if (event.msg === undefined) event.msg = originalText
    if (event.hasAlias === undefined) event.hasAlias = false
    return finish({ allow: true, matchedAlias: "", strippedText: originalText, config: null })
  }

  const config = await resolvePrefixConfig(event.group_id, options)
  const aliases = normalizePrefixAliases(config?.botAlias)
  const matchedAlias = aliases.find(alias => originalText.startsWith(alias)) || ""
  const strippedText =
    matchedAlias && shouldStripAliasFromMsg(matchedAlias)
      ? normalizeString(originalText.slice(matchedAlias.length))
      : originalText

  if (matchedAlias) event.hasAlias = true
  else if (event.hasAlias === undefined) event.hasAlias = false

  event.msg = strippedText

  let allow = true
  if (config?.source === "yunzai") {
    const onlyReplyAt = Number(config.onlyReplyAt ?? 0) || 0
    if (onlyReplyAt !== 0 && aliases.length > 0) {
      allow = Boolean(event.atBot || event.hasAlias || (onlyReplyAt === 2 && event.isMaster))
    }
  } else {
    const prefixEnabled = Boolean(config?.prefix_enabled)
    if (prefixEnabled && aliases.length > 0) {
      allow = Boolean(event.atBot || event.hasAlias)
    }
  }

  return finish({
    allow,
    matchedAlias,
    strippedText,
    config,
  })
}

export function buildCommandTextCandidates(text, prefixState) {
  const normalizedText = normalizeString(text)
  const out = []
  const pushUnique = value => {
    const next = normalizeString(value)
    if (!next || out.includes(next)) return
    out.push(next)
  }

  pushUnique(normalizedText)

  if (prefixState?.matchedAlias && normalizedText && !/^[#＃]/.test(normalizedText)) {
    pushUnique(`#${normalizedText}`)
    pushUnique(`＃${normalizedText}`)
  }

  return out
}

export const __test = {
  normalizePrefixAliases,
  resolveStandaloneGroupPrefixConfig,
  shouldStripAliasFromMsg,
}
