import fs from "node:fs"

const DEFAULT_CLEANUP_DELAYS_MS = [15_000, 30_000, 60_000, 180_000]

function normalizeCleanupPaths(paths = []) {
  const list = Array.isArray(paths) ? paths : [paths]
  return [
    ...new Set(
      list
        .map(item => String(item || "").trim())
        .filter(Boolean),
    ),
  ]
}

function scheduleCleanupAttempt(paths, delaysMs, attemptIndex, label) {
  const delayMs = Math.max(0, Number(delaysMs[attemptIndex]) || 0)
  const timer = setTimeout(() => {
    const failed = []
    for (const filePath of paths) {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      } catch (err) {
        failed.push({ filePath, err })
      }
    }

    if (failed.length === 0) return

    if (attemptIndex + 1 < delaysMs.length) {
      scheduleCleanupAttempt(
        failed.map(item => item.filePath),
        delaysMs,
        attemptIndex + 1,
        label,
      )
      return
    }

    for (const item of failed) {
      globalThis.logger?.warn?.(
        `[temp-cleanup] ${label} cleanup failed: ${item.filePath}, ${item.err?.message || item.err}`,
      )
    }
  }, delayMs)
  timer.unref?.()
}

export function scheduleTempFileCleanup(paths = [], options = {}) {
  const normalizedPaths = normalizeCleanupPaths(paths)
  if (normalizedPaths.length === 0) return 0

  const delaysMs = Array.isArray(options.delaysMs) && options.delaysMs.length > 0
    ? options.delaysMs
    : DEFAULT_CLEANUP_DELAYS_MS
  const label = String(options.label || "temp file")

  scheduleCleanupAttempt(normalizedPaths, delaysMs, 0, label)
  return normalizedPaths.length
}

export function __resetTempFileCleanupForTests() {}
