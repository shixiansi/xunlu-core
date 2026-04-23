import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import Downloader, { normalizeRootPath } from "../src/utils/download.js"
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
