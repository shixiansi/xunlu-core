import fs from "node:fs"
import path from "node:path"

import env from "../../../lib/env.js"

const DATA_DIR = path.resolve(env.RootPath, "data", "douyin")
const AUTH_FILE = path.join(DATA_DIR, "auth.json")

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
  return dirPath
}

function normalizeCookieMap(raw = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const out = {}
  for (const [key, value] of Object.entries(raw)) {
    const name = String(key || "").trim()
    const cookieValue = String(value || "").trim()
    if (!name || !cookieValue) continue
    out[name] = cookieValue
  }
  return out
}

function buildCookieHeader(cookies = {}) {
  return Object.entries(normalizeCookieMap(cookies))
    .map(([key, value]) => `${key}=${value}`)
    .join("; ")
}

export function getDouyinDataDir() {
  return DATA_DIR
}

export function getDouyinAuthFilePath() {
  return AUTH_FILE
}

export function readDouyinAuth() {
  try {
    if (!fs.existsSync(AUTH_FILE)) return null
    const data = JSON.parse(fs.readFileSync(AUTH_FILE, "utf8"))
    const cookies = normalizeCookieMap(data?.cookies)
    const cookieHeader = String(data?.cookieHeader || buildCookieHeader(cookies)).trim()
    if (!cookieHeader) return null
    return {
      cookieHeader,
      cookies,
      userInfo:
        data?.userInfo && typeof data.userInfo === "object" && !Array.isArray(data.userInfo)
          ? data.userInfo
          : {},
      updatedAt: String(data?.updatedAt || "").trim(),
    }
  } catch (err) {
    logger.warn?.(`[Douyin] 读取登录信息失败：${err?.message || err}`)
    return null
  }
}

export function writeDouyinAuth(raw = {}) {
  const cookies = normalizeCookieMap(raw?.cookies)
  const cookieHeader = String(raw?.cookieHeader || buildCookieHeader(cookies)).trim()
  if (!cookieHeader) {
    throw new Error("[Douyin] cookieHeader is required")
  }

  const next = {
    cookieHeader,
    cookies,
    userInfo:
      raw?.userInfo && typeof raw.userInfo === "object" && !Array.isArray(raw.userInfo)
        ? raw.userInfo
        : {},
    updatedAt:
      String(raw?.updatedAt || new Date().toISOString()).trim() || new Date().toISOString(),
  }

  ensureDir(DATA_DIR)
  fs.writeFileSync(AUTH_FILE, JSON.stringify(next, null, 2), "utf8")
  return next
}

export function clearDouyinAuth() {
  try {
    if (fs.existsSync(AUTH_FILE)) fs.unlinkSync(AUTH_FILE)
  } catch (err) {
    logger.warn?.(`[Douyin] 清理登录信息失败：${err?.message || err}`)
  }
}
