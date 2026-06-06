import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import CommandUsageDB, {
  close,
  getDbPath,
  listUsage,
  recordUsage,
} from "../src/db/CommandUsageDB.js"
import {
  getCurrentRuntimeContext,
  resetRuntimeContextForTests,
} from "../src/runtime/runtime-context.js"

test.afterEach(async () => {
  await close()
  resetRuntimeContextForTests()
})

test("command usage db path stays lazy and follows the current runtime root", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "xunlu-command-usage-"))
  const previousCwd = process.cwd()

  try {
    await close()
    resetRuntimeContextForTests()
    process.chdir(tempRoot)

    const expectedDataDir = path.join(tempRoot, "data")
    const expectedDbPath = path.join(expectedDataDir, "command_usage.sqlite")

    assert.equal(CommandUsageDB.getDbPath(), expectedDbPath)
    assert.equal(getDbPath(), expectedDbPath)
    assert.equal(fs.existsSync(expectedDataDir), false)

    const context = getCurrentRuntimeContext()
    assert.notEqual(context, null)
    assert.equal(context.getConfigManager({ create: false }), null)

    await recordUsage({
      groupId: "10001",
      userId: "20002",
      plugin: "demo",
      reg: "^#demo",
      rawCommand: "#demo",
      protocol: "milky",
      triggeredAt: new Date(2026, 0, 2, 3, 4, 5).getTime(),
    })

    assert.equal(fs.existsSync(expectedDbPath), true)

    const rows = await listUsage({
      groupId: "10001",
      dateKeys: ["2026-01-02"],
      includeSynthetic: true,
    })

    assert.equal(rows.length, 1)
    assert.equal(rows[0].normalized_command, "#demo")
    assert.equal(rows[0].protocol, "milky")
  } finally {
    await close()
    process.chdir(previousCwd)
    resetRuntimeContextForTests()
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})
