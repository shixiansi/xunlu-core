import assert from "node:assert/strict"
import fs from "node:fs"
import { Readable } from "node:stream"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import axios from "axios"

import { main as runXunluDev } from "../bin/xunlu-dev.js"
import { __resetAiDispatchSessionsForTests } from "../src/plugins/ai-dispatch/controllers/handlers.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")
const fixturePlugin = path.join("test", "fixtures", "plugins", "harness-fixture", "index.js")
const pixivFixture = path.join("test", "fixtures", "plugins", "pixiv", "index.js")
const masterId = 1765629830

installTestRuntime(test)

function createSseResponse(payload) {
  const text = JSON.stringify(payload)
  return {
    data: Readable.from([
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
      "data: [DONE]\n\n",
    ]),
  }
}

async function runCli(args = []) {
  let stdout = ""
  let stderr = ""
  const prevCwd = process.cwd()
  const prevExitCode = process.exitCode

  const io = {
    stdout: {
      write(chunk) {
        stdout += String(chunk)
        return true
      },
    },
    stderr: {
      write(chunk) {
        stderr += String(chunk)
        return true
      },
    },
  }

  process.chdir(repoRoot)
  process.exitCode = 0
  try {
    await runXunluDev(args, io)
  } finally {
    const status = Number(process.exitCode ?? 0)
    process.chdir(prevCwd)
    process.exitCode = prevExitCode
    return { status, stdout, stderr }
  }
}

function useAxiosMock(handler) {
  const originalPost = axios.post
  axios.post = async (url, body, options) => await handler({ url, body, options })
  return () => {
    axios.post = originalPost
  }
}

function useFetchMock(handler) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options = {}) => {
    const result = await handler({ url: String(url), options })
    return {
      status: result?.status ?? 200,
      async text() {
        if (typeof result?.body === "string") return result.body
        return JSON.stringify(result?.body ?? result ?? {})
      },
    }
  }
  return () => {
    if (originalFetch) globalThis.fetch = originalFetch
    else delete globalThis.fetch
  }
}

test.beforeEach(() => {
  process.env.SILICONFLOW_API_KEY = "test-siliconflow-key"
  __resetAiDispatchSessionsForTests()
})

test.afterEach(() => {
  delete process.env.SILICONFLOW_API_KEY
  __resetAiDispatchSessionsForTests()
})

test("simulate --json stays parseable for protocol both", async () => {
  const res = await runCli([
    "simulate",
    "fixture",
    "ping",
    "--plugin",
    fixturePlugin,
    "--protocol",
    "both",
    "--json",
  ])
  assert.equal(res.status, 0)
  const data = JSON.parse(res.stdout)
  assert.equal(data.results.milky.ok, true)
  assert.equal(data.results.onebotv11.ok, true)
})

test("simulate-event --json stays parseable for protocol all", async () => {
  const res = await runCli([
    "simulate-event",
    "notice.group.decrease",
    "--plugin",
    "group",
    "--protocol",
    "all",
    "--group",
    "123",
    "--user",
    "10001",
    "--json",
  ])
  assert.equal(res.status, 0)
  const data = JSON.parse(res.stdout)
  assert.equal(data.results.milky.ok, true)
  assert.equal(data.results.onebotv11.ok, true)
  assert.equal(data.results.icqq.ok, true)
})

test("simulate-task supports icqq-local and pure JSON output", async () => {
  const res = await runCli([
    "simulate-task",
    "0",
    "--plugin",
    [fixturePlugin, pixivFixture].join(","),
    "--protocol",
    "icqq-local",
    "--ctx",
    JSON.stringify({ group_id: 123, user_id: 10001 }),
    "--json",
  ])
  assert.equal(res.status, 0)
  const data = JSON.parse(res.stdout)
  assert.equal(data.protocol, "icqq")
  assert.equal(data.mockMode, "local")
  assert.ok(Array.isArray(data.apiCalls))
})

test("dev check --json returns structured check results", async () => {
  const res = await runCli(["dev", "check", "--json"])
  assert.equal(res.status, 0)

  const data = JSON.parse(res.stdout)
  assert.equal(data.ok, true)
  assert.ok(Array.isArray(data.checks))
  const checkNames = new Set(data.checks.filter(item => item?.ok === true).map(item => item.name))
  assert.ok(checkNames.has("file:src/index.js"))
  assert.ok(checkNames.has("file:src/dev/plugin-test-harness.js"))
  assert.ok(checkNames.has("file:src/dev/protocol-mock.js"))
  assert.ok(checkNames.has("package:scripts:test:unit"))
  assert.ok(checkNames.has("package:scripts:dev:check"))
  assert.ok(checkNames.has("package:test:unit:test/plugin-test-harness.test.js"))
  assert.ok(checkNames.has("package:test:unit:test/protocol-api.test.js"))
  assert.ok(checkNames.has("package:test:unit:test/xunlu-dev.test.js"))
})

test("plugins list --json returns structured plugin names", async () => {
  const res = await runCli(["plugins", "list", "--json"])
  assert.equal(res.status, 0)

  const data = JSON.parse(res.stdout)
  assert.equal(data.ok, true)
  assert.ok(Array.isArray(data.plugins))
  assert.ok(data.plugins.includes("bilibili"))
  assert.ok(data.plugins.includes("douyin"))
})

test("help tree and error paths use injected stdio", async () => {
  const help = await runCli(["--help"])
  assert.equal(help.status, 0)
  assert.match(help.stdout, /xunlu-dev \(dev tools\)/)
  assert.match(help.stdout, /Usage:/)
  assert.equal(help.stderr, "")

  const tree = await runCli(["tree", "--path", "src/dev", "--max-depth", "1"])
  assert.equal(tree.status, 0)
  assert.match(tree.stdout, /plugin-test-harness\.js/)
  assert.equal(tree.stderr, "")

  const invalid = await runCli(["plugins", "bad-subcommand"])
  assert.equal(invalid.status, 2)
  assert.equal(invalid.stdout, "")
  assert.match(invalid.stderr, /unknown plugins subcommand: bad-subcommand/)
})

test("server and bot commands return JSON payloads", async () => {
  const calls = []
  const restore = useFetchMock(async ({ url, options }) => {
    calls.push({ url, method: options?.method || "GET", body: options?.body, headers: options?.headers })
    if (url.endsWith("/health")) return { body: { ok: true, name: "xunlu-server" } }
    if (url.endsWith("/bot/event")) return { body: { ok: true, accepted: true } }
    if (url.endsWith("/status")) return { body: { ok: true, status: "running" } }
    if (url.endsWith("/restart")) return { body: { ok: true, action: "restart" } }
    return { status: 404, body: { ok: false } }
  })

  const tempDir = path.join(repoRoot, "temp", "test")
  const eventFile = path.join(tempDir, "xunlu-dev-event.json")
  fs.mkdirSync(tempDir, { recursive: true })
  fs.writeFileSync(eventFile, JSON.stringify({ post_type: "message", raw_message: "ping" }), "utf8")

  try {
    const health = await runCli(["server", "health", "--url", "http://example.test"])
    assert.equal(health.status, 0)
    assert.deepEqual(JSON.parse(health.stdout), { ok: true, name: "xunlu-server" })

    const event = await runCli(["server", "event", eventFile, "--url", "http://example.test"])
    assert.equal(event.status, 0)
    assert.deepEqual(JSON.parse(event.stdout), { ok: true, accepted: true })

    const status = await runCli(["bot", "status", "--url", "http://bot.test", "--token", "secret"])
    assert.equal(status.status, 0)
    assert.deepEqual(JSON.parse(status.stdout), { ok: true, status: "running" })

    const restart = await runCli(["bot", "restart", "--url", "http://bot.test", "--token", "secret"])
    assert.equal(restart.status, 0)
    assert.deepEqual(JSON.parse(restart.stdout), { ok: true, action: "restart" })

    assert.deepEqual(
      calls.map(call => [call.method, call.url]),
      [
        ["GET", "http://example.test/health"],
        ["POST", "http://example.test/bot/event"],
        ["GET", "http://bot.test/status"],
        ["POST", "http://bot.test/restart"],
      ],
    )
    assert.equal(JSON.parse(calls[1].body).raw_message, "ping")
    assert.equal(calls[2].headers.authorization, "Bearer secret")
    assert.equal(calls[3].headers.authorization, "Bearer secret")
  } finally {
    restore()
    fs.rmSync(eventFile, { force: true })
    try {
      fs.rmdirSync(tempDir)
    } catch {}
  }
})

test("invalid protocol, invalid event, and invalid task index return exit code 2", async () => {
  const invalidProtocol = await runCli([
    "simulate",
    "fixture",
    "ping",
    "--plugin",
    fixturePlugin,
    "--protocol",
    "bad-protocol",
  ])
  assert.equal(invalidProtocol.status, 2)

  const invalidEvent = await runCli([
    "simulate-event",
    "notice.bad",
    "--plugin",
    "group",
  ])
  assert.equal(invalidEvent.status, 2)

  const invalidTask = await runCli([
    "simulate-task",
    "99",
    "--plugin",
    fixturePlugin,
  ])
  assert.equal(invalidTask.status, 2)
})

test("plugin execution errors return exit code 1 and JSON payload", async () => {
  const res = await runCli([
    "simulate",
    "fixture",
    "crash",
    "--plugin",
    fixturePlugin,
    "--protocol",
    "milky",
    "--json",
  ])
  assert.equal(res.status, 1)
  const data = JSON.parse(res.stdout)
  assert.equal(data.ok, false)
  assert.match(data.errors[0] || "", /fixture crash/)
})

test("simulate --json can drive help/image-style dispatch through ai-dispatch", async () => {
  const restore = useAxiosMock(async () =>
    createSseResponse({
      type: "command",
      command: "帮助",
      confidence: 0.99,
      reason_code: "help",
    }),
  )

  try {
    const res = await runCli([
      "simulate",
      "荨鹿 帮我看看功能",
      "--plugin",
      "help,ai-dispatch",
      "--protocol",
      "both",
      "--scene",
      "group",
      "--group",
      "123",
      "--user",
      String(masterId),
      "--json",
    ])
    assert.equal(res.status, 0)
    const data = JSON.parse(res.stdout)
    assert.equal(data.results.milky.ok, true)
    assert.equal(data.results.onebotv11.ok, true)
    assert.equal(data.results.milky.renderCalls.length, 1)
    assert.equal(data.results.onebotv11.renderCalls.length, 1)
  } finally {
    restore()
  }
})

test("simulate --json can drive learning_chat commands through ai-dispatch", async () => {
  const restore = useAxiosMock(async () =>
    createSseResponse({
      type: "command",
      command: "@bot 开启主动发言",
      confidence: 0.95,
      reason_code: "learning_chat",
    }),
  )

  try {
    const res = await runCli([
      "simulate",
      "荨鹿 帮我开启主动发言",
      "--plugin",
      "learning_chat,ai-dispatch",
      "--protocol",
      "milky",
      "--scene",
      "group",
      "--group",
      "123",
      "--user",
      String(masterId),
      "--json",
    ])
    assert.equal(res.status, 0)
    const data = JSON.parse(res.stdout)
    assert.equal(data.ok, true)
    assert.ok(data.replies.some(item => /主动发言/.test(item?.text || "")))
  } finally {
    restore()
  }
})
