import assert from "node:assert/strict"
import test from "node:test"

import setLog, { createLoggerFacade } from "../src/component/logger/log.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

test("logger facade can be built without touching global logger", () => {
  const previousLogger = globalThis.logger
  const calls = []

  try {
    const existing = {
      customField: "keep-me",
      logger: {},
    }
    const colors = {
      red: value => `red:${value}`,
      green: value => `green:${value}`,
      yellow: value => `yellow:${value}`,
      blue: value => `blue:${value}`,
      magenta: value => `magenta:${value}`,
      cyan: value => `cyan:${value}`,
    }

    const facade = createLoggerFacade({
      previousLogger: existing,
      colors,
      levelMethods: {
        info(...args) {
          calls.push(["info", args])
        },
        error(...args) {
          calls.push(["error", args])
        },
      },
    })

    assert.equal(facade, existing)
    assert.equal(globalThis.logger, previousLogger)
    assert.equal(facade.customField, "keep-me")
    assert.equal(typeof facade.info, "function")
    assert.equal(typeof facade.error, "function")
    assert.equal(typeof facade.logger.info, "function")
    assert.equal(typeof facade.logger.error, "function")
    assert.equal(facade.red("x"), "red:x")

    facade.logger.info("nested")
    assert.deepEqual(calls, [["info", ["nested"]]])
  } finally {
    globalThis.logger = previousLogger
  }
})

test("logger facade falls back when previous logger cannot be extended", () => {
  const previousLogger = globalThis.logger
  const calls = []

  try {
    const existing = Object.preventExtensions({
      customField: "keep-me",
      logger: Object.preventExtensions({
        nestedField: "nested-keep-me",
      }),
    })
    const colors = {
      red: value => `red:${value}`,
      green: value => `green:${value}`,
      yellow: value => `yellow:${value}`,
      blue: value => `blue:${value}`,
      magenta: value => `magenta:${value}`,
      cyan: value => `cyan:${value}`,
    }

    const facade = createLoggerFacade({
      previousLogger: existing,
      colors,
      levelMethods: {
        info(...args) {
          calls.push(["info", args])
        },
        mark(...args) {
          calls.push(["mark", args])
        },
      },
    })

    assert.notEqual(facade, existing)
    assert.equal(globalThis.logger, previousLogger)
    assert.equal(facade.customField, "keep-me")
    assert.equal(facade.logger.nestedField, "nested-keep-me")
    assert.equal(typeof facade.info, "function")
    assert.equal(typeof facade.mark, "function")
    assert.equal(typeof facade.logger.info, "function")
    assert.equal(typeof facade.logger.mark, "function")
    assert.equal(facade.cyan("x"), "cyan:x")

    facade.logger.mark("nested")
    assert.deepEqual(calls, [["mark", ["nested"]]])
  } finally {
    globalThis.logger = previousLogger
  }
})

test("xunlu logger preserves nested logger compatibility when overriding global logger", () => {
  const previousLogger = globalThis.logger

  try {
    globalThis.logger = {
      customField: "keep-me",
      logger: {},
      info() {},
    }

    setLog()

    assert.equal(globalThis.logger.customField, "keep-me")
    assert.equal(typeof globalThis.logger.info, "function")
    assert.equal(typeof globalThis.logger.error, "function")
    assert.equal(typeof globalThis.logger.mark, "function")
    assert.equal(typeof globalThis.logger.logger?.info, "function")
    assert.equal(typeof globalThis.logger.logger?.error, "function")
    assert.equal(typeof globalThis.logger.logger?.mark, "function")
    assert.equal(typeof globalThis.logger.magenta, "function")
  } finally {
    globalThis.logger = previousLogger
  }
})

test("xunlu logger tolerates readonly color accessors on existing logger", () => {
  const previousLogger = globalThis.logger
  const colorValue = x => `fixed:${x}`

  try {
    const loggerProto = {}

    Object.defineProperty(loggerProto, "red", {
      configurable: false,
      enumerable: true,
      get() {
        return colorValue
      },
    })

    Object.defineProperty(loggerProto, "magenta", {
      configurable: false,
      enumerable: true,
      get() {
        return colorValue
      },
    })

    const loggerLike = Object.create(loggerProto)
    Object.assign(loggerLike, {
      logger: {},
      info() {},
    })

    globalThis.logger = loggerLike

    assert.doesNotThrow(() => setLog())
    assert.equal(typeof globalThis.logger.red, "function")
    assert.equal(typeof globalThis.logger.magenta, "function")
    assert.equal(typeof globalThis.logger.logger?.info, "function")
  } finally {
    globalThis.logger = previousLogger
  }
})
