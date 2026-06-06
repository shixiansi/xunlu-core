import log4js from "log4js"
import chalk from "chalk"
import cfg from "../../lib/config.js"
import fs from "node:fs"

function findInheritedDescriptor(target, key) {
  let cursor = Object.getPrototypeOf(target)
  while (cursor) {
    const desc = Object.getOwnPropertyDescriptor(cursor, key)
    if (desc) return desc
    cursor = Object.getPrototypeOf(cursor)
  }
  return null
}

function setLoggerField(target, key, value) {
  if (!target || (typeof target !== "object" && typeof target !== "function")) return false

  try {
    const desc = Object.getOwnPropertyDescriptor(target, key)
    if (desc) {
      if (
        (Object.prototype.hasOwnProperty.call(desc, "writable") && desc.writable) ||
        typeof desc.set === "function"
      ) {
        return Reflect.set(target, key, value)
      }

      if (desc.configurable) {
        Object.defineProperty(target, key, {
          configurable: true,
          enumerable: desc.enumerable ?? true,
          writable: true,
          value,
        })
        return true
      }

      return false
    }

    const inheritedDesc = findInheritedDescriptor(target, key)
    if (inheritedDesc) {
      if (typeof inheritedDesc.set === "function") {
        return Reflect.set(target, key, value)
      }

      if (!Object.isExtensible(target)) return false

      Object.defineProperty(target, key, {
        configurable: true,
        enumerable: inheritedDesc.enumerable ?? true,
        writable: true,
        value,
      })
      return true
    }

    if (!Object.isExtensible(target)) {
      return Reflect.set(target, key, value)
    }

    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value,
    })
    return true
  } catch {
    return false
  }
}

function copyLoggerFields(source, { skipLogger = false } = {}) {
  const target = {}
  if (!source || (typeof source !== "object" && typeof source !== "function")) return target

  for (const key of Reflect.ownKeys(source)) {
    if (skipLogger && key === "logger") continue

    try {
      const desc = Object.getOwnPropertyDescriptor(source, key)
      if (!desc) continue

      let value
      if (Object.prototype.hasOwnProperty.call(desc, "value")) {
        value = desc.value
      } else if (typeof desc.get === "function") {
        value = desc.get.call(source)
      } else {
        continue
      }

      Object.defineProperty(target, key, {
        configurable: true,
        enumerable: desc.enumerable ?? true,
        writable: true,
        value,
      })
    } catch {
      // Ignore unreadable compatibility fields from foreign logger implementations.
    }
  }

  return target
}

function installLoggerColors(targetLogger, colors = chalk) {
  if (!targetLogger || (typeof targetLogger !== "object" && typeof targetLogger !== "function")) {
    return false
  }

  return [
    setLoggerField(targetLogger, "chalk", colors),
    setLoggerField(targetLogger, "red", colors.red),
    setLoggerField(targetLogger, "green", colors.green),
    setLoggerField(targetLogger, "yellow", colors.yellow),
    setLoggerField(targetLogger, "blue", colors.blue),
    setLoggerField(targetLogger, "magenta", colors.magenta),
    setLoggerField(targetLogger, "cyan", colors.cyan),
  ].every(Boolean)
}

export function applyLoggerColors(targetLogger, colors = chalk) {
  installLoggerColors(targetLogger, colors)
  return targetLogger
}

function installLoggerFacadeFields(targetLogger, levelMethods, colors) {
  const results = []

  for (const [level, fn] of Object.entries(levelMethods)) {
    results.push(setLoggerField(targetLogger, level, fn))
  }

  const nestedLogger =
    targetLogger.logger && typeof targetLogger.logger === "object" ? targetLogger.logger : {}

  for (const [level, fn] of Object.entries(levelMethods)) {
    results.push(setLoggerField(nestedLogger, level, (...args) => fn(...args)))
  }

  if (typeof targetLogger.log !== "function") {
    results.push(setLoggerField(targetLogger, "log", (...args) => targetLogger.info(...args)))
  }

  results.push(setLoggerField(targetLogger, "logger", nestedLogger))
  results.push(installLoggerColors(targetLogger, colors))

  return results.every(Boolean)
}

function buildFallbackLoggerFacade(previousLogger) {
  const targetLogger = copyLoggerFields(previousLogger, { skipLogger: true })
  const nestedLogger = copyLoggerFields(previousLogger?.logger)
  targetLogger.logger = nestedLogger
  return targetLogger
}

export function createLoggerFacade({
  previousLogger = null,
  levelMethods = {},
  colors = chalk,
} = {}) {
  let targetLogger =
    previousLogger && (typeof previousLogger === "object" || typeof previousLogger === "function")
      ? previousLogger
      : {}

  if (!installLoggerFacadeFields(targetLogger, levelMethods, colors)) {
    targetLogger = buildFallbackLoggerFacade(previousLogger)
    installLoggerFacadeFields(targetLogger, levelMethods, colors)
  }

  return targetLogger
}

/**
 * 设置日志样式
 */
export default function setLog() {
  let file = "./logs"
  if (!fs.existsSync(file)) {
    fs.mkdirSync(file)
  }

  /** 调整error日志等级 */
  // log4js.levels.levels[5].level = Number.MAX_VALUE
  // log4js.levels.levels.sort((a, b) => a.level - b.level)

  log4js.configure({
    appenders: {
      console: {
        type: "console",
        layout: {
          type: "pattern",
          pattern: "%[[xunlu-core][%d{hh:mm:ss.SSS}][%4.4p]%] %m",
        },
      },
      command: {
        type: "dateFile", // 可以是console,dateFile,file,Logstash等
        filename: "logs/command", // 将会按照filename和pattern拼接文件名
        pattern: "yyyy-MM-dd.log",
        numBackups: 15,
        alwaysIncludePattern: true,
        layout: {
          type: "pattern",
          pattern: "[%d{hh:mm:ss.SSS}][%4.4p] %m",
        },
      },
      error: {
        type: "file",
        filename: "logs/error.log",
        alwaysIncludePattern: true,
        layout: {
          type: "pattern",
          pattern: "[%d{hh:mm:ss.SSS}][%4.4p] %m",
        },
      },
    },
    categories: {
      default: { appenders: ["console"], level: cfg.getConfig("bot").log_level },
      command: { appenders: ["console", "command"], level: "warn" },
      error: { appenders: ["console", "command", "error"], level: "error" },
    },
  })

  const defaultLogger = log4js.getLogger("message")
  const commandLogger = log4js.getLogger("command")
  const errorLogger = log4js.getLogger("error")

  const previousLogger =
    globalThis.logger &&
    (typeof globalThis.logger === "object" || typeof globalThis.logger === "function")
      ? globalThis.logger
      : null

  const levelMethods = {
    trace() {
      defaultLogger.trace.call(defaultLogger, ...arguments)
    },
    debug() {
      defaultLogger.debug.call(defaultLogger, ...arguments)
    },
    info() {
      defaultLogger.info.call(defaultLogger, ...arguments)
    },
    // warn及以上的日志采用error策略
    warn() {
      commandLogger.warn.call(defaultLogger, ...arguments)
    },
    error() {
      errorLogger.error.call(errorLogger, ...arguments)
    },
    fatal() {
      errorLogger.fatal.call(errorLogger, ...arguments)
    },
    mark() {
      errorLogger.mark.call(commandLogger, ...arguments)
    },
  }

  /** 全局变量 logger */
  const targetLogger = createLoggerFacade({
    previousLogger,
    levelMethods,
  })
  global.logger = targetLogger
  return targetLogger
}
