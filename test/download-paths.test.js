import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import Downloader, { normalizeRootPath } from "../src/utils/download.js"
import { scheduleTempFileCleanup } from "../src/plugins/shared/temp-file-cleanup.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

test("normalizeRootPath appends a trailing separator for bare root paths", () => {
  const input = path.join(os.tmpdir(), "xunlu-download-root")
  const normalized = normalizeRootPath(input)

  assert.equal(normalized.endsWith(path.sep), true)
  assert.equal(normalized.startsWith(path.resolve(input)), true)
})

test("Downloader keeps Filemage root path slash-safe for relative save paths", () => {
  const input = path.join(os.tmpdir(), "xunlu-download-root")
  const downloader = new Downloader(input)

  assert.equal(downloader.rootPath.endsWith(path.sep), true)
  assert.equal(downloader.fileMage.RootPath.endsWith(path.sep), true)
})

test("scheduleTempFileCleanup removes files after deferred attempt", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xunlu-cleanup-"))
  const filePath = path.join(dir, "video.mp4")
  fs.writeFileSync(filePath, "fixture")

  try {
    const count = scheduleTempFileCleanup(filePath, { delaysMs: [0] })
    await new Promise(resolve => setTimeout(resolve, 20))

    assert.equal(count, 1)
    assert.equal(fs.existsSync(filePath), false)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
