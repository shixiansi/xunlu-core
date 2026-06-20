function getLogger() {
  const l = globalThis.logger
  if (!l || typeof l !== "object") return null
  return l
}

function logInfo(...args) {
  const l = getLogger()
  if (l?.info) return l.info(...args)
  return console.log(...args)
}

function logWarn(...args) {
  const l = getLogger()
  if (l?.warn) return l.warn(...args)
  return console.warn(...args)
}

function logError(...args) {
  const l = getLogger()
  if (l?.error) return l.error(...args)
  return console.error(...args)
}

function toInt(value) {
  if (value === undefined || value === null) return undefined
  const v = typeof value === "string" ? value.trim() : value
  if (v === "") return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function safeStringify(value) {
  try {
    return JSON.stringify(value)
  } catch {
    try {
      return String(value)
    } catch {
      return "[unserializable]"
    }
  }
}

export { getLogger, logInfo, logWarn, logError, toInt, safeStringify }
