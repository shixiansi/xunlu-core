import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { simulateIncomingEvent } from "../src/Bot/message/cli-simulator.js"
import { createPluginTestHarness } from "../src/dev/plugin-test-harness.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")
const fixturePlugin = path.resolve(repoRoot, "test", "fixtures", "plugins", "harness-fixture", "index.js")

installTestRuntime(test)

async function withHarness(options, fn) {
  const harness = await createPluginTestHarness(options)
  try {
    return await fn(harness)
  } finally {
    await harness.dispose()
  }
}

test("simulateIncomingEvent supports message/notice/request payloads", async () => {
  await withHarness({ plugins: [fixturePlugin], protocol: "milky" }, async harness => {
    const messageRes = await simulateIncomingEvent({
      bot: harness.bot,
      protocol: "milky",
      adapterType: "Mock",
      event: "message.group.normal",
      payload: { text: "fixture ping", group_id: 123, user_id: 10001 },
      selfId: 10000,
      bindEvent: harness.runtimeBot,
    })
    assert.equal(messageRes.ok, true)
    assert.equal(messageRes.event, "message.group.normal")
    assert.match(messageRes.replies[0]?.text || "", /pong/)

    const noticeRes = await simulateIncomingEvent({
      bot: harness.bot,
      protocol: "milky",
      adapterType: "Mock",
      event: "notice.group.decrease",
      payload: { group_id: 123, user_id: 10001, operator_id: 10002 },
      selfId: 10000,
      bindEvent: harness.runtimeBot,
    })
    assert.equal(noticeRes.ok, true)
    assert.equal(noticeRes.event, "notice.group.decrease")

    const requestRes = await simulateIncomingEvent({
      bot: harness.bot,
      protocol: "milky",
      adapterType: "Mock",
      event: "request.group.add",
      payload: { group_id: 123, user_id: 10001, flag: "flag-1", comment: "hello" },
      selfId: 10000,
      bindEvent: harness.runtimeBot,
    })
    assert.equal(requestRes.ok, true)
    assert.equal(requestRes.event, "request.group.add")
  })
})

test("resetCaptures keeps bot context state alive", async () => {
  await withHarness({ plugins: [fixturePlugin], protocol: "milky" }, async harness => {
    const start = await harness.emitMessage({
      scene: "group",
      text: "fixture context",
      group_id: 123,
      user_id: 10001,
    })
    assert.equal(start.ok, true)
    assert.match(start.replies[0]?.text || "", /context:start/)

    harness.resetCaptures()

    const middle = await harness.emitMessage({
      scene: "group",
      text: "继续",
      group_id: 123,
      user_id: 10001,
    })
    assert.equal(middle.ok, true)
    assert.match(middle.replies[0]?.text || "", /context:继续/)

    const end = await harness.emitMessage({
      scene: "group",
      text: "结束",
      group_id: 123,
      user_id: 10001,
    })
    assert.equal(end.ok, true)
    assert.match(end.replies[0]?.text || "", /context:结束/)

    harness.resetCaptures()

    const after = await harness.emitMessage({
      scene: "group",
      text: "继续",
      group_id: 123,
      user_id: 10001,
    })
    assert.equal(after.ok, true)
    assert.equal(after.replies.length, 0)
  })
})

test("flushTimeouts returns unified captures", async () => {
  await withHarness({ plugins: [fixturePlugin], protocol: "milky" }, async harness => {
    const start = await harness.emitMessage({
      scene: "group",
      text: "fixture timeout",
      group_id: 123,
      user_id: 10001,
    })
    assert.equal(start.ok, true)
    assert.match(start.replies[0]?.text || "", /timeout:start/)

    harness.resetCaptures()

    const flush = await harness.flushTimeouts()
    assert.equal(flush.ok, true)
    assert.equal(flush.event, "timers.flush")
    assert.equal(flush.result.executed, 1)
    assert.ok(flush.replies.length >= 1)
  })
})

test("fake renderer and scheduled task are captured", async () => {
  await withHarness({ plugins: [fixturePlugin], protocol: "milky" }, async harness => {
    const renderRes = await harness.emitMessage({
      scene: "group",
      text: "fixture render",
      group_id: 123,
      user_id: 10001,
    })
    assert.equal(renderRes.ok, true)
    assert.equal(renderRes.renderCalls.length, 1)
    assert.equal(renderRes.renderCalls[0]?.name, "fixture")
    assert.ok(renderRes.replies.length >= 1)

    harness.resetCaptures()

    const taskRes = await harness.runTask({ index: 0, ctxLike: { group_id: 123, user_id: 10001 } })
    assert.equal(taskRes.ok, true)
    assert.equal(taskRes.event, "task.0")
    assert.ok(taskRes.apiCalls.some(call => /send/i.test(String(call?.name || ""))))
    assert.ok(taskRes.replies.some(reply => /fixture scheduled/.test(String(reply?.text || ""))))
  })
})
