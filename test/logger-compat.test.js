import assert from "node:assert/strict"
import test from "node:test"

import setLog from "../src/component/logger/log.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

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
    const loggerLike = {
      logger: {},
      info() {},
    }

    Object.defineProperty(loggerLike, "red", {
      configurable: false,
      enumerable: true,
      get() {
        return colorValue
      },
    })

    Object.defineProperty(loggerLike, "magenta", {
      configurable: false,
      enumerable: true,
      get() {
        return colorValue
      },
    })

    globalThis.logger = loggerLike

    assert.doesNotThrow(() => setLog())
    assert.equal(typeof globalThis.logger.red, "function")
    assert.equal(typeof globalThis.logger.magenta, "function")
    assert.equal(globalThis.logger.red("a"), "fixed:a")
    assert.equal(typeof globalThis.logger.logger?.info, "function")
  } finally {
    globalThis.logger = previousLogger
  }
})
