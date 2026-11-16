import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { createPluginTestHarness } from "../src/dev/plugin-test-harness.js"
import cfg from "../src/lib/config.js"
import { resetRuntimeContextForTests } from "../src/runtime/runtime-context.js"
import { runDailyPush } from "../src/plugins/yangmao/controllers/handlers.js"
import {
  listEnabledGroups,
  getGroupState,
  markGroupSent,
  resetGroupStateCache,
  setGroupEnabled,
} from "../src/plugins/yangmao/model/group-store.js"
import { buildDigestNodes, buildForwardTitle } from "../src/plugins/yangmao/model/report.js"
import { normalizeOffers, selectDailyDigest } from "../src/plugins/yangmao/model/source.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

const masterId = 1765629830
const originalFetch = globalThis.fetch
const DAY_MS = 24 * 60 * 60 * 1000
const currentYear = new Date().getFullYear()

const PLATFORM_FIXTURE = {
  platforms: [{ id: "acme", name: "Acme AI", type: "lab" }],
}

function isoDaysFromNow(days) {
  return new Date(Date.now() + days * DAY_MS).toISOString()
}

function offerFixture(overrides = {}) {
  const merged = {
    id: "acme-new-user-credit",
    platformId: "acme",
    title: "Acme 注册送 $100 API 额度",
    type: "new",
    status: "active",
    claimMethod: "signup",
    requirements: ["net"],
    modalities: ["text"],
    valueText: "注册即得 $100 免费额度，无需绑卡。",
    usdEstimate: 50,
    usdMax: 100,
    valuation: { period: "monthly" },
    endKind: "date",
    claimEnd: `${currentYear}-12-31`,
    claimStart: null,
    steps: ["打开官网注册。", "创建 API Key；"],
    discoveredAt: isoDaysFromNow(-1),
    updatedAt: isoDaysFromNow(-1),
    evidence: { url: "https://acme.ai/pricing" },
    ...overrides,
  }

  // 未显式指定 updatedAt 时跟随 discoveredAt，避免“更新时间”把老条目误判成新增
  if (overrides.updatedAt === undefined) merged.updatedAt = merged.discoveredAt
  return merged
}

function jsonResponse(payload) {
  return { ok: true, status: 200, json: async () => payload }
}

function stubFetch(offers, platforms = PLATFORM_FIXTURE) {
  const calls = []
  globalThis.fetch = async url => {
    const text = String(url)
    calls.push(text)
    if (text.includes("/api/offers")) return jsonResponse({ count: offers.length, offers })
    if (text.includes("/api/platforms")) return jsonResponse(platforms)
    throw new Error(`unexpected fetch: ${text}`)
  }
  return calls
}

function createIsolatedProjectRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "xunlu-yangmao-"))
  fs.writeFileSync(path.join(root, "package.json"), `${JSON.stringify({ name: "xunlu-core" })}\n`)
  return root
}

async function withIsolatedRoot(fn) {
  const previousCwd = process.cwd()
  const root = createIsolatedProjectRoot()
  process.chdir(root)
  resetRuntimeContextForTests()
  resetGroupStateCache()
  try {
    return await fn(root)
  } finally {
    process.chdir(previousCwd)
    resetRuntimeContextForTests()
    resetGroupStateCache()
    try {
      fs.rmSync(root, { recursive: true, force: true })
    } catch {}
  }
}

test.afterEach(() => {
  globalThis.fetch = originalFetch
})

test("normalizeOffers 复用中文标签并过滤内部条件标记", () => {
  const [item] = normalizeOffers(
    [offerFixture({ requirements: ["net", "member:Business Premium"] })],
    PLATFORM_FIXTURE,
  )

  assert.equal(item.title, "Acme 注册送 $100 API 额度")
  assert.equal(item.platform, "Acme AI")
  assert.equal(item.platformType, "模型厂商")
  assert.equal(item.typeLabel, "注册新人礼")
  assert.equal(item.claimLabel, "注册即送")
  assert.deepEqual(item.requirementLabels, ["需海外网络"])
  assert.equal(item.usdText, "约 $50–$100/月")
  assert.equal(item.deadlineText, "截止 12-31")
  assert.deepEqual(item.steps, ["打开官网注册", "创建 API Key"])
  assert.equal(item.sourceUrl, "https://acme.ai/pricing")
})

test("normalizeOffers 丢弃与标题重复的价值说明", () => {
  const sameText = "Acme 注册送 $100 API 额度"
  const [item] = normalizeOffers(
    [offerFixture({ title: sameText, valueText: sameText })],
    PLATFORM_FIXTURE,
  )
  assert.equal(item.valueText, "")
})

test("selectDailyDigest 只保留可领状态并按新鲜度排序", () => {
  const offers = normalizeOffers(
    [
      offerFixture({ id: "fresh-a", discoveredAt: isoDaysFromNow(-1) }),
      offerFixture({ id: "fresh-b", discoveredAt: isoDaysFromNow(-2) }),
      offerFixture({ id: "ended", status: "ended", discoveredAt: isoDaysFromNow(-1) }),
      offerFixture({ id: "old", discoveredAt: isoDaysFromNow(-40) }),
      offerFixture({
        id: "ending",
        discoveredAt: isoDaysFromNow(-40),
        claimEnd: new Date(Date.now() + 2 * DAY_MS).toISOString().slice(0, 10),
      }),
    ],
    PLATFORM_FIXTURE,
  )

  const digest = selectDailyDigest(offers, { lookbackDays: 3, maxItems: 5, endingSoonDays: 3 })

  assert.equal(digest.fallback, false)
  assert.equal(digest.totalClaimable, 4)
  assert.deepEqual(
    digest.items.map(item => item.id),
    ["fresh-a", "fresh-b"],
  )
  assert.deepEqual(
    digest.ending.map(item => item.id),
    ["ending"],
  )
})

test("selectDailyDigest 在窗口内无新增时退化为最近上架", () => {
  const offers = normalizeOffers(
    [
      offerFixture({ id: "older", discoveredAt: isoDaysFromNow(-30) }),
      offerFixture({ id: "oldest", discoveredAt: isoDaysFromNow(-60) }),
    ],
    PLATFORM_FIXTURE,
  )

  const digest = selectDailyDigest(offers, { lookbackDays: 3, maxItems: 2, endingSoonDays: 0 })

  assert.equal(digest.fallback, true)
  assert.deepEqual(
    digest.items.map(item => item.id),
    ["older", "oldest"],
  )
  assert.deepEqual(digest.ending, [])
})

test("buildDigestNodes 输出摘要 + 每条羊毛 + 说明", () => {
  const digest = selectDailyDigest(normalizeOffers([offerFixture()], PLATFORM_FIXTURE), {
    lookbackDays: 3,
    maxItems: 5,
    endingSoonDays: 3,
  })
  const nodes = buildDigestNodes(digest)

  assert.equal(nodes.length, 3)
  assert.match(buildForwardTitle(), /^AI 羊毛日报 · \d{2}-\d{2}$/)
  assert.match(nodes[0], /当前可领 1 项/)
  assert.match(nodes[1], /1\. Acme 注册送 \$100 API 额度/)
  assert.match(nodes[1], /平台：Acme AI（模型厂商）/)
  assert.match(nodes[1], /期限：截止 12-31/)
  assert.match(nodes[2], /#羊毛开启/)
})

test("群开关默认关闭，开启后进入待推送列表并落盘", async () => {
  await withIsolatedRoot(async root => {
    assert.equal(getGroupState(123).enabled, false)
    assert.deepEqual(listEnabledGroups(), [])

    setGroupEnabled(123, true, { by: 10001 })
    assert.equal(getGroupState("123").enabled, true)
    assert.deepEqual(
      listEnabledGroups().map(item => item.groupId),
      ["123"],
    )

    markGroupSent(123, "2026-11-16")
    assert.equal(getGroupState(123).lastDateKey, "2026-11-16")

    const stored = JSON.parse(fs.readFileSync(path.join(root, "data", "yangmao", "groups.json"), "utf8"))
    assert.equal(stored.groups["123"].enabled, true)
    assert.equal(stored.groups["123"].lastDateKey, "2026-11-16")

    setGroupEnabled(123, false)
    assert.deepEqual(listEnabledGroups(), [])
  })
})

test("离线：#羊毛状态 提示默认关闭，无权限时拒绝开启", async () => {
  await withIsolatedRoot(async () => {
    const harness = await createPluginTestHarness({ plugins: ["yangmao"], protocol: "onebotv11" })
    try {
      const status = await harness.emitMessage({
        scene: "group",
        text: "#羊毛状态",
        group_id: 123,
        user_id: 10001,
      })
      const statusText = status.replies.map(item => item.text).join("\n")
      assert.match(statusText, /未开启（默认关闭）/)
      assert.match(statusText, /每天 12:00/)

      const denied = await harness.emitMessage({
        scene: "group",
        text: "#羊毛开启",
        group_id: 123,
        user_id: 10001,
      })
      assert.match(denied.replies.map(item => item.text).join("\n"), /只有群主\/管理员/)
      assert.equal(getGroupState(123).enabled, false)
    } finally {
      await harness.dispose()
    }
  })
})

test("离线：主人发送 #羊毛开启 后群进入待推送列表", async () => {
  await withIsolatedRoot(async () => {
    cfg.setConfigValue("bot", "masterQQ", [masterId])
    const harness = await createPluginTestHarness({ plugins: ["yangmao"], protocol: "onebotv11" })
    try {
      const run = await harness.emitMessage({
        scene: "group",
        text: "#羊毛开启",
        group_id: 456,
        user_id: masterId,
      })
      assert.match(run.replies.map(item => item.text).join("\n"), /已开启本群羊毛日报推送/)
      assert.equal(getGroupState(456).enabled, true)
    } finally {
      await harness.dispose()
    }
  })
})

test("离线：#羊毛 抓取数据后发送合并转发", async () => {
  await withIsolatedRoot(async () => {
    stubFetch([offerFixture()])
    const harness = await createPluginTestHarness({ plugins: ["yangmao"], protocol: "onebotv11" })
    try {
      const run = await harness.emitMessage({
        scene: "group",
        text: "#羊毛",
        group_id: 123,
        user_id: 10001,
      })

      assert.equal(run.errors.length, 0)
      const forwardCall = run.apiCalls.find(call => /forward/i.test(String(call.name || "")))
      assert.ok(forwardCall, `expected forward api call, got ${JSON.stringify(run.apiCalls.map(c => c.name))}`)

      const payload = JSON.stringify(run.replies)
      assert.match(payload, /AI 羊毛日报/)
      assert.match(payload, /Acme 注册送/)
    } finally {
      await harness.dispose()
    }
  })
})

test("离线：抓取失败时降级为文本提示", async () => {
  await withIsolatedRoot(async () => {
    globalThis.fetch = async () => {
      throw new Error("boom")
    }
    const harness = await createPluginTestHarness({ plugins: ["yangmao"], protocol: "onebotv11" })
    try {
      const run = await harness.emitMessage({
        scene: "group",
        text: "#羊毛",
        group_id: 123,
        user_id: 10001,
      })
      assert.match(run.replies.map(item => item.text).join("\n"), /羊毛数据获取失败/)
    } finally {
      await harness.dispose()
    }
  })
})

function createPushBot(sent, groups = [{ group_id: 456 }]) {
  return {
    getGroupList: async () => new Map(groups.map(item => [item.group_id, item])),
    makeGroupForwardMsg: async (ctx, nodes, title) =>
      nodes.map(node => ({ type: "node", data: { content: node, title } })),
    sendMessage: async (target, content) => {
      sent.push({ target, content })
      return { message_id: 1 }
    },
  }
}

test("定时推送只发给开启的群，且同一天不重复推送", async () => {
  await withIsolatedRoot(async () => {
    stubFetch([offerFixture()])
    setGroupEnabled(456, true, { by: masterId })

    const sent = []
    const bot = createPushBot(sent)

    const first = await runDailyPush(bot, {})
    assert.deepEqual(first, { sent: 1, total: 1 })
    assert.equal(sent.length, 1)
    assert.match(JSON.stringify(sent[0].content), /AI 羊毛日报/)

    const second = await runDailyPush(bot, {})
    assert.equal(second.skipped, "already-sent-today")
    assert.equal(sent.length, 1)
  })
})

test("定时推送在没有任何开启群时直接跳过", async () => {
  await withIsolatedRoot(async () => {
    const calls = stubFetch([offerFixture()])
    const result = await runDailyPush(createPushBot([]), {})

    assert.deepEqual(result, { skipped: "no-group-enabled", sent: 0 })
    assert.deepEqual(calls, [])
  })
})

test("定时推送跳过 bot 已不在的群", async () => {
  await withIsolatedRoot(async () => {
    stubFetch([offerFixture()])
    setGroupEnabled(456, true, { by: masterId })
    setGroupEnabled(789, true, { by: masterId })

    const sent = []
    // bot 当前只在 456 群里；789 已经退群/被踢，不推送但也保留开关
    const result = await runDailyPush(createPushBot(sent, [{ group_id: 456 }]), {})

    assert.equal(result.sent, 1)
    assert.equal(result.total, 1)
    assert.deepEqual(
      sent.map(item => String(item.target.group_id)),
      ["456"],
    )
    assert.equal(getGroupState(789).enabled, true)
  })
})
