import assert from "node:assert/strict"
import test from "node:test"

import { CommandBus } from "../src/Bot/runtime/command-bus.js"
import { __test as repeatMuteStoreTest, getGlobalRepeatMuteEnabled } from "../src/plugins/fudu-ban/model/store.js"
import { __test as helpHandlersTest } from "../src/plugins/help/controllers/handlers.js"
import {
  applyPrefixCompatibilityToEvent,
  buildCommandTextCandidates,
} from "../src/Bot/runtime/prefix-compat.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

test("yunzai alias strips ctx.msg and sets hasAlias when onlyReplyAt=1", async () => {
  const event = {
    isGroup: true,
    group_id: 123,
    msg: "云崽 帮助",
    raw_message: "云崽 帮助",
    atBot: false,
    isMaster: false,
  }

  const result = await applyPrefixCompatibilityToEvent(event, {
    envName: "QQBot-YunZai",
    loadGroupConfig: async () => ({
      onlyReplyAt: 1,
      botAlias: ["云崽"],
    }),
  })

  assert.equal(result.allow, true)
  assert.equal(result.matchedAlias, "云崽")
  assert.equal(event.msg, "帮助")
  assert.equal(event.raw_message, "云崽 帮助")
  assert.equal(event.hasAlias, true)
})

test("yunzai onlyReplyAt=2 blocks non-master messages without alias or at", async () => {
  const event = {
    isGroup: true,
    group_id: 123,
    msg: "帮助",
    raw_message: "帮助",
    atBot: false,
    isMaster: false,
  }

  const result = await applyPrefixCompatibilityToEvent(event, {
    envName: "QQBot-YunZai",
    loadGroupConfig: async () => ({
      onlyReplyAt: 2,
      botAlias: ["云崽"],
    }),
  })

  assert.equal(result.allow, false)
  assert.equal(event.msg, "帮助")
  assert.equal(event.hasAlias, false)
})

test("standalone symbol prefix keeps original ctx.msg for hash-style commands", async () => {
  const event = {
    isGroup: true,
    group_id: 123,
    msg: "#帮助",
    raw_message: "#帮助",
    atBot: false,
    isMaster: false,
  }

  const result = await applyPrefixCompatibilityToEvent(event, {
    envName: "xunlu-core",
    standaloneConfigData: {
      default: {
        prefix_enabled: true,
        botAlias: ["#"],
      },
    },
  })

  assert.equal(result.allow, true)
  assert.equal(result.matchedAlias, "#")
  assert.equal(event.msg, "#帮助")
  assert.equal(event.hasAlias, true)
})

test("buildCommandTextCandidates adds hash fallback for alias-stripped commands", () => {
  const candidates = buildCommandTextCandidates("定时发送 每天 08:00 | 早安", {
    matchedAlias: "云崽",
  })

  assert.deepEqual(candidates, ["定时发送 每天 08:00 | 早安", "#定时发送 每天 08:00 | 早安", "＃定时发送 每天 08:00 | 早安"])
})

test("processNormalCommands matches alias-stripped commands that still require hash", async () => {
  let seenMsg = ""
  const previousLogger = globalThis.logger
  globalThis.logger = {
    debug() {},
    error() {},
  }
  const baseBot = {
    adapter: "onebotv11",
    plugins: {
      "scheduler-1": {
        id: "scheduler-1",
        plugin: "scheduler",
        reg: "^#定时发送",
        event: "message",
        priority: 1000,
        trackUsage: false,
        fnc: async ctx => {
          seenMsg = String(ctx?.msg || "")
          return true
        },
      },
    },
    filtEvent() {
      return true
    },
  }

  const bus = new CommandBus(baseBot)
  const event = {
    post_type: "message",
    isGroup: true,
    group_id: 123,
    msg: "云崽 定时发送 每天 08:00 | 早安",
    raw_message: "云崽 定时发送 每天 08:00 | 早安",
    atBot: false,
    isMaster: false,
  }

  try {
    const result = await bus.processNormalCommands(event, {
      prefixCompat: {
        envName: "QQBot-YunZai",
        loadGroupConfig: async () => ({
          onlyReplyAt: 1,
          botAlias: ["云崽"],
        }),
      },
    })

    assert.equal(result, true)
    assert.equal(seenMsg, "#定时发送 每天 08:00 | 早安")
    assert.equal(event.raw_message, "云崽 定时发送 每天 08:00 | 早安")
  } finally {
    globalThis.logger = previousLogger
  }
})

test("repeat mute defaults to globally disabled", () => {
  const db = repeatMuteStoreTest.createDefaultDb()
  assert.equal(getGlobalRepeatMuteEnabled(db), false)
})

test("help command only allows explicit xunlu prefixes inside Yunzai plugin env", () => {
  assert.equal(
    helpHandlersTest.shouldAllowHelpResponse(
      { raw_message: "帮助", msg: "帮助" },
      { currentEnv: "QQBot-YunZai" },
    ),
    false,
  )
  assert.equal(
    helpHandlersTest.shouldAllowHelpResponse(
      { raw_message: "云崽帮助", msg: "帮助", __xunluOriginalMsg: "云崽帮助" },
      { currentEnv: "QQBot-YunZai" },
    ),
    false,
  )
  assert.equal(
    helpHandlersTest.shouldAllowHelpResponse(
      { raw_message: "荨鹿帮助", msg: "帮助", __xunluOriginalMsg: "荨鹿帮助" },
      { currentEnv: "QQBot-YunZai" },
    ),
    true,
  )
  assert.equal(
    helpHandlersTest.shouldAllowHelpResponse(
      { raw_message: "xunlu帮助", msg: "帮助", __xunluOriginalMsg: "xunlu帮助" },
      { currentEnv: "QQBot-YunZai" },
    ),
    true,
  )
  assert.equal(
    helpHandlersTest.shouldAllowHelpResponse(
      { raw_message: "帮助", msg: "帮助" },
      { currentEnv: "xunlu-core" },
    ),
    true,
  )
})
