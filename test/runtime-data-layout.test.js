import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { getDouyinAuthFilePath, getDouyinDataDir } from "../src/plugins/douyin/model/auth-store.js"
import {
  getBrowserProfileRoot,
  getQrImagePath,
  getTempDir as getDouyinTempDir,
  getTempVideoDir,
} from "../src/plugins/douyin/services/douyin-runtime.js"
import { RuntimePaths } from "../src/runtime/runtime-paths.js"
import {
  Filemage,
  readJsonFile,
  removeDirQuietly,
  removeFileQuietly,
  resolvePluginDataPath,
  resolvePluginTempPath,
  sanitizeFilename,
} from "../src/utils/index.js"
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
    const legacyBilibiliVideo = ensureFile(
      path.join(tempRoot, "src", "plugins", "bilibili", "resources", "video", "source_BVTEST.mp4"),
      "bilibili-video-cache",
    )
    const legacyBilibiliForwardImage = ensureFile(
      path.join(
        tempRoot,
        "src",
        "plugins",
        "bilibili",
        "resources",
        "dynamic-forward",
        "dynamic_1.jpg",
      ),
      "bilibili-forward-cache",
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
      fs.readFileSync(path.join(tempRoot, "temp", "bilibili", "video", "source_BVTEST.mp4"), "utf8"),
      fs.readFileSync(legacyBilibiliVideo, "utf8"),
    )
    assert.equal(
      fs.readFileSync(
        path.join(tempRoot, "temp", "bilibili", "dynamic-forward", "dynamic_1.jpg"),
        "utf8",
      ),
      fs.readFileSync(legacyBilibiliForwardImage, "utf8"),
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
    assert.equal(fs.existsSync(legacyBilibiliVideo), true)
    assert.equal(fs.existsSync(legacyBilibiliForwardImage), true)
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
    assert.equal(
      resolvePluginDataPath("douyin", "auth.json"),
      path.join(process.cwd(), "data", "douyin", "auth.json"),
    )
    assert.equal(
      resolvePluginTempPath("douyin", "login-qrcode.png"),
      path.join(process.cwd(), "temp", "douyin", "login-qrcode.png"),
    )
    assert.equal(sanitizeFilename("  a:b/c*  "), "a_b_c_")
    assert.equal(new Filemage(tempRoot).sanitizeFilename("  a:b/c*  "), "a_b_c_")

    const removableFile = ensureFile(path.join(tempRoot, "remove-me.txt"), "tmp")
    removeFileQuietly(removableFile)
    assert.equal(fs.existsSync(removableFile), false)

    const removableDir = path.join(tempRoot, "remove-dir")
    ensureFile(path.join(removableDir, "nested", "tmp.txt"), "tmp")
    removeDirQuietly(removableDir)
    assert.equal(fs.existsSync(removableDir), false)

    const ttsHandlers = await import("../src/plugins/tts/controllers/handlers.js")
    assert.equal(
      ttsHandlers.__test.resourcesDir,
      path.join(process.cwd(), "src", "plugins", "tts", "resources"),
    )
    assert.equal(ttsHandlers.__test.audioTempDir, path.join(process.cwd(), "temp", "tts", "audio"))
    assert.equal(Array.isArray(ttsHandlers.__test.readCategoryList()), true)
    assert.equal(typeof ttsHandlers.__test.readCharacterAudioList(), "object")

    assert.equal(getDouyinDataDir(), path.join(process.cwd(), "data", "douyin"))
    assert.equal(getDouyinAuthFilePath(), path.join(process.cwd(), "data", "douyin", "auth.json"))
    assert.equal(getDouyinTempDir(), path.join(process.cwd(), "temp", "douyin"))
    assert.equal(getTempVideoDir(), path.join(process.cwd(), "temp", "douyin", "video"))
    assert.equal(getBrowserProfileRoot(), path.join(process.cwd(), "temp", "douyin", "browser-profile"))
    assert.equal(getQrImagePath(), path.join(process.cwd(), "temp", "douyin", "login-qrcode.png"))
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})
