import fs from "node:fs"
import path from "node:path"

import { getRuntimePaths } from "../../../runtime/runtime-context.js"

export const ROOT_PATH = getRuntimePaths().rootDir
export const TEMP_DIR = path.join(ROOT_PATH, "temp", "douyin")
export const TEMP_VIDEO_DIR = path.join(TEMP_DIR, "video")
export const BROWSER_PROFILE_ROOT = path.join(TEMP_DIR, "browser-profile")
export const QR_IMAGE_PATH = path.join(TEMP_DIR, "login-qrcode.png")
export const VIDEO_MAX_BYTES = 70 * 1024 * 1024
export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
export const MOBILE_DOUYIN_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 5.0; SM-G900P Build/LRX21T) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.25 Mobile Safari/537.36"
export const WEB_REFERER = "https://www.douyin.com/"
export const LOGIN_WINDOW_ENV = "1536|747|1536|834|0|30|0|0|1536|834|1536|864|1525|747|24|24|Win32"

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
  return dirPath
}

export function cleanupDir(dirPath) {
  try {
    if (dirPath && fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true })
  } catch {}
}

export function cleanupFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch {}
}

export function delay(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)))
}

function resolveChromeExecutablePath() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  ]

  for (const candidate of candidates) {
    const filePath = String(candidate || "").trim()
    if (filePath && fs.existsSync(filePath)) return filePath
  }
  return ""
}

function shouldDisableSandbox() {
  const override = String(
    process.env.PUPPETEER_DISABLE_SANDBOX || process.env.CHROME_NO_SANDBOX || "",
  )
    .trim()
    .toLowerCase()
  if (["1", "true", "yes", "on"].includes(override)) return true
  if (["0", "false", "no", "off"].includes(override)) return false
  if (process.platform !== "linux") return false
  if (typeof process.getuid === "function" && process.getuid() === 0) return true
  return Boolean(process.env.container || process.env.DOCKER_CONTAINER)
}

export function buildLaunchOptions({ profileDir = "" } = {}) {
  const executablePath = resolveChromeExecutablePath()
  const args = [
    "--disable-blink-features=AutomationControlled",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--window-size=1440,1200",
  ]

  if (shouldDisableSandbox()) {
    args.push("--disable-setuid-sandbox", "--no-sandbox", "--no-zygote")
  }

  const options = {
    headless: "new",
    ignoreDefaultArgs: ["--enable-automation"],
    args,
  }
  if (profileDir) options.userDataDir = profileDir
  if (executablePath) options.executablePath = executablePath
  return options
}

export function parseDataUrl(dataUrl = "") {
  const source = String(dataUrl || "").trim()
  const matched = source.match(/^data:([^;,]+)?;base64,(.+)$/)
  if (!matched) return null
  return {
    mimeType: matched[1] || "image/png",
    buffer: Buffer.from(matched[2], "base64"),
  }
}
