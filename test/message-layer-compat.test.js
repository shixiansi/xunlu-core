import assert from "node:assert/strict"
import test from "node:test"

import {
  UniversalMessage,
  UniversalMessageSegment,
  UniversalSegmentType,
  applyDerivedFieldsFromUniversalSegments,
  attachStandardMessageApis,
  coerceToUniversalMessage,
  renderUniversalSegments,
  segment,
} from "../src/Bot/message/index.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

test("message layer wrappers keep universal parsing and encoding compatible", () => {
  const message = UniversalMessage.from("onebotv11", [
    { type: "text", data: { text: "你好" } },
    { type: "at", data: { qq: "all" } },
  ])

  assert.equal(message.segments.length, 2)
  assert.equal(message.segments[0].type, UniversalSegmentType.TEXT)
  assert.equal(message.segments[1].type, UniversalSegmentType.MENTION_ALL)

  const encoded = message.convertTo("onebotv11")
  assert.deepEqual(encoded, [
    { type: "text", data: { text: "你好" } },
    { type: "at", data: { qq: "all" } },
  ])
})

test("message layer wrappers keep coerce and derived ctx fields compatible", async () => {
  const universal = coerceToUniversalMessage(["hello", "[face:14]"])
  assert.equal(universal.segments.length, 2)
  assert.equal(renderUniversalSegments(universal.segments), "hello[face:14]")

  const ctx = {
    protocol: "onebotv11",
    self_id: 10000,
    message_id: "abc-1",
    message_seq: 123,
    message: [
      UniversalMessageSegment.text("看看这个 "),
      UniversalMessageSegment.mention("10000"),
      UniversalMessageSegment.image({ url: "https://example.com/a.png" }),
    ],
    async getMsg(id) {
      return {
        message: [{ type: "text", data: { text: `reply:${id}` } }],
      }
    },
  }

  applyDerivedFieldsFromUniversalSegments(ctx)
  attachStandardMessageApis(ctx)

  assert.equal(ctx.atBot, true)
  assert.equal(ctx.img[0], "https://example.com/a.png")
  assert.equal(ctx.messageRef.msgId, "abc-1")

  ctx.message.unshift(UniversalMessageSegment.reply({ id: "reply-001" }))
  const replied = await ctx.getReplyMessage()
  assert.equal(replied.protocol, "onebotv11")
  assert.equal(replied.message[0].type, UniversalSegmentType.TEXT)
})

test("legacy segment compatibility still produces universal media segments", () => {
  const imageSeg = segment.image(Buffer.from("abc"))
  const videoSeg = segment.video("file:///tmp/demo.mp4")

  assert.equal(imageSeg.type, UniversalSegmentType.IMAGE)
  assert.match(String(imageSeg.data.file || ""), /^base64:\/\//)
  assert.equal(videoSeg.type, UniversalSegmentType.VIDEO)
  assert.equal(videoSeg.data.file, "file:///tmp/demo.mp4")
})

test("message coercion drops button segments instead of stringifying them", () => {
  const universal = coerceToUniversalMessage([
    { type: "text", data: { text: "前缀" } },
    { type: "button", data: { text: "按钮" } },
  ])

  assert.equal(universal.segments.length, 1)
  assert.equal(universal.segments[0].type, UniversalSegmentType.TEXT)
  assert.equal(renderUniversalSegments(universal.segments), "前缀")
})
