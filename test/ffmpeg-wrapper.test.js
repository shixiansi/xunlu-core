import assert from "node:assert/strict"
import test from "node:test"

import ffmpeg from "../src/component/ffmpeg/ffmpeg.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

async function withPatchedRun(impl, fn) {
  const original = ffmpeg.run
  ffmpeg.run = impl
  try {
    return await fn()
  } finally {
    ffmpeg.run = original
  }
}

test("ffmpeg mux falls back to audio transcode when stream copy fails", async () => {
  const calls = []

  await withPatchedRun(
    async (args, { label } = {}) => {
      calls.push({ args: [...args], label })
      if (calls.length === 1) {
        const err = new Error("视频合成(直拷贝)失败：ffmpeg exited with code 1 | invalid audio stream")
        err.stderr = "invalid audio stream"
        throw err
      }
      return { ok: true, code: 0, stdout: "", stderr: "" }
    },
    async () => {
      const result = await ffmpeg.muxVideoAndAudio("video.mp4", "audio.m4a", "result.mp4")
      assert.equal(calls.length, 2)
      assert.equal(result.attempt, "视频合成(音频转码)")
      assert.ok(calls[0].args.includes("copy"))
      assert.ok(calls[1].args.includes("aac"))
    },
  )
})

test("ffmpeg mux error preserves stderr detail after all attempts fail", async () => {
  const calls = []

  await withPatchedRun(
    async (args, { label } = {}) => {
      calls.push({ args: [...args], label })
      const err = new Error(`${label}失败`)
      err.stderr = "Could not write header for output file #0"
      throw err
    },
    async () => {
      await assert.rejects(
        async () => await ffmpeg.muxVideoAndAudio("video.mp4", "audio.m4a", "result.mp4"),
        err => {
          assert.equal(calls.length, 3)
          assert.match(String(err?.stderr || ""), /Could not write header/)
          return true
        },
      )
    },
  )
})
