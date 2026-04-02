import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { createPluginTestHarness } from "../src/dev/plugin-test-harness.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")
const pixivFixture = path.resolve(repoRoot, "test", "fixtures", "plugins", "pixiv", "index.js")
const masterId = 1765629830
const EXAMPLE_COMMAND = "\u793a\u4f8b"
const HELP_COMMAND = "\u5e2e\u52a9"
const OTHER_FORWARD_COMMAND = "\u6d4b\u8bd5\u8f6c\u53d1"
const OTHER_RECALL_COMMAND = "\u6d4b\u8bd5\u64a4\u56de"

installTestRuntime(test)

async function withHarness(options, fn) {
  const harness = await createPluginTestHarness(options)
  try {
    return await fn(harness)
  } finally {
    await harness.dispose()
  }
}

test("example plugin smoke works on milky and onebotv11", async () => {
  for (const protocol of ["milky", "onebotv11"]) {
    await withHarness({ plugins: ["example-plugin"], protocol }, async harness => {
      const res = await harness.emitMessage({
        scene: "group",
        text: EXAMPLE_COMMAND,
        group_id: 123,
        user_id: masterId,
      })
      assert.equal(res.ok, true)
      assert.ok(res.replies.length >= 1)
    })
  }
})

test("help plugin render smoke records fake render output", async () => {
  await withHarness({ plugins: ["help"], protocol: "milky" }, async harness => {
    const res = await harness.emitMessage({
      scene: "group",
      text: HELP_COMMAND,
      group_id: 123,
      user_id: masterId,
    })
    assert.equal(res.ok, true)
    assert.equal(res.renderCalls.length, 1)
    assert.ok(res.replies.length >= 1)
  })
})

test("group plugin handles request and notice simulation without crashing", async () => {
  await withHarness({ plugins: ["group"], protocol: "milky" }, async harness => {
    const requestRes = await harness.emitEvent({
      event: "request.group.add",
      group_id: 123,
      user_id: 10001,
      flag: "group-flag",
      comment: "hello",
    })
    assert.equal(requestRes.ok, true)

    const noticeRes = await harness.emitEvent({
      event: "notice.group.decrease",
      group_id: 123,
      user_id: 10001,
      operator_id: 10002,
    })
    assert.equal(noticeRes.ok, true)
  })
})

test("group recall notice notifies masters after enabling the switch", async () => {
  const groupId = 987654321

  for (const protocol of ["milky", "onebotv11", "icqq"]) {
    await withHarness({ plugins: ["group"], protocol }, async harness => {
      const toggleRes = await harness.emitMessage({
        scene: "group",
        text: "#荨鹿通知设置群撤回开启",
        group_id: groupId,
        user_id: masterId,
      })
      assert.equal(toggleRes.ok, true)

      harness.resetCaptures()

      const recallRes = await harness.emitEvent({
        event: "notice.group.recall",
        group_id: groupId,
        user_id: 10001,
        operator_id: 10002,
      })
      assert.equal(recallRes.ok, true)
      assert.ok(recallRes.replies.length >= 1)
    })
  }
})

test("other plugin smoke covers forward, recall, and scheduled task", async () => {
  for (const protocol of ["milky", "onebotv11", "icqq"]) {
    await withHarness({ plugins: ["other", pixivFixture], protocol }, async harness => {
      const forwardRes = await harness.emitMessage({
        scene: "group",
        text: OTHER_FORWARD_COMMAND,
        group_id: 123,
        user_id: masterId,
      })
      assert.equal(forwardRes.ok, true)
      assert.ok(forwardRes.apiCalls.length >= 1 || forwardRes.replies.length >= 1)

      harness.resetCaptures()

      const recallRes = await harness.emitMessage({
        scene: "group",
        text: OTHER_RECALL_COMMAND,
        group_id: 123,
        user_id: masterId,
      })
      assert.equal(recallRes.ok, true)
      assert.ok(recallRes.apiCalls.some(call => /send/i.test(String(call?.name || ""))))

      const flushRes = await harness.flushTimeouts()
      assert.equal(flushRes.ok, true)
      assert.ok(flushRes.apiCalls.some(call => /recall|delete_msg/i.test(String(call?.name || ""))))

      harness.resetCaptures()

      const taskRes = await harness.runTask({ index: 0, ctxLike: { group_id: 123, user_id: masterId } })
      assert.equal(taskRes.ok, true)
      assert.ok(taskRes.apiCalls.some(call => /send/i.test(String(call?.name || ""))))
    })
  }
})
