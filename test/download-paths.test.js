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

test("downloadFile resolves on complete transfer even if socket closes before write flush", async () => {
  const http = await import("node:http")
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xunlu-download-ok-"))
  const payload = Buffer.alloc(512 * 1024, 7)
  const server = http.createServer((req, res) => {
    res.setHeader("content-length", String(payload.length))
    res.end(payload)
  })
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address()

  try {
    const downloader = new Downloader(dir)
    const ok = await downloader.downloadFile(`http://127.0.0.1:${port}/video.mp4`, "video.mp4", {
      resume: false,
    })

    assert.equal(ok, true)
    const written = fs.readFileSync(path.join(dir, "video.mp4"))
    assert.equal(written.length, payload.length)
  } finally {
    server.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test("downloadFile rejects and cleans partial file when connection closes mid-transfer", async () => {
  const http = await import("node:http")
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xunlu-download-cut-"))
  const partial = Buffer.alloc(256 * 1024, 7)
  const server = http.createServer((req, res) => {
    res.setHeader("content-length", String(1024 * 1024))
    res.write(partial)
    setTimeout(() => res.destroy(), 50)
  })
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address()

  try {
    const downloader = new Downloader(dir)
    await assert.rejects(
      () =>
        downloader.downloadFile(`http://127.0.0.1:${port}/cut.mp4`, "cut.mp4", {
          resume: false,
          retries: 0,
          timeoutMs: 2000,
          idleTimeoutMs: 800,
        }),
      /下载停滞|传输不完整|closed before end|user aborted/,
    )
    assert.equal(fs.existsSync(path.join(dir, "cut.mp4")), false)
  } finally {
    server.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test("downloadFile completes via byte count when server writes full payload then destroys socket without end", async () => {
  const http = await import("node:http")
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xunlu-download-halfclose-"))
  const payload = Buffer.alloc(300 * 1024, 9)
  const server = http.createServer((req, res) => {
    res.setHeader("content-length", String(payload.length))
    res.write(payload)
    // 故意不调用 res.end()：模拟 B 站 CDN 传满字节后直接断连、不发终止信号
    setTimeout(() => res.destroy(), 50)
  })
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address()

  try {
    const downloader = new Downloader(dir)
    const ok = await downloader.downloadFile(
      `http://127.0.0.1:${port}/audio.mp3`,
      "audio.mp3",
      { resume: false, timeoutMs: 2000, idleTimeoutMs: 5000 },
    )

    assert.equal(ok, true)
    const written = fs.readFileSync(path.join(dir, "audio.mp3"))
    assert.equal(written.length, payload.length)
  } finally {
    server.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test("downloadFile resumes partial download across retries", async () => {
  const http = await import("node:http")
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xunlu-download-resume-"))
  const payload = Buffer.alloc(400 * 1024, 5)
  let requests = 0
  const server = http.createServer((req, res) => {
    requests += 1
    const range = req.headers.range
    if (!range) {
      // 第一次：只给一半然后掐掉
      res.setHeader("content-length", String(payload.length))
      res.write(payload.subarray(0, 200 * 1024))
      setTimeout(() => res.destroy(), 30)
      return
    }
    const start = Number(String(range).match(/bytes=(\d+)/)?.[1] || 0)
    res.writeHead(206, { "content-length": String(payload.length - start) })
    res.end(payload.subarray(start))
  })
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address()

  try {
    const downloader = new Downloader(dir)
    const ok = await downloader.downloadFile(
      `http://127.0.0.1:${port}/part.mp4`,
      "part.mp4",
      { resume: true, timeoutMs: 2000, idleTimeoutMs: 800, retries: 2 },
    )

    assert.equal(ok, true)
    assert.equal(requests >= 2, true)
    const written = fs.readFileSync(path.join(dir, "part.mp4"))
    assert.equal(written.length, payload.length)
    assert.equal(Buffer.compare(written, payload), 0)
  } finally {
    server.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
