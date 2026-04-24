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

function withWritableBotConfig(overrides = {}) {
  const rawGetConfig = cfg.getConfig.bind(cfg)
  const rawGetConfigReader = cfg.getConfigReader.bind(cfg)
  const state = {
    ...(rawGetConfig("bot") || {}),
    ...overrides,
  }

  cfg.getConfig = function patchedGetConfig(name, configType) {
    if (name === "bot") return { ...state }
    return rawGetConfig(name, configType)
  }

  cfg.getConfigReader = function patchedGetConfigReader(name, configType) {
    if (name !== "bot") return rawGetConfigReader(name, configType)
    return {
      set(key, value) {
        state[key] = value
      },
      setData(data = {}) {
        Object.assign(state, data)
      },
    }
  }

  return {
    state,
    restore() {
      cfg.getConfig = rawGetConfig
      cfg.getConfigReader = rawGetConfigReader
    },
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

test("master can toggle global emoji reaction switch via command", async () => {
  const { state, restore } = withWritableBotConfig({
    masterQQ: [20004],
    message_emoji_reaction_enabled: true,
  })

  try {
    await withHarness({ plugins: [otherPlugin], protocol: "onebotv11" }, async harness => {
      const closeRes = await harness.emitMessage({
        scene: "group",
        text: "#贴表情关闭",
        group_id: 123,
        user_id: 20004,
      })

      assert.equal(closeRes.ok, true)
      assert.match(closeRes.replies[0]?.text || "", /已关闭全局贴表情/)
      assert.equal(state.message_emoji_reaction_enabled, false)

      const messageRes = await harness.emitMessage({
        scene: "group",
        text: "哈哈😂",
        group_id: 123,
        user_id: 20005,
      })

      assert.equal(messageRes.ok, true)
      assert.ok(
        !messageRes.apiCalls.some(call => /set_msg_emoji_like/i.test(String(call?.name || ""))),
        "did not expect auto emoji reaction after command disabled it",
      )

      const openRes = await harness.emitMessage({
        scene: "group",
        text: "#贴表情开启",
        group_id: 123,
        user_id: 20004,
      })

      assert.equal(openRes.ok, true)
      assert.match(openRes.replies[0]?.text || "", /已开启全局贴表情/)
      assert.equal(state.message_emoji_reaction_enabled, true)
    })
  } finally {
    restore()
  }
})

test("non-master cannot toggle global emoji reaction switch", async () => {
  const { state, restore } = withWritableBotConfig({
    masterQQ: [29999],
    message_emoji_reaction_enabled: true,
  })

  try {
    await withHarness({ plugins: [otherPlugin], protocol: "onebotv11" }, async harness => {
      const res = await harness.emitMessage({
        scene: "group",
        text: "#贴表情关闭",
        group_id: 123,
        user_id: 20006,
      })

      assert.equal(res.ok, true)
      assert.match(res.replies[0]?.text || "", /只有主人才能设置全局贴表情开关/)
      assert.equal(state.message_emoji_reaction_enabled, true)
    })
  } finally {
    restore()
  }
})
