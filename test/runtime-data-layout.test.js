import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { RuntimePaths } from "../src/runtime/runtime-paths.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

function ensureFile(filePath, content = "fixture") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, "utf8")
  return filePath
}

test("RuntimePaths migrates legacy plugin runtime files into unified runtime directories", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "xunlu-runtime-layout-"))

  try {
    ensureFile(
      path.join(tempRoot, "package.json"),
      JSON.stringify({ name: "xunlu-core", version: "0.0.0-test" }, null, 2),
    )

    const legacyBilibili = ensureFile(
      path.join(tempRoot, "src", "plugins", "bilibili", "data", "group", "10001.json"),
      "{\"nickname\":\"旧订阅\"}",
    )
    const legacyQunDaily = ensureFile(
      path.join(tempRoot, "src", "plugins", "qun-daily", "data", "stats", "10001", "2026-04-01.json"),
      "{\"messages\":12}",
    )
    const legacyPixivTemp = ensureFile(
      path.join(tempRoot, "src", "plugins", "pixiv", "temp", "cached.jpg"),
      "pixiv-cache",
    )
    const legacyPixivMirage = ensureFile(
      path.join(tempRoot, "src", "plugins", "pixiv", "model", "temp", "generated.png"),
      "pixiv-mirage-cache",
    )
    const targetBilibili = ensureFile(
      path.join(tempRoot, "data", "bilibili", "group", "keep.json"),
      "{\"nickname\":\"新目录已有数据\"}",
    )

    const runtimePaths = new RuntimePaths({ cwd: tempRoot })
    runtimePaths.ensureRuntimeLayout()

    assert.equal(
      fs.readFileSync(path.join(tempRoot, "data", "bilibili", "group", "10001.json"), "utf8"),
      fs.readFileSync(legacyBilibili, "utf8"),
    )
    assert.equal(
      fs.readFileSync(
        path.join(tempRoot, "data", "qun-daily", "stats", "10001", "2026-04-01.json"),
        "utf8",
      ),
      fs.readFileSync(legacyQunDaily, "utf8"),
    )
    assert.equal(
      fs.readFileSync(path.join(tempRoot, "temp", "pixiv", "cached.jpg"), "utf8"),
      fs.readFileSync(legacyPixivTemp, "utf8"),
    )
    assert.equal(
      fs.readFileSync(path.join(tempRoot, "temp", "pixiv", "mirage", "generated.png"), "utf8"),
      fs.readFileSync(legacyPixivMirage, "utf8"),
    )
    assert.equal(
      fs.readFileSync(targetBilibili, "utf8"),
      "{\"nickname\":\"新目录已有数据\"}",
    )
    assert.equal(fs.existsSync(legacyBilibili), true)
    assert.equal(fs.existsSync(legacyQunDaily), true)
    assert.equal(fs.existsSync(legacyPixivTemp), true)
    assert.equal(fs.existsSync(legacyPixivMirage), true)

    assert.equal(
      runtimePaths.getResourcePath("webui", "index.html"),
      path.join(tempRoot, "resources", "webui", "index.html"),
    )

    const pluginDataDir = runtimePaths.getPluginDataDir("demo-plugin")
    const pluginTempDir = runtimePaths.getPluginTempDir("demo-plugin", "cache")
    assert.equal(path.basename(pluginDataDir), "demo-plugin")
    assert.equal(path.basename(pluginTempDir), "cache")
    assert.equal(fs.existsSync(pluginDataDir), true)
    assert.equal(fs.existsSync(pluginTempDir), true)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})
