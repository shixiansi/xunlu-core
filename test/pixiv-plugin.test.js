import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { __test, register } from "../src/plugins/pixiv/controllers/handlers.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")
const tempRoot = path.join(repoRoot, "temp", "pixiv-plugin-tests")
const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W0x8AAAAASUVORK5CYII=",
  "base64",
)

installTestRuntime(test)

function cleanupArtifacts() {
  __test.resetDeps()
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  } catch {}
}

function createMockResponse({ ok = true, status = 200, jsonData = {} } = {}) {
  return {
    ok,
    status,
    async json() {
      return jsonData
    },
  }
}

function createMirageOutput(name = "mirage.png") {
  fs.mkdirSync(tempRoot, { recursive: true })
  const filePath = path.join(tempRoot, name)
  fs.writeFileSync(filePath, onePixelPng)
  return filePath
}

function getCommandHandler(commandText) {
  const commands = []
  register({
    registerCommand(patterns, handler) {
      commands.push({
        patterns: Array.isArray(patterns) ? patterns : [patterns],
        handler,
      })
    },
  })

  const command = commands.find(item => item.patterns.some(pattern => pattern === commandText))
  if (!command) throw new Error(`command not found: ${commandText}`)
  return command.handler
}

function createPixivCtx(overrides = {}) {
  const state = {
    replyCalls: [],
    forwardCalls: [],
    recallCalls: [],
  }

  const ctx = {
    isMaster: true,
    msg: "来张猫娘色图",
    async makeGroupForwardMsg(_ctx, msgList, desc, screenshot) {
      state.forwardCalls.push({ msgList, desc, screenshot })
      return { type: "forward", data: { msgList, desc } }
    },
    async reply(message) {
      state.replyCalls.push(message)
      return {
        ok: true,
        message,
        message_id: `mock-message-${state.replyCalls.length}`,
        seq: state.replyCalls.length,
      }
    },
    async recallMessage(payload) {
      state.recallCalls.push(payload)
      return { ok: true }
    },
    ...overrides,
  }

  return { ctx, state }
}

async function withPixivDeps(patches, fn) {
  cleanupArtifacts()
  __test.setDeps(patches)
  try {
    return await fn()
  } finally {
    cleanupArtifacts()
  }
}

function createLoliconPic(overrides = {}) {
  return {
    pid: 123456,
    p: 0,
    uid: 10001,
    title: "测试涩图",
    author: "测试画师",
    r18: true,
    width: 1200,
    height: 1600,
    tags: ["猫娘", "白丝"],
    ext: "jpg",
    aiType: 2,
    uploadDate: 1710000000000,
    urls: {
      regular: "https://i.pixiv.re/img-master/img/2024/03/09/00/00/00/123456_p0_master1200.jpg",
      original: "https://i.pixiv.re/img-original/img/2024/03/09/00/00/00/123456_p0.jpg",
    },
    ...overrides,
  }
}

test("pixiv setu command uses lolicon v2 payload and sends forward with new metadata", async () => {
  const fetchCalls = []
  const pic = createLoliconPic()

  await withPixivDeps(
    {
      async fetch(url, options = {}) {
        fetchCalls.push({ url, options })
        if (url === __test.LOLICON_SETU_API) {
          return createMockResponse({ jsonData: { error: "", data: [pic] } })
        }
        if (url === pic.urls.regular && options.method === "HEAD") {
          return { ok: true }
        }
        throw new Error(`unexpected fetch: ${url}`)
      },
    },
    async () => {
      const handler = getCommandHandler("^来张(.*)色图$")
      const { ctx, state } = createPixivCtx({ msg: "来张猫娘色图" })

      const result = await handler(ctx)

      assert.equal(Boolean(result), true)
      assert.equal(fetchCalls.length, 2)
      assert.equal(fetchCalls[0].url, __test.LOLICON_SETU_API)
      assert.equal(fetchCalls[0].options.method, "POST")

      const requestBody = JSON.parse(fetchCalls[0].options.body)
      assert.deepEqual(requestBody, {
        r18: 2,
        num: 1,
        tag: ["猫娘"],
        size: ["regular", "original"],
        excludeAI: false,
      })

      assert.equal(state.forwardCalls.length, 1)
      const msgList = state.forwardCalls[0].msgList
      assert.match(msgList[0], /pid\/p：123456\/0/)
      assert.match(msgList[0], /画师：测试画师（10001）/)
      assert.match(msgList[0], /标题：测试涩图/)
      assert.match(msgList[0], /R18：是/)
      assert.match(msgList[0], /是否AI：是/)
      assert.match(msgList[0], /尺寸：1200×1600/)
      assert.match(msgList[0], /tag：猫娘, 白丝/)
      assert.match(msgList[0], /原图链接：https:\/\/i\.pixiv\.re\/img-original/)
      assert.equal(msgList[1]?.type, "image")
      assert.equal(msgList[1]?.data?.file, pic.urls.regular)
    },
  )
})

test("pixiv setu command retries empty lolicon responses and returns failure text", async () => {
  const fetchCalls = []

  await withPixivDeps(
    {
      async fetch(url, options = {}) {
        fetchCalls.push({ url, options })
        if (url === __test.LOLICON_SETU_API) {
          return createMockResponse({ jsonData: { error: "", data: [] } })
        }
        throw new Error(`unexpected fetch: ${url}`)
      },
    },
    async () => {
      const handler = getCommandHandler("^来张(.*)色图$")
      const { ctx, state } = createPixivCtx({ msg: "来张色图" })

      await handler(ctx)

      assert.equal(fetchCalls.length, __test.MAX_RETRY_COUNT)
      const requestBody = JSON.parse(fetchCalls[0].options.body)
      assert.deepEqual(requestBody.tag, ["萝莉"])
      assert.equal(state.replyCalls.length, 1)
      assert.match(String(state.replyCalls[0]), /标签「萝莉」已尝试3次/)
    },
  )
})

test("pixiv setu command rebuilds forward with mirage images after first forward send fails", async () => {
  const pic = createLoliconPic()
  const mirageOutputs = []

  await withPixivDeps(
    {
      async fetch(url, options = {}) {
        if (url === __test.LOLICON_SETU_API) {
          return createMockResponse({ jsonData: { error: "", data: [pic] } })
        }
        if (url === pic.urls.regular && options.method === "HEAD") {
          return { ok: true }
        }
        throw new Error(`unexpected fetch: ${url}`)
      },
      async createMirageTank(surfacePath, innerUrl, outputPath) {
        assert.equal(surfacePath, __test.mirageSurfacePath)
        assert.equal(innerUrl, pic.urls.regular)
        fs.mkdirSync(path.dirname(outputPath), { recursive: true })
        fs.writeFileSync(outputPath, onePixelPng)
        mirageOutputs.push(outputPath)
        return outputPath
      },
    },
    async () => {
      const handler = getCommandHandler("^来张(.*)色图$")
      let forwardReplyCount = 0
      const { ctx, state } = createPixivCtx({
        async reply(message) {
          state.replyCalls.push(message)
          if (message?.type === "forward") {
            forwardReplyCount += 1
            if (forwardReplyCount === 1) {
              throw new Error("forward send failed")
            }
          }
          return {
            ok: true,
            message,
            message_id: `mock-message-${state.replyCalls.length}`,
            seq: state.replyCalls.length,
          }
        },
      })

      await handler(ctx)

      assert.equal(state.forwardCalls.length, 2)
      assert.equal(state.replyCalls[1], __test.MIRAGE_FALLBACK_NOTICE)
      const fallbackList = state.forwardCalls[1].msgList
      assert.equal(fallbackList[1]?.type, "image")
      assert.match(String(fallbackList[1]?.data?.file || ""), /^base64:\/\//)
      assert.equal(state.replyCalls.length, 3)
      assert.equal(state.recallCalls.length, 1)
      assert.equal(state.recallCalls[0]?.message_id, "mock-message-2")
      for (const filePath of mirageOutputs) {
        assert.equal(fs.existsSync(filePath), false)
      }
    },
  )
})

test("pixiv setu command rebuilds forward with mirage images when forward reply swallows send error", async () => {
  const pic = createLoliconPic()

  await withPixivDeps(
    {
      async fetch(url, options = {}) {
        if (url === __test.LOLICON_SETU_API) {
          return createMockResponse({ jsonData: { error: "", data: [pic] } })
        }
        if (url === pic.urls.regular && options.method === "HEAD") {
          return { ok: true }
        }
        throw new Error(`unexpected fetch: ${url}`)
      },
      async createMirageTank(_surfacePath, _innerUrl, outputPath) {
        return createMirageOutput(path.basename(outputPath))
      },
    },
    async () => {
      const handler = getCommandHandler("^来张(.*)色图$")
      let forwardReplyCount = 0
      const { ctx, state } = createPixivCtx({
        async reply(message) {
          state.replyCalls.push(message)
          if (message?.type === "forward") {
            forwardReplyCount += 1
            if (forwardReplyCount === 1) {
              return undefined
            }
          }
          return {
            ok: true,
            message,
            message_id: `mock-message-${state.replyCalls.length}`,
            seq: state.replyCalls.length,
          }
        },
      })

      await handler(ctx)

      assert.equal(state.forwardCalls.length, 2)
      assert.equal(state.replyCalls[1], __test.MIRAGE_FALLBACK_NOTICE)
      const fallbackList = state.forwardCalls[1].msgList
      assert.equal(fallbackList[1]?.type, "image")
      assert.match(String(fallbackList[1]?.data?.file || ""), /^base64:\/\//)
    },
  )
})

test("pixiv setu command still sends mirage fallback when notice message fails", async () => {
  const pic = createLoliconPic()

  await withPixivDeps(
    {
      async fetch(url, options = {}) {
        if (url === __test.LOLICON_SETU_API) {
          return createMockResponse({ jsonData: { error: "", data: [pic] } })
        }
        if (url === pic.urls.regular && options.method === "HEAD") {
          return { ok: true }
        }
        throw new Error(`unexpected fetch: ${url}`)
      },
      async createMirageTank(_surfacePath, _innerUrl, outputPath) {
        return createMirageOutput(path.basename(outputPath))
      },
    },
    async () => {
      const handler = getCommandHandler("^来张(.*)色图$")
      let forwardReplyCount = 0
      const { ctx, state } = createPixivCtx({
        async reply(message) {
          state.replyCalls.push(message)
          if (message?.type === "forward") {
            forwardReplyCount += 1
            if (forwardReplyCount === 1) {
              throw new Error("forward send failed")
            }
          }
          if (message === __test.MIRAGE_FALLBACK_NOTICE) {
            throw new Error("notice send failed")
          }
          return {
            ok: true,
            message,
            message_id: `mock-message-${state.replyCalls.length}`,
            seq: state.replyCalls.length,
          }
        },
      })

      await handler(ctx)

      assert.equal(state.forwardCalls.length, 2)
      const fallbackList = state.forwardCalls[1].msgList
      assert.equal(fallbackList[1]?.type, "image")
      assert.match(String(fallbackList[1]?.data?.file || ""), /^base64:\/\//)
      assert.equal(state.recallCalls.length, 0)
    },
  )
})

test("pixiv random command replaces failed mirage image with text placeholder instead of raw image", async () => {
  const randomPic = {
    id: 777,
    user: { id: 20002, name: "随机画师" },
    aiType: false,
    title: "随机图测试",
    updateTime: "2026-04-09 12:00:00",
    bookmarkCount: 22,
    viewCount: 88,
    tags: ["测试", "多图"],
    pageCount: 2,
    urls: {
      original: "https://i.pixiv.re/img-original/img/2026/04/09/00/00/00/777_p0.png",
    },
  }

  await withPixivDeps(
    {
      async fetch(url, options = {}) {
        if (String(url).startsWith("https://shipixiv.de5.net/api/pixivRandombg?mode=")) {
          return createMockResponse({ jsonData: { data: randomPic } })
        }
        if (url === randomPic.urls.original && options.method === "HEAD") {
          return { ok: true }
        }
        throw new Error(`unexpected fetch: ${url}`)
      },
      async createMirageTank(_surfacePath, innerUrl, outputPath) {
        if (innerUrl.endsWith("_p0.png")) {
          throw new Error("first image failed")
        }
        fs.mkdirSync(path.dirname(outputPath), { recursive: true })
        fs.writeFileSync(outputPath, onePixelPng)
        return outputPath
      },
      random() {
        return 1
      },
    },
    async () => {
      const handler = getCommandHandler("随机图")
      let forwardReplyCount = 0
      const { ctx, state } = createPixivCtx({
        msg: "随机图",
        async reply(message) {
          state.replyCalls.push(message)
          if (message?.type === "forward") {
            forwardReplyCount += 1
            if (forwardReplyCount === 1) {
              throw new Error("forward send failed")
            }
          }
          return { ok: true, message }
        },
      })

      await handler(ctx)

      assert.equal(state.forwardCalls.length, 2)
      const fallbackList = state.forwardCalls[1].msgList
      assert.match(String(fallbackList[1]), /第1张图片的幻影坦克生成失败/)
      assert.match(String(fallbackList[1]), /777_p0\.png/)
      assert.equal(fallbackList[2]?.type, "image")
      assert.match(String(fallbackList[2]?.data?.file || ""), /^base64:\/\//)
    },
  )
})

test("pixiv sends explicit failure text when mirage fallback forward also fails", async () => {
  const pic = createLoliconPic()

  await withPixivDeps(
    {
      async fetch(url, options = {}) {
        if (url === __test.LOLICON_SETU_API) {
          return createMockResponse({ jsonData: { error: "", data: [pic] } })
        }
        if (url === pic.urls.regular && options.method === "HEAD") {
          return { ok: true }
        }
        throw new Error(`unexpected fetch: ${url}`)
      },
      async createMirageTank(_surfacePath, _innerUrl, outputPath) {
        return createMirageOutput(path.basename(outputPath))
      },
    },
    async () => {
      const handler = getCommandHandler("^来张(.*)色图$")
      let forwardReplyCount = 0
      const { ctx, state } = createPixivCtx({
        async reply(message) {
          state.replyCalls.push(message)
          if (message?.type === "forward") {
            forwardReplyCount += 1
            throw new Error(`forward fail ${forwardReplyCount}`)
          }
          return {
            ok: true,
            message,
            message_id: `mock-message-${state.replyCalls.length}`,
            seq: state.replyCalls.length,
          }
        },
      })

      await handler(ctx)

      assert.equal(state.forwardCalls.length, 2)
      assert.equal(state.replyCalls[1], __test.MIRAGE_FALLBACK_NOTICE)
      assert.equal(typeof state.replyCalls[3], "string")
      assert.match(state.replyCalls[3], /标签「猫娘」色图转发发送失败/)
      assert.match(state.replyCalls[3], /1\. https:\/\/i\.pixiv\.re\/img-master/)
      assert.equal(state.recallCalls.length, 1)
      assert.equal(state.recallCalls[0]?.message_id, "mock-message-2")
    },
  )
})
