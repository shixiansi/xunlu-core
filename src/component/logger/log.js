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
  const targetLogger = previousLogger || {}

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

  /* eslint-disable no-useless-call */
  /** 全局变量 logger */
  for (const [level, fn] of Object.entries(levelMethods)) {
    setLoggerField(targetLogger, level, fn)
  }

  const nestedLogger =
    targetLogger.logger && typeof targetLogger.logger === "object" ? targetLogger.logger : {}

  for (const [level, fn] of Object.entries(levelMethods)) {
    setLoggerField(nestedLogger, level, (...args) => fn(...args))
  }

  if (typeof targetLogger.log !== "function") {
    setLoggerField(targetLogger, "log", (...args) => targetLogger.info(...args))
  }

  setLoggerField(targetLogger, "logger", nestedLogger)
  global.logger = targetLogger

  logColor()
}

function logColor() {
  setLoggerField(logger, "chalk", chalk)
  setLoggerField(logger, "red", chalk.red)
  setLoggerField(logger, "green", chalk.green)
  setLoggerField(logger, "yellow", chalk.yellow)
  setLoggerField(logger, "blue", chalk.blue)
  setLoggerField(logger, "magenta", chalk.magenta)
  setLoggerField(logger, "cyan", chalk.cyan)
}
