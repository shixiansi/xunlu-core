import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import OneBotV11Adapter from "../src/Bot/adapter/onebotV11/onebot.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

test("onebot adapter encodes local video file URIs as base64", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "xunlu-onebot-video-"))
  const videoPath = path.join(tempDir, "demo.mp4")
  const payload = Buffer.from("fake-mp4-payload")
  fs.writeFileSync(videoPath, payload)

  try {
    const adapter = new OneBotV11Adapter()
    const message = adapter.dealOneBotMsg([
      {
        type: "video",
        data: {
          file: pathToFileURL(videoPath).href,
        },
      },
    ])

    assert.equal(message.length, 1)
    assert.equal(message[0].type, "video")
    assert.match(String(message[0].data?.file || ""), /^base64:\/\//)
    assert.equal(
      Buffer.from(String(message[0].data.file).slice("base64://".length), "base64").toString(),
      payload.toString(),
    )
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test("onebot adapter keeps remote video URLs unchanged", () => {
  const adapter = new OneBotV11Adapter()
  const remoteUrl = "https://example.com/demo.mp4"
  const message = adapter.dealOneBotMsg([
    {
      type: "video",
      data: {
        file: remoteUrl,
      },
    },
  ])

  assert.equal(message.length, 1)
  assert.equal(message[0].data?.file, remoteUrl)
})
