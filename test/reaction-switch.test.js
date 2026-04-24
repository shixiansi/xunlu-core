import path from "node:path"
import assert from "node:assert/strict"
import test from "node:test"
import { fileURLToPath } from "node:url"

import cfg from "../src/lib/config.js"
import { createPluginTestHarness } from "../src/dev/plugin-test-harness.js"
import { setUserReactionConfig } from "../src/plugins/other/model/reaction-store.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")
const otherPlugin = path.resolve(repoRoot, "src", "plugins", "other", "index.js")

installTestRuntime(test)

function withBotConfigOverride(overrides = {}) {
  const rawGetConfig = cfg.getConfig.bind(cfg)
  cfg.getConfig = function patchedGetConfig(name, configType) {
    const value = rawGetConfig(name, configType)
    if (name !== "bot") return value
    return {
      ...(value || {}),
      ...overrides,
    }
  }
  return () => {
    cfg.getConfig = rawGetConfig
  }
}

async function withHarness(options, fn) {
  const harness = await createPluginTestHarness(options)
  try {
    return await fn(harness)
  } finally {
    await harness.dispose()
  }
}

test("message emoji reactions follow message content by default", async () => {
  await withHarness({ plugins: [otherPlugin], protocol: "onebotv11" }, async harness => {
    const res = await harness.emitMessage({
      scene: "group",
      text: "哈哈😂",
      group_id: 123,
      user_id: 20001,
    })

    assert.equal(res.ok, true)
    assert.ok(
      res.apiCalls.some(call => /set_msg_emoji_like/i.test(String(call?.name || ""))),
      "expected auto emoji reaction API call",
    )
  })
})

test("message emoji reaction switch disables content-driven auto reactions", async () => {
  const restore = withBotConfigOverride({ message_emoji_reaction_enabled: false })
  try {
    await withHarness({ plugins: [otherPlugin], protocol: "onebotv11" }, async harness => {
      const res = await harness.emitMessage({
        scene: "group",
        text: "哈哈😂",
        group_id: 123,
        user_id: 20002,
      })

      assert.equal(res.ok, true)
      assert.ok(
        !res.apiCalls.some(call => /set_msg_emoji_like/i.test(String(call?.name || ""))),
        "did not expect content-driven emoji reaction API call",
      )
    })
  } finally {
    restore()
  }
})

test("message emoji reaction switch does not disable user default reactions", async () => {
  const restore = withBotConfigOverride({ message_emoji_reaction_enabled: false })
  try {
    setUserReactionConfig(20003, { enabled: true, reactions: [277] })
    await withHarness({ plugins: [otherPlugin], protocol: "onebotv11" }, async harness => {
      const res = await harness.emitMessage({
        scene: "group",
        text: "没有表情",
        group_id: 123,
        user_id: 20003,
      })

      assert.equal(res.ok, true)
      assert.ok(
        res.apiCalls.some(call => /set_msg_emoji_like/i.test(String(call?.name || ""))),
        "expected user default reaction API call",
      )
    })
  } finally {
    restore()
  }
})
