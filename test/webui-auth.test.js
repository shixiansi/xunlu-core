import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import {
  createWebuiAuthToken,
  getWebuiConfig,
  getWebuiConfigPath,
  getWebuiDataDir,
  getWebuiSessionFromRequest,
  updateWebuiAuth,
  verifyWebuiAuthToken,
  verifyWebuiPassword,
} from "../src/lib/webui/auth.js"
import { resetRuntimeContextForTests } from "../src/runtime/runtime-context.js"

test.afterEach(() => {
  resetRuntimeContextForTests()
})

test("webui auth config path stays lazy and follows the current runtime root", async () => {
  const firstRoot = fs.mkdtempSync(path.join(os.tmpdir(), "xunlu-webui-auth-a-"))
  const secondRoot = fs.mkdtempSync(path.join(os.tmpdir(), "xunlu-webui-auth-b-"))
  const previousCwd = process.cwd()

  try {
    process.chdir(firstRoot)
    resetRuntimeContextForTests()

    const firstConfigPath = path.join(firstRoot, "data", "webui", "config.yaml")
    assert.equal(getWebuiDataDir(), path.join(firstRoot, "data", "webui"))
    assert.equal(getWebuiConfigPath(), firstConfigPath)
    assert.equal(fs.existsSync(path.join(firstRoot, "data")), false)

    const firstConfig = getWebuiConfig()
    assert.equal(firstConfig.auth.username, "admin")
    assert.equal(fs.existsSync(firstConfigPath), true)
    assert.equal(verifyWebuiPassword("admin"), true)

    await updateWebuiAuth({
      username: "operator",
      password: "secret-pass",
      title: "First WebUI",
    })
    assert.equal(verifyWebuiPassword("secret-pass"), true)
    const token = createWebuiAuthToken("operator")
    assert.equal(verifyWebuiAuthToken(token)?.username, "operator")
    assert.equal(
      getWebuiSessionFromRequest({
        headers: {
          cookie: `xunlu_webui_token=${encodeURIComponent(token)}`,
        },
      })?.username,
      "operator",
    )

    process.chdir(secondRoot)
    resetRuntimeContextForTests()

    const secondConfigPath = path.join(secondRoot, "data", "webui", "config.yaml")
    assert.equal(getWebuiConfigPath(), secondConfigPath)
    assert.equal(fs.existsSync(path.join(secondRoot, "data")), false)

    const secondConfig = getWebuiConfig()
    assert.equal(secondConfig.auth.username, "admin")
    assert.equal(secondConfig.ui.title, "xunlu-core WebUI")
    assert.equal(fs.existsSync(secondConfigPath), true)
    assert.notEqual(getWebuiConfigPath(), firstConfigPath)
  } finally {
    process.chdir(previousCwd)
    resetRuntimeContextForTests()
    fs.rmSync(firstRoot, { recursive: true, force: true })
    fs.rmSync(secondRoot, { recursive: true, force: true })
  }
})
