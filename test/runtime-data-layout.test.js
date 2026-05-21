import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { RuntimePaths } from "../src/runtime/runtime-paths.js"
import { Filemage, readJsonFile, sanitizeFilename } from "../src/utils/index.js"
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
    const legacyTtsAudio = ensureFile(
      path.join(tempRoot, "src", "plugins", "tts", "resources", "audio", "generated.mp3"),
      "tts-audio-cache",
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
      fs.readFileSync(path.join(tempRoot, "temp", "tts", "audio", "generated.mp3"), "utf8"),
      fs.readFileSync(legacyTtsAudio, "utf8"),
    )
    assert.equal(
      fs.readFileSync(targetBilibili, "utf8"),
      "{\"nickname\":\"新目录已有数据\"}",
    )
    assert.equal(fs.existsSync(legacyBilibili), true)
    assert.equal(fs.existsSync(legacyQunDaily), true)
    assert.equal(fs.existsSync(legacyPixivTemp), true)
    assert.equal(fs.existsSync(legacyPixivMirage), true)
    assert.equal(fs.existsSync(legacyTtsAudio), true)

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

test("shared utils expose focused file and path helpers", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "xunlu-utils-"))

  try {
    const jsonFile = ensureFile(path.join(tempRoot, "sample.json"), "{\"ok\":true}")

    assert.deepEqual(readJsonFile(jsonFile), { ok: true })
    assert.deepEqual(readJsonFile(path.join(tempRoot, "missing.json"), { ok: false }), {
      ok: false,
    })
    assert.equal(sanitizeFilename("  a:b/c*  "), "a_b_c_")
    assert.equal(new Filemage(tempRoot).sanitizeFilename("  a:b/c*  "), "a_b_c_")

    const ttsHandlers = await import("../src/plugins/tts/controllers/handlers.js")
    assert.equal(
      ttsHandlers.__test.resourcesDir,
      path.join(process.cwd(), "src", "plugins", "tts", "resources"),
    )
    assert.equal(ttsHandlers.__test.audioTempDir, path.join(process.cwd(), "temp", "tts", "audio"))
    assert.equal(Array.isArray(ttsHandlers.__test.readCategoryList()), true)
    assert.equal(typeof ttsHandlers.__test.readCharacterAudioList(), "object")
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})
