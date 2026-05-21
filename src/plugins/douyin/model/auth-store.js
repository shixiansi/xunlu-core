import {
  fileExists,
  readJsonFile,
  removeFileQuietly,
  resolvePluginDataPath,
  writeJsonFile,
} from "#utils"

const DATA_DIR = resolvePluginDataPath("douyin")
const AUTH_FILE = resolvePluginDataPath("douyin", "auth.json")

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
    if (!fileExists(AUTH_FILE)) return null
    const data = readJsonFile(AUTH_FILE)
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

  writeJsonFile(AUTH_FILE, next)
  return next
}

export function clearDouyinAuth() {
  try {
    removeFileQuietly(AUTH_FILE)
  } catch (err) {
    logger.warn?.(`[Douyin] 清理登录信息失败：${err?.message || err}`)
  }
}
