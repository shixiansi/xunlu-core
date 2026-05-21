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
  buildEnabledProactiveGroupItems,
  collectProactiveGroupIds,
  collectTrackedGroupIds,
  findMissingGroupIds,
  normalizeGroupId,
  normalizeGroupIdSet,
} from "../src/plugins/learning_chat/services/group-scope.js"
import {
  buildProactiveBatchPlan,
  buildProactiveCandidate,
  buildProactiveSendStateUpdate,
  buildProactiveTimingPlan,
  didUserReplySinceLastProactive,
  pickProactiveBatchSize,
} from "../src/plugins/learning_chat/services/proactive-planner.js"
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

test("learning_chat group scope helpers normalize proactive and cleanup group ids", () => {
  assert.equal(normalizeGroupId(" 12345 "), "12345")
  assert.deepEqual(
    Array.from(
      normalizeGroupIdSet([
        "100",
        { group_id: "200" },
        { groupId: "300" },
        { id: "400" },
        { uin: "500" },
        "",
      ]),
    ),
    ["100", "200", "300", "400", "500"],
  )

  const proactiveIds = collectProactiveGroupIds({
    configGroups: {
      "300": {},
      "100": {},
    },
    heatGroupIds: ["200"],
    extraGroupIds: ["100", "400"],
    discoveredIds: [{ group_id: "500" }],
  })
  assert.deepEqual(Array.from(proactiveIds), ["100", "300", "200", "400", "500"])

  const items = buildEnabledProactiveGroupItems(proactiveIds, {
    config: {
      groups: {
        "100": { proactive_enabled: true },
        "300": { proactive_enabled: false },
      },
      proactive: {
        enable: true,
        command_enable: false,
      },
    },
    getEffectiveGroupConfig(groupId) {
      return {
        proactive_enabled: groupId !== "200",
        proactive_command_enabled: groupId === "500",
      }
    },
  })
  assert.deepEqual(items.map(item => item.group_id), ["100", "300", "400", "500"])
  assert.deepEqual(items.find(item => item.group_id === "100")?.override, { proactive_enabled: true })
  assert.equal(items.find(item => item.group_id === "500")?.effective.proactive_command_enabled, true)
  assert.equal(items[0].global_proactive_enabled, true)
  assert.equal(items[0].global_proactive_command_enabled, false)

  const trackedIds = collectTrackedGroupIds({
    configGroups: { "100": {}, "200": {} },
    heatGroupIds: ["300"],
    learningGroupIds: ["400", ""],
  })
  assert.deepEqual(Array.from(trackedIds), ["100", "200", "300", "400"])
  assert.deepEqual(findMissingGroupIds(trackedIds, new Set(["100", "300"])), ["200", "400"])
})

test("learning_chat proactive planner keeps tick thresholds and backoff pure", () => {
  const now = 1_000_000
  const timingPlan = buildProactiveTimingPlan({
    min_messages_today: "10",
    silence_factor: "3",
    min_silence_sec: "20",
    min_interval_sec: "60",
    backoff_base_sec: "30",
    backoff_max_exp: "2",
  })

  assert.deepEqual(timingPlan, {
    minMessagesToday: 10,
    silenceFactor: 3,
    minSilenceSec: 20,
    minIntervalMs: 60_000,
    backoffBaseMs: 30_000,
    maxBackoffExp: 2,
    maxAttempts: 3,
  })

  const batchPlan = buildProactiveBatchPlan({ batch_min: "2", batch_max: "4" })
  assert.deepEqual(batchPlan, { batchMin: 2, batchMax: 4 })
  assert.equal(pickProactiveBatchSize(batchPlan, () => 0), 2)
  assert.equal(pickProactiveBatchSize(batchPlan, () => 0.99), 4)

  const ready = buildProactiveCandidate({
    gid: "100",
    groupCfg: { proactive_enabled: true },
    heat: {
      messagesToday: 20,
      avgIntervalSec: 10,
      lastMsgAt: now - 31_000,
      lastUserMsgAt: now - 65_000,
    },
    state: { last_proactive_at: now - 70_000 },
    proactiveState: { attempts_no_reply: 2 },
    plan: timingPlan,
    now,
  })
  assert.deepEqual(ready.candidate, { gid: "100", weight: 20 })
  assert.equal(ready.resetAttemptsNoReply, true)

  const stillCoolingDown = buildProactiveCandidate({
    gid: "100",
    groupCfg: { proactive_enabled: true },
    heat: {
      messagesToday: 20,
      avgIntervalSec: 10,
      lastMsgAt: now - 31_000,
      lastUserMsgAt: 0,
    },
    state: { last_proactive_at: now - 50_000 },
    proactiveState: { attempts_no_reply: 2 },
    plan: timingPlan,
    now,
  })
  assert.equal(stillCoolingDown.candidate, null)
  assert.equal(stillCoolingDown.resetAttemptsNoReply, false)

  const tooLoud = buildProactiveCandidate({
    gid: "100",
    groupCfg: { proactive_enabled: true },
    heat: {
      messagesToday: 20,
      avgIntervalSec: 10,
      lastMsgAt: now - 5_000,
      lastUserMsgAt: 0,
    },
    state: { last_proactive_at: now - 70_000 },
    proactiveState: { attempts_no_reply: 0 },
    plan: timingPlan,
    now,
  })
  assert.equal(tooLoud.candidate, null)

  assert.equal(
    didUserReplySinceLastProactive({
      lastProactiveAt: now - 70_000,
      lastUserMsgAt: now - 65_000,
    }),
    true,
  )
  assert.equal(
    buildProactiveSendStateUpdate({
      groupState: { last_proactive_at: now - 70_000 },
      proactiveState: { attempts_no_reply: 3 },
      heat: { lastUserMsgAt: now - 65_000 },
      plan: timingPlan,
    }).attemptsNoReply,
    1,
  )
  assert.equal(
    buildProactiveSendStateUpdate({
      groupState: { last_proactive_at: now - 70_000 },
      proactiveState: { attempts_no_reply: 3 },
      heat: { lastUserMsgAt: 0 },
      plan: timingPlan,
    }).attemptsNoReply,
    3,
  )
})
