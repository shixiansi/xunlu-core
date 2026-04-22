import assert from "node:assert/strict"
import path from "node:path"
import { Readable } from "node:stream"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

import axios from "axios"

import {
  __resetYunzaiCommandBridgeStateForTests,
  invokeYunzaiCommandByText,
  listYunzaiCommandsForAi,
} from "../src/Bot/yunzai/command-bridge.js"
import { renderUniversalSegments, UniversalMessageSegment } from "../src/Bot/message/index.js"
import { createPluginTestHarness } from "../src/dev/plugin-test-harness.js"
import { __resetAiDispatchSessionsForTests } from "../src/plugins/ai-dispatch/controllers/handlers.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

const MASTER_ID = 1765629830
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const fixturePlugin = path.resolve(__dirname, "fixtures", "plugins", "harness-fixture", "index.js")
const realStatusPluginPath = path.resolve(__dirname, "..", "..", "system", "status.js")

function createSseResponse(payload) {
  const text = JSON.stringify(payload)
  const chunks = [
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
    "data: [DONE]\n\n",
  ]
  return { data: Readable.from(chunks) }
}

function createSseTextResponse(text) {
  const chunks = [
    `data: ${JSON.stringify({ choices: [{ delta: { content: String(text || "") } }] })}\n\n`,
    "data: [DONE]\n\n",
  ]
  return { data: Readable.from(chunks) }
}

function createInvalidDecisionResponse() {
  return {
    data: Readable.from([
      'data: {"choices":[{"delta":{"content":"not-json"}}]}\n\n',
      "data: [DONE]\n\n",
    ]),
  }
}

function useAxiosMock(handler) {
  const originalPost = axios.post
  axios.post = async (url, body, options) => await handler({ url, body, options })
  return () => {
    axios.post = originalPost
  }
}

function renderMessageLike(message) {
  if (typeof message === "string") return message
  if (Array.isArray(message)) return renderUniversalSegments(message)
  if (message && typeof message === "object" && Array.isArray(message.message)) {
    return renderUniversalSegments(message.message)
  }
  return String(message ?? "")
}

function createMockYunzaiLoader(options = {}) {
  class MockYunzaiPlugin {
    constructor(e) {
      this.e = e
      this.name = "mock-yunzai"
      this.dsc = "mock yunzai plugin"
      this.priority = 900
      this.rule = [
        {
          reg: "^#云崽图$",
          fnc: "renderImage",
          event: "message.group.normal",
          desc: "返回云崽图片",
          priority: 900,
          example: "#云崽图",
        },
        {
          reg: "^帮助$",
          fnc: "conflictHelp",
          event: "message.group.normal",
          desc: "与 xunlu 帮助命令冲突",
          priority: 901,
          example: "帮助",
        },
        {
          reg: "^#*([^#]+)\\u9762\\u677f$",
          fnc: "showPanel",
          event: "message.group.normal",
          desc: "查看角色面板",
          priority: 902,
          example: "少女面板",
        },
        {
          reg: "^#*([^#]+)\\u9762\\u677f$",
          fnc: "showPanel",
          event: "message.group.normal",
          desc: "查看角色面板",
          priority: 903,
          example: "雷神面板",
        },
      ]
    }

    async renderImage(e) {
      return await e.reply([
        UniversalMessageSegment.image({
          url: "https://mock.yunzai/image.png",
          summary: "[mock yunzai image]",
        }),
      ])
    }

    async conflictHelp(e) {
      return await e.reply("yunzai-help")
    }

    async showPanel(e) {
      const role = String(e?.msg || "").replace(/\u9762\u677f$/u, "").trim()
      return await e.reply(`panel:${role}|panel-match:${Number(role === "\u5c11\u5973")}`)
    }
  }

  const extraPriorityEntries = Array.isArray(options?.extraPriorityEntries) ? options.extraPriorityEntries : []

  return {
    priority: [{ name: "mock-yunzai", priority: 900, class: MockYunzaiPlugin }, ...extraPriorityEntries],
    async load() {
      return true
    },
    checkGuildMsg() {
      return false
    },
    checkLimit(event) {
      if (typeof options?.checkLimit === "function") return options.checkLimit(event)
      return true
    },
    dealMsg(event) {
      event.msg = String(event?.raw_message || event?.msg || "").trim()
      event.isGroup = Boolean(event?.group_id)
      event.isPrivate = !event?.group_id
      return event
    },
    checkBlack() {
      return true
    },
    reply() {
      return true
    },
    checkDisable() {
      return true
    },
    filtEvent(event, target) {
      const eventName = String(target?.event || "").trim().toLowerCase()
      if (!eventName) return true
      return eventName.startsWith("message")
    },
    onlyReplyAt() {
      return true
    },
    filtPermission() {
      return true
    },
    setLimit() {
      return true
    },
  }
}

function useMockYunzaiBridge(options = {}) {
  const originalBridge = globalThis.__xunluYunzaiCommandBridge
  globalThis.__xunluYunzaiCommandBridge = {
    PluginsLoader: createMockYunzaiLoader(options),
    Runtime: {
      async init() {
        return true
      },
    },
  }
  __resetYunzaiCommandBridgeStateForTests()
  return () => {
    if (originalBridge === undefined) delete globalThis.__xunluYunzaiCommandBridge
    else globalThis.__xunluYunzaiCommandBridge = originalBridge
    __resetYunzaiCommandBridgeStateForTests()
  }
}

function createMemoryRedis() {
  const store = new Map()
  return {
    async get(key) {
      return store.has(key) ? store.get(key) : 0
    },
    async set(key, value) {
      store.set(key, String(value))
      return "OK"
    },
    async incr(key) {
      const next = Number(store.get(key) || 0) + 1
      store.set(key, String(next))
      return next
    },
    async expire() {
      return 1
    },
  }
}

async function useRealStatusYunzaiBridge() {
  const originalBridge = globalThis.__xunluYunzaiCommandBridge
  const originalPlugin = globalThis.plugin
  const originalRedis = globalThis.redis

  globalThis.plugin = class MockYunzaiPluginBase {
    constructor(options = {}) {
      Object.assign(this, options)
    }

    reply(msg = "", quote = false, data = {}) {
      if (!this.e?.reply || !msg) return false
      return this.e.reply(msg, quote, data)
    }

    getContext() {
      return {}
    }
  }
  globalThis.redis = createMemoryRedis()

  const statusModule = await import(`${pathToFileURL(realStatusPluginPath).href}?test=${Date.now()}`)
  const StatusPlugin = statusModule?.status || statusModule?.default
  assert.equal(typeof StatusPlugin, "function")

  let loadCount = 0
  const pluginEntries = [{ name: "其它功能", priority: 5000, class: StatusPlugin }]
  const loader = {
    priority: [],
    async load() {
      loadCount += 1
      this.priority = [...pluginEntries]
      return true
    },
    checkGuildMsg() {
      return false
    },
    checkLimit() {
      return true
    },
    dealMsg(event) {
      event.msg = String(event?.raw_message || event?.msg || "").trim()
      event.isGroup = Boolean(event?.group_id)
      event.isPrivate = !event?.group_id
      event.sender =
        event.sender && typeof event.sender === "object"
          ? event.sender
          : { user_id: event.user_id, nickname: "tester", card: "tester" }
      return event
    },
    checkBlack() {
      return true
    },
    reply() {
      return true
    },
    checkDisable() {
      return true
    },
    filtEvent(event, target) {
      const eventName = String(target?.event || "").trim().toLowerCase()
      if (!eventName) return true
      return eventName.startsWith("message")
    },
    onlyReplyAt() {
      return true
    },
    filtPermission() {
      return true
    },
    setLimit() {
      return true
    },
  }

  globalThis.__xunluYunzaiCommandBridge = {
    PluginsLoader: loader,
    Runtime: {
      async init() {
        return true
      },
    },
  }
  __resetYunzaiCommandBridgeStateForTests()

  return {
    getLoadCount: () => loadCount,
    restore() {
      if (originalBridge === undefined) delete globalThis.__xunluYunzaiCommandBridge
      else globalThis.__xunluYunzaiCommandBridge = originalBridge
      if (originalPlugin === undefined) delete globalThis.plugin
      else globalThis.plugin = originalPlugin
      if (originalRedis === undefined) delete globalThis.redis
      else globalThis.redis = originalRedis
      __resetYunzaiCommandBridgeStateForTests()
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

test.beforeEach(() => {
  process.env.SILICONFLOW_API_KEY = "test-siliconflow-key"
  __resetAiDispatchSessionsForTests()
  __resetYunzaiCommandBridgeStateForTests()
})

test.afterEach(() => {
  delete process.env.SILICONFLOW_API_KEY
  delete globalThis.__xunluYunzaiCommandBridge
  delete globalThis.plugin
  delete globalThis.redis
  __resetAiDispatchSessionsForTests()
  __resetYunzaiCommandBridgeStateForTests()
})

test("ai-dispatch turns natural language into a real plugin command and sends the rendered image", async () => {
  const restore = useAxiosMock(async () =>
    createSseResponse({
      type: "command",
      command: "帮助",
      confidence: 0.99,
      reason_code: "help",
    }),
  )

  try {
    await withHarness({ plugins: ["help", "ai-dispatch"], protocol: "milky" }, async harness => {
      const res = await harness.emitMessage({
        scene: "group",
        text: "xunlu 帮我看看都有什么功能",
        group_id: 123,
        user_id: MASTER_ID,
      })

      assert.equal(res.ok, true)
      assert.equal(res.renderCalls.length, 1)
      assert.ok(res.replies.some(item => /\[image:/i.test(item?.text || "")))
    })
  } finally {
    restore()
  }
})

test("ai-dispatch keeps renderImg working when the incoming ctx carries an unbound renderImg method", async () => {
  const restore = useAxiosMock(async () =>
    createSseResponse({
      type: "command",
      command: "fixture render",
      confidence: 0.99,
      reason_code: "fixture_render",
    }),
  )

  try {
    await withHarness({ plugins: [fixturePlugin, "ai-dispatch"], protocol: "milky" }, async harness => {
      harness.runtimeBot.renderImg = harness.bot.renderImg

      const res = await harness.emitMessage({
        scene: "group",
        text: "xunlu 帮我渲染一个 fixture",
        group_id: 123,
        user_id: MASTER_ID,
      })

      assert.equal(res.ok, true)
      assert.ok(res.replies.some(item => /\[image:/i.test(item?.text || "")))
    })
  } finally {
    restore()
  }
})

test("ai-dispatch replies with the Atri persona for non-command chat in private", async () => {
  const restore = useAxiosMock(async ({ body }) => {
    if (body?.response_format?.type === "json_object") {
      return createSseResponse({
        type: "non_command",
        reply: "占位回复",
        confidence: 0.71,
        reason_code: "chat",
      })
    }
    return createSseTextResponse("（棕色的长发轻轻晃了晃）夏生先生，亚托莉在这里。哼哼，我可是高性能的！")
  })

  try {
    await withHarness({ plugins: ["ai-dispatch"], protocol: "milky" }, async harness => {
      const res = await harness.emitMessage({
        scene: "private",
        text: "你好",
        user_id: MASTER_ID,
      })

      assert.equal(res.ok, true)
      assert.match(res.replies[0]?.text || "", /夏生先生|亚托莉|高性能/)
    })
  } finally {
    restore()
  }
})

test("ai-dispatch still executes parameterized yunzai commands when the model misclassifies them as non-command", async () => {
  const restoreAxios = useAxiosMock(async () =>
    createSseResponse({
      type: "non_command",
      reply: "占位回复",
      confidence: 0.66,
      reason_code: "chat_misclassified",
    }),
  )
  const restoreBridge = useMockYunzaiBridge()

  try {
    await withHarness({ plugins: ["ai-dispatch"], protocol: "milky" }, async harness => {
      const res = await harness.emitMessage({
        scene: "group",
        text: "xunlu 我要看少女面板",
        group_id: 123,
        user_id: MASTER_ID,
      })

      assert.equal(res.ok, true)
      assert.ok(res.replies.some(item => /panel-match:1/.test(item?.text || "")))
      assert.equal(res.replies.some(item => /亚托莉|夏生先生/.test(item?.text || "")), false)
    })
  } finally {
    restoreBridge()
    restoreAxios()
  }
})

test("ai-dispatch bypasses yunzai synthetic cooldown checks for inferred commands", async () => {
  let checkLimitCalls = 0
  const restoreBridge = useMockYunzaiBridge({
    checkLimit() {
      checkLimitCalls += 1
      return false
    },
  })

  try {
    await withHarness({ plugins: ["ai-dispatch"], protocol: "milky" }, async harness => {
      const res = await harness.emitMessage({
        scene: "group",
        text: "xunlu 我要看少女面板",
        group_id: 123,
        user_id: MASTER_ID,
      })

      assert.equal(res.ok, true)
      assert.ok(res.replies.some(item => /panel-match:1/.test(item?.text || "")))
      assert.equal(checkLimitCalls, 0)
    })
  } finally {
    restoreBridge()
  }
})

test("ai-dispatch strips simple 看-prefix before invoking雷神 panel commands", async () => {
  const restoreBridge = useMockYunzaiBridge()

  try {
    await withHarness({ plugins: ["ai-dispatch"], protocol: "milky" }, async harness => {
      const res = await harness.emitMessage({
        scene: "group",
        text: "xunlu 看雷神面板",
        group_id: 123,
        user_id: MASTER_ID,
      })

      assert.equal(res.ok, true)
      assert.ok(res.replies.some(item => /panel:雷神\|panel-match:0/.test(item?.text || "")))
      assert.equal(res.replies.some(item => /执行失败|亚托莉|夏生先生/.test(item?.text || "")), false)
    })
  } finally {
    restoreBridge()
  }
})

test("ai-dispatch retries yunzai panel commands with a normalized candidate after no-match", async () => {
  const restoreAxios = useAxiosMock(async () =>
    createSseResponse({
      type: "command",
      command: "看雷神面板",
      source: "yunzai",
      plugin: "mock-wrong-gacha",
      confidence: 0.93,
      reason_code: "panel_with_prefix",
    }),
  )
  const restoreBridge = useMockYunzaiBridge()

  try {
    await withHarness({ plugins: ["ai-dispatch"], protocol: "milky" }, async harness => {
      const res = await harness.emitMessage({
        scene: "group",
        text: "xunlu 看雷神面板",
        group_id: 123,
        user_id: MASTER_ID,
      })

      assert.equal(res.ok, true)
      assert.ok(res.replies.some(item => /panel:雷神\|panel-match:0/.test(item?.text || "")))
      assert.equal(res.replies.some(item => /执行失败/.test(item?.text || "")), false)
    })
  } finally {
    restoreBridge()
    restoreAxios()
  }
})

test("ai-dispatch retries a no-match yunzai command against alternative plugins and recovers ten-pull commands", async () => {
  class MockCatchAllPlugin {
    constructor(e) {
      this.e = e
      this.name = "mock-catchall"
      this.dsc = "catchall"
      this.priority = 50000
      this.rule = [
        {
          reg: "(.*)",
          fnc: "consume",
          event: "message.group.normal",
          desc: "catchall",
          priority: 50000,
          example: "<参数>",
        },
      ]
    }

    async consume() {
      return false
    }
  }

  class MockWrongGachaPlugin {
    constructor(e) {
      this.e = e
      this.name = "mock-wrong-gacha"
      this.dsc = "wrong ten-pull"
      this.priority = 150
      this.rule = [
        {
          reg: "^#*(\\u6765\\u4e2a)?(10|\\u5341)\\u8fde$",
          fnc: "tenPull",
          event: "message.group.normal",
          desc: "\u5341\u8fde",
          priority: 150,
          example: "\u6765\u4e2a\u5341\u8fde",
        },
      ]
    }

    async tenPull() {
      return false
    }
  }

  class MockGachaPlugin {
    constructor(e) {
      this.e = e
      this.name = "mock-gacha"
      this.dsc = "ten-pull"
      this.priority = 100
      this.rule = [
        {
          reg: "^#*(10|\\u5341)\\u8fde$",
          fnc: "tenPull",
          event: "message.group.normal",
          desc: "十连",
          priority: 100,
          example: "\u5341\u8fde",
        },
      ]
    }

    async tenPull(e) {
      return await e.reply("gacha:\u5341\u8fde")
    }
  }

  const restoreAxios = useAxiosMock(async () =>
    createSseResponse({
      type: "command",
      command: "\u6765\u4e2a\u5341\u8fde",
      source: "yunzai",
      plugin: "mock-wrong-gacha",
      confidence: 0.94,
      reason_code: "ten_pull_retry",
    }),
  )
  const restoreBridge = useMockYunzaiBridge({
    extraPriorityEntries: [
      { name: "mock-gacha", priority: 100, class: MockGachaPlugin },
      { name: "mock-wrong-gacha", priority: 150, class: MockWrongGachaPlugin },
    ],
  })

  try {
    await withHarness({ plugins: ["ai-dispatch"], protocol: "milky" }, async harness => {
      const res = await harness.emitMessage({
        scene: "group",
        text: "xunlu 今天下班之前我突然特别特别想顺手来个十连试试看今天的运气到底怎么样",
        group_id: 123,
        user_id: MASTER_ID,
      })

      assert.equal(res.ok, true)
      assert.ok(res.replies.some(item => /gacha:/.test(item?.text || "")))
      assert.equal(res.replies.some(item => /执行失败/.test(item?.text || "")), false)
    })
  } finally {
    restoreBridge()
    restoreAxios()
  }
})

test("ai-dispatch normalizes possessive panel phrasing like 可莉的面板", async () => {
  const restoreAxios = useAxiosMock(async () =>
    createSseResponse({
      type: "command",
      command: "可莉的面板",
      source: "yunzai",
      plugin: "mock-yunzai",
      confidence: 0.93,
      reason_code: "panel_possessive",
    }),
  )
  const restoreBridge = useMockYunzaiBridge()

  try {
    await withHarness({ plugins: ["ai-dispatch"], protocol: "milky" }, async harness => {
      const res = await harness.emitMessage({
        scene: "group",
        text: "xunlu 我要看可莉的面板",
        group_id: 123,
        user_id: MASTER_ID,
      })

      assert.equal(res.ok, true)
      assert.ok(res.replies.some(item => /panel:可莉\|panel-match:0/.test(item?.text || "")))
      assert.equal(res.replies.some(item => /执行失败/.test(item?.text || "")), false)
    })
  } finally {
    restoreBridge()
    restoreAxios()
  }
})

test("ai-dispatch strips 发个-prefix and 的-suffix before invoking yunzai panel commands", async () => {
  const restoreAxios = useAxiosMock(async () =>
    createSseResponse({
      type: "command",
      command: "发个可莉的面板",
      source: "yunzai",
      plugin: "mock-yunzai",
      confidence: 0.94,
      reason_code: "panel_send_prefix",
    }),
  )
  const restoreBridge = useMockYunzaiBridge()

  try {
    await withHarness({ plugins: ["ai-dispatch"], protocol: "milky" }, async harness => {
      const res = await harness.emitMessage({
        scene: "group",
        text: "xunlu 发个可莉的面板",
        group_id: 123,
        user_id: MASTER_ID,
      })

      assert.equal(res.ok, true)
      assert.ok(res.replies.some(item => /panel:可莉\|panel-match:0/.test(item?.text || "")))
      assert.equal(res.replies.some(item => /执行失败/.test(item?.text || "")), false)
    })
  } finally {
    restoreBridge()
    restoreAxios()
  }
})

test("ai-dispatch keeps clarify context scoped to the same group and user", async () => {
  let requestCount = 0
  const restore = useAxiosMock(async () => {
    requestCount += 1
    if (requestCount === 1) {
      return createSseResponse({
        type: "clarify",
        question: "你想查看哪个插件的帮助？",
        confidence: 0.42,
        reason_code: "missing_plugin",
      })
    }
    return createSseResponse({
      type: "command",
      command: "帮助",
      confidence: 0.94,
      reason_code: "help_followup",
    })
  })

  try {
    await withHarness({ plugins: ["help", "ai-dispatch"], protocol: "milky" }, async harness => {
      const first = await harness.emitMessage({
        scene: "group",
        text: "xunlu 帮我看看",
        group_id: 123,
        user_id: MASTER_ID,
      })
      assert.equal(first.ok, true)
      assert.match(first.replies[0]?.text || "", /哪个插件/)

      const isolated = await harness.emitMessage({
        scene: "group",
        text: "help",
        group_id: 999,
        user_id: MASTER_ID,
      })
      assert.equal(isolated.ok, true)
      assert.equal(isolated.replies.length, 0)

      const second = await harness.emitMessage({
        scene: "group",
        text: "help",
        group_id: 123,
        user_id: MASTER_ID,
      })
      assert.equal(second.ok, true)
      assert.equal(second.renderCalls.length, 1)
    })
  } finally {
    restore()
  }
})

test("ai-dispatch forces clarify for incomplete high-risk commands", async () => {
  const restore = useAxiosMock(async () =>
    createSseResponse({
      type: "command",
      command: "#修改头衔",
      confidence: 0.83,
      reason_code: "high_risk_guess",
    }),
  )

  try {
    await withHarness({ plugins: ["group", "ai-dispatch"], protocol: "milky" }, async harness => {
      const res = await harness.emitMessage({
        scene: "group",
        text: "xunlu 帮我改个头衔",
        group_id: 123,
        user_id: MASTER_ID,
      })

      assert.equal(res.ok, true)
      assert.match(res.replies[0]?.text || "", /头衔/)
      assert.equal(res.apiCalls.some(call => /set_group_special_title/i.test(String(call?.name || ""))), false)
    })
  } finally {
    restore()
  }
})

test("ai-dispatch falls back to the Atri persona when the model returns invalid JSON", async () => {
  const restore = useAxiosMock(async ({ body }) => {
    if (body?.response_format?.type === "json_object") {
      return createInvalidDecisionResponse()
    }
    return createSseTextResponse("（红褐色的眼睛轻轻亮了一下）夏生先生，学习完毕。已录入数据库。")
  })

  try {
    await withHarness({ plugins: ["ai-dispatch"], protocol: "milky" }, async harness => {
      const res = await harness.emitMessage({
        scene: "private",
        text: "你好",
        user_id: MASTER_ID,
      })

      assert.equal(res.ok, true)
      assert.match(res.replies[0]?.text || "", /夏生先生|学习完毕|亚托莉/)
    })
  } finally {
    restore()
  }
})

test("ai-dispatch uses the local Atri unavailable reply when upstream transport fails", async () => {
  let callCount = 0
  const restore = useAxiosMock(async () => {
    callCount += 1
    const error = new Error("request timed out")
    error.code = "ECONNABORTED"
    throw error
  })

  try {
    await withHarness({ plugins: ["ai-dispatch"], protocol: "milky" }, async harness => {
      const res = await harness.emitMessage({
        scene: "private",
        text: "你好",
        user_id: MASTER_ID,
      })

      assert.equal(res.ok, true)
      assert.equal(callCount, 2)
      assert.match(res.replies[0]?.text || "", /夏生先生|亚托莉|连接/)
    })
  } finally {
    restore()
  }
})

test("ai-dispatch falls back to the Atri persona for low-risk unmatched commands", async () => {
  const restore = useAxiosMock(async ({ body }) => {
    if (body?.response_format?.type === "json_object") {
      return createSseResponse({
        type: "command",
        command: "普通不存在的命令",
        confidence: 0.64,
        reason_code: "low_risk_guess",
      })
    }
    return createSseTextResponse("（发带轻轻晃了一下）夏生先生，请不要小看亚托莉！这个说法亚托莉还想再学一学。")
  })

  try {
    await withHarness({ plugins: ["ai-dispatch"], protocol: "milky" }, async harness => {
      const res = await harness.emitMessage({
        scene: "private",
        text: "帮我做个普通不存在的事",
        user_id: MASTER_ID,
      })

      assert.equal(res.ok, true)
      assert.match(res.replies[0]?.text || "", /夏生先生|亚托莉/)
    })
  } finally {
    restore()
  }
})

test("ai-dispatch keeps command execution failures in tool-style replies", async () => {
  const restore = useAxiosMock(async () =>
    createSseResponse({
      type: "command",
      command: "fixture crash",
      confidence: 0.95,
      reason_code: "fixture_crash",
    }),
  )

  try {
    await withHarness({ plugins: [fixturePlugin, "ai-dispatch"], protocol: "milky" }, async harness => {
      const res = await harness.emitMessage({
        scene: "private",
        text: "帮我执行 fixture crash",
        user_id: MASTER_ID,
      })

      assert.equal(res.ok, true)
      assert.match(res.replies[0]?.text || "", /执行失败|fixture crash/)
      assert.doesNotMatch(res.replies[0]?.text || "", /夏生先生|亚托莉/)
    })
  } finally {
    restore()
  }
})

test("ai-dispatch can execute learning_chat commands that require @bot mention", async () => {
  const restore = useAxiosMock(async () =>
    createSseResponse({
      type: "command",
      command: "@bot 开启主动发言",
      confidence: 0.95,
      reason_code: "learning_chat",
    }),
  )

  try {
    await withHarness({ plugins: ["learning_chat", "ai-dispatch"], protocol: "milky" }, async harness => {
      const res = await harness.emitMessage({
        scene: "group",
        text: "xunlu 帮我开启主动发言",
        group_id: 123,
        user_id: MASTER_ID,
      })

      assert.equal(res.ok, true)
      assert.ok(res.replies.some(item => /主动发言/.test(item?.text || "")))
    })
  } finally {
    restore()
  }
})

test("ai-dispatch can execute yunzai commands without wrapping them in 调用", async () => {
  const restoreAxios = useAxiosMock(async () =>
    createSseResponse({
      type: "command",
      command: "#云崽图",
      confidence: 0.97,
      reason_code: "yunzai_image",
    }),
  )
  const restoreBridge = useMockYunzaiBridge()

  try {
    await withHarness({ plugins: ["ai-dispatch"], protocol: "milky" }, async harness => {
      const res = await harness.emitMessage({
        scene: "group",
        text: "xunlu 给我来张云崽图",
        group_id: 123,
        user_id: MASTER_ID,
      })

      assert.equal(res.ok, true)
      assert.equal(res.renderCalls.length, 0)
      assert.ok(res.replies.some(item => /\[image:/i.test(item?.text || "")))
    })
  } finally {
    restoreBridge()
    restoreAxios()
  }
})

test("ai-dispatch honors explicit yunzai source selection", async () => {
  const restoreAxios = useAxiosMock(async () =>
    createSseResponse({
      type: "command",
      command: "#云崽图",
      source: "yunzai",
      plugin: "mock-yunzai",
      confidence: 0.96,
      reason_code: "yunzai_source",
    }),
  )
  const restoreBridge = useMockYunzaiBridge()

  try {
    await withHarness({ plugins: ["ai-dispatch"], protocol: "milky" }, async harness => {
      const res = await harness.emitMessage({
        scene: "group",
        text: "xunlu 用云崽那边的图命令",
        group_id: 123,
        user_id: MASTER_ID,
      })

      assert.equal(res.ok, true)
      assert.ok(res.replies.some(item => /\[image:/i.test(item?.text || "")))
    })
  } finally {
    restoreBridge()
    restoreAxios()
  }
})

test("ai-dispatch prefers xunlu commands when example text conflicts with yunzai", async () => {
  const restoreAxios = useAxiosMock(async () =>
    createSseResponse({
      type: "command",
      command: "帮助",
      confidence: 0.98,
      reason_code: "conflict_default",
    }),
  )
  const restoreBridge = useMockYunzaiBridge()

  try {
    await withHarness({ plugins: ["help", "ai-dispatch"], protocol: "milky" }, async harness => {
      const res = await harness.emitMessage({
        scene: "group",
        text: "xunlu 帮助",
        group_id: 123,
        user_id: MASTER_ID,
      })

      assert.equal(res.ok, true)
      assert.equal(res.renderCalls.length, 1)
      assert.ok(res.replies.some(item => /\[image:/i.test(item?.text || "")))
      assert.equal(res.replies.some(item => /yunzai-help/.test(item?.text || "")), false)
    })
  } finally {
    restoreBridge()
    restoreAxios()
  }
})

test("listYunzaiCommandsForAi enumerates a real yunzai plugin class and caches the catalog", async () => {
  const bridge = await useRealStatusYunzaiBridge()

  try {
    const first = await listYunzaiCommandsForAi({ ctx: { group_id: 123, user_id: MASTER_ID } })
    const second = await listYunzaiCommandsForAi({ ctx: { group_id: 123, user_id: MASTER_ID } })

    assert.ok(first.some(item => /#状态/.test(item.example)))
    assert.equal(second.length, first.length)
    assert.equal(bridge.getLoadCount(), 1)
  } finally {
    bridge.restore()
  }
})

test("listYunzaiCommandsForAi excludes obvious catch-all listener rules from the AI catalog", async () => {
  class MockCatchAllPlugin {
    constructor(e) {
      this.e = e
      this.name = "mock-catchall"
      this.dsc = "catchall"
      this.priority = 50000
      this.rule = [
        {
          reg: "(.*)",
          fnc: "consume",
          event: "message.group.normal",
          desc: "catchall",
          priority: 50000,
        },
      ]
    }
  }

  const restoreBridge = useMockYunzaiBridge({
    extraPriorityEntries: [{ name: "mock-catchall", priority: 50000, class: MockCatchAllPlugin }],
  })

  try {
    const commands = await listYunzaiCommandsForAi({
      ctx: { group_id: 123, user_id: MASTER_ID, self_id: 10000 },
    })

    assert.equal(commands.some(item => item.plugin === "mock-catchall"), false)
  } finally {
    restoreBridge()
  }
})

test("invokeYunzaiCommandByText can execute a real yunzai plugin class", async () => {
  const bridge = await useRealStatusYunzaiBridge()
  const replies = []

  try {
    const result = await invokeYunzaiCommandByText("#状态", {
      group_id: 123,
      user_id: MASTER_ID,
      sender: { user_id: MASTER_ID, nickname: "tester", card: "tester" },
      async reply(message) {
        replies.push(renderMessageLike(message))
        return true
      },
    })

    assert.equal(result.ok, true)
    assert.ok(replies.some(item => /状态|发送消息/.test(item)))
  } finally {
    bridge.restore()
  }
})

test("ai-dispatch can end-to-end invoke a real yunzai command when no xunlu command conflicts", async () => {
  const bridge = await useRealStatusYunzaiBridge()
  const restoreAxios = useAxiosMock(async () =>
    createSseResponse({
      type: "command",
      command: "#状态",
      source: "yunzai",
      confidence: 0.98,
      reason_code: "real_yunzai_status",
    }),
  )

  try {
    await withHarness({ plugins: ["ai-dispatch"], protocol: "milky" }, async harness => {
      const res = await harness.emitMessage({
        scene: "group",
        text: "xunlu 看看云崽状态",
        group_id: 123,
        user_id: MASTER_ID,
      })

      assert.equal(res.ok, true)
      assert.ok(res.replies.some(item => /状态|发送消息/.test(item?.text || "")))
    })
  } finally {
    restoreAxios()
    bridge.restore()
  }
})
