import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import cfg from "../src/lib/config.js"
import env from "../src/lib/env.js"
import {
  getCurrentRuntimeContext,
  resetRuntimeContextForTests,
  RuntimeContext,
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

test("runtime context keeps env and layout access lazy until explicit use", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "xunlu-env-lazy-"))
  const context = new RuntimeContext({ cwd: tempRoot, isWatcher: false })

  try {
    assert.equal(context.env.RootPath, `${tempRoot}${path.sep}`)
    assert.equal(context.env.CurEnv, "xunlu-core")
    assert.equal(context.getConfigManager({ create: false }), null)
    assert.equal(fs.existsSync(path.join(tempRoot, "data")), false)
    assert.equal(fs.existsSync(path.join(tempRoot, "temp")), false)
    assert.equal(fs.existsSync(path.join(tempRoot, "config")), false)

    context.ensureRuntimeLayout()
    assert.equal(fs.existsSync(path.join(tempRoot, "data")), true)
    assert.equal(fs.existsSync(path.join(tempRoot, "temp")), true)
    assert.equal(fs.existsSync(path.join(tempRoot, "config")), false)

    const botConfig = context.config.getConfig("bot")
    assert.deepEqual(botConfig, {})
    assert.equal(fs.existsSync(path.join(tempRoot, "config", "config", "bot.config.yaml")), true)
  } finally {
    context.cleanup()
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})

test("lib env root path access does not create runtime layout or config manager", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "xunlu-env-entry-lazy-"))
  const previousCwd = process.cwd()

  try {
    resetRuntimeContextForTests()
    process.chdir(tempRoot)

    assert.equal(env.RootPath, `${tempRoot}${path.sep}`)
    assert.equal(env.CurEnv, "xunlu-core")

    const context = getCurrentRuntimeContext()
    assert.notEqual(context, null)
    assert.equal(context.getConfigManager({ create: false }), null)
    assert.equal(fs.existsSync(path.join(tempRoot, "data")), false)
    assert.equal(fs.existsSync(path.join(tempRoot, "temp")), false)
    assert.equal(fs.existsSync(path.join(tempRoot, "config")), false)
  } finally {
    process.chdir(previousCwd)
    resetRuntimeContextForTests()
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})

test("plugin stores do not pin root paths at import time", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "xunlu-store-path-lazy-"))
  const previousCwd = process.cwd()

  try {
    resetRuntimeContextForTests()
    process.chdir(tempRoot)

    const [
      antiPhish,
      chuoConfig,
      fuduStore,
      learningConfig,
      learningDb,
      qunDailyPush,
      qunDailyStats,
      douyinRuntime,
    ] = await Promise.all([
      import(`../src/plugins/anti-phish/model/store.js?lazy=${Date.now()}`),
      import(`../src/plugins/chuo/model/config.js?lazy=${Date.now()}`),
      import(`../src/plugins/fudu-ban/model/store.js?lazy=${Date.now()}`),
      import(`../src/plugins/learning_chat/model/config.js?lazy=${Date.now()}`),
      import(`../src/plugins/learning_chat/model/db.js?lazy=${Date.now()}`),
      import(`../src/plugins/qun-daily/model/push-store.js?lazy=${Date.now()}`),
      import(`../src/plugins/qun-daily/model/store.js?lazy=${Date.now()}`),
      import(`../src/plugins/douyin/services/douyin-runtime.js?lazy=${Date.now()}`),
    ])

    assert.equal(fs.existsSync(path.join(tempRoot, "data")), false)
    assert.equal(fs.existsSync(path.join(tempRoot, "temp")), false)
    assert.equal(fs.existsSync(path.join(tempRoot, "config")), false)

    assert.equal(antiPhish.getAntiPhishStorePath(), path.join(tempRoot, "data", "anti-phish.json"))
    assert.equal(chuoConfig.getChuoConfigPath(), path.join(tempRoot, "data", "chuo", "config.json"))
    assert.equal(fuduStore.getDbPath(), path.join(tempRoot, "data", "fudu-ban.json"))
    assert.equal(learningConfig.getConfigPath(), path.join(tempRoot, "data", "learning_chat", "config.yaml"))
    assert.equal(learningDb.getDbPath(), path.join(tempRoot, "data", "learning_chat", "learning_chat.sqlite"))
    assert.equal(
      qunDailyPush.getGroupPushStorePath(),
      path.join(tempRoot, "data", "qun-daily", "push-settings.json"),
    )
    assert.equal(
      qunDailyStats.getStatsFilePath("10001", "2026-06-08"),
      path.join(tempRoot, "data", "qun-daily", "stats", "10001", "2026-06-08.json"),
    )
    assert.equal(douyinRuntime.getTempVideoDir(), path.join(tempRoot, "temp", "douyin", "video"))

    assert.equal(fs.existsSync(path.join(tempRoot, "data")), false)
    assert.equal(fs.existsSync(path.join(tempRoot, "temp")), false)
  } finally {
    process.chdir(previousCwd)
    resetRuntimeContextForTests()
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
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
