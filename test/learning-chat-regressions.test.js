import assert from "node:assert/strict"
import test from "node:test"

import { setGroupOverrides } from "../src/plugins/learning_chat/model/config.js"
import {
  getHeatSnapshot,
  listEnabledProactiveGroups,
} from "../src/plugins/learning_chat/controllers/handlers.js"
import {
  patchImageSegmentsWithRkeyValue,
  prepareOutboundLearningSegments,
  sendLearningSegments,
} from "../src/plugins/learning_chat/services/outbound-media.js"
import {
  markBotSpoke,
  resetHeatStateForTests,
} from "../src/plugins/learning_chat/services/heat-state.js"
import { UniversalSegmentType, UniversalMessageSegment } from "../src/Bot/message/index.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

test.afterEach(() => {
  resetHeatStateForTests()
})

test("learning_chat outbound media patches QQNT image urls with rkey suffix", () => {
  const segments = [
    {
      type: UniversalSegmentType.IMAGE,
      data: {
        url: "https://multimedia.nt.qq.com.cn/path/image.jpg",
        fileId: "https://multimedia.nt.qq.com.cn/path/file.jpg",
      },
    },
  ]

  const patched = patchImageSegmentsWithRkeyValue(segments, "&rkey=test-rkey")
  assert.notEqual(patched, segments)
  assert.match(String(patched[0]?.data?.url || ""), /rkey=test-rkey/)
  assert.match(String(patched[0]?.data?.fileId || ""), /rkey=test-rkey/)
})

test("learning_chat outbound media downgrades basename-only onebot images to text", async () => {
  const outbound = await prepareOutboundLearningSegments(
    [
      {
        type: UniversalSegmentType.IMAGE,
        data: {
          fileId: "image.png",
          summary: "图片占位",
        },
      },
    ],
    {
      protocol: "onebotv11",
      runtimeProtocolHint: "onebotv11",
    },
  )

  assert.equal(outbound.length, 1)
  assert.equal(outbound[0]?.type, UniversalSegmentType.TEXT)
  assert.equal(outbound[0]?.data?.content, "图片占位")
})

test("learning_chat proactive groups and heat snapshot remain readable after service split", async () => {
  const sent = []

  await setGroupOverrides("987654321", {
    proactive_enabled: true,
    proactive_command_enabled: false,
  })

  const ok = await sendLearningSegments(
    "987654321",
    [UniversalMessageSegment.text("hello world")],
    {
      protocol: "milky",
      runtimeProtocolHint: "milky",
      send: async (target, message) => {
        sent.push({ target, message })
        return true
      },
      afterSend: markBotSpoke,
    },
  )

  assert.equal(ok, true)
  assert.equal(sent.length, 1)
  assert.deepEqual(sent[0].target, { group_id: 987654321 })
  assert.ok(getHeatSnapshot().some(item => item.group_id === "987654321" && item.lastMsgFromBot))

  const groups = await listEnabledProactiveGroups({
    discoveredIds: ["987654321"],
    extraGroupIds: ["987654321"],
  })
  assert.ok(groups.some(item => item.group_id === "987654321"))
  assert.equal(groups.find(item => item.group_id === "987654321")?.effective?.proactive_enabled, true)
})
