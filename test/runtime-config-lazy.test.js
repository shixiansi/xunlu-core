import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import cfg from "../src/lib/config.js"
import {
  getCurrentRuntimeContext,
  resetRuntimeContextForTests,
} from "../src/runtime/runtime-context.js"
import { createRuntimeConfigManager } from "../src/runtime/runtime-config.js"

test.afterEach(() => {
  resetRuntimeContextForTests()
})

test("lib config import stays lazy until config manager access", () => {
  resetRuntimeContextForTests()

  assert.equal(getCurrentRuntimeContext(), null)
  assert.equal(typeof cfg.cleanup, "function")
  cfg.cleanup()
  assert.equal(getCurrentRuntimeContext(), null)

  const botConfig = cfg.getConfig("bot")
  assert.ok(botConfig)
  assert.notEqual(getCurrentRuntimeContext(), null)
})

test("lib config proxy allows temporary method overrides without runtime initialization", () => {
  resetRuntimeContextForTests()

  cfg.getConfig = () => ({ patched: true })

  assert.equal(getCurrentRuntimeContext(), null)
  assert.deepEqual(cfg.getConfig("bot"), { patched: true })
  assert.equal(getCurrentRuntimeContext(), null)

  delete cfg.getConfig
  assert.equal(getCurrentRuntimeContext(), null)
})

test("runtime config creates missing user config files on demand", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "xunlu-config-lazy-"))
  const manager = createRuntimeConfigManager({ rootDir: tempRoot, isWatcher: false })

  try {
    const botConfig = manager.getConfig("bot")
    const botConfigPath = path.join(tempRoot, "config", "config", "bot.config.yaml")

    assert.deepEqual(botConfig, {})
    assert.equal(fs.existsSync(botConfigPath), true)
  } finally {
    manager.cleanup()
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})
