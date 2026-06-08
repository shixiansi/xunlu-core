import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

import { resetRuntimeContextForTests } from "../src/runtime/runtime-context.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")
const serviceUrl = pathToFileURL(
  path.join(repoRoot, "src", "plugins", "douyin", "services", "douyin-service.js"),
).href
const runtimeUrl = pathToFileURL(
  path.join(repoRoot, "src", "plugins", "douyin", "services", "douyin-runtime.js"),
).href

function createTempProjectRoot() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "xunlu-douyin-reset-"))
  fs.writeFileSync(path.join(tempRoot, "package.json"), `${JSON.stringify({ name: "xunlu-core" })}\n`)
  return tempRoot
}

test("douyin test reset clears video temp files", async () => {
  const previousCwd = process.cwd()
  const tempRoot = createTempProjectRoot()

  try {
    resetRuntimeContextForTests()
    process.chdir(tempRoot)
    const { default: DouyinService } = await import(`${serviceUrl}?reset=${Date.now()}`)
    const { getTempVideoDir } = await import(runtimeUrl)
    const tempVideoDir = getTempVideoDir()
    const staleVideo = path.join(tempVideoDir, "stale.mp4")

    fs.mkdirSync(path.dirname(staleVideo), { recursive: true })
    fs.writeFileSync(staleVideo, "video")

    DouyinService.__resetForTests()

    assert.equal(fs.existsSync(staleVideo), false)
    assert.equal(fs.existsSync(tempVideoDir), true)
  } finally {
    process.chdir(previousCwd)
    resetRuntimeContextForTests()
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})
