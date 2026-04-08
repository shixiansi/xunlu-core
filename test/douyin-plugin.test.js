import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { main as runXunluDev } from "../bin/xunlu-dev.js"
import { createPluginTestHarness } from "../src/dev/plugin-test-harness.js"
import douyinPlugin from "../src/plugins/douyin/index.js"
import {
  __resetDouyinSessionsForTests,
  extractFirstDouyinUrlFromContext,
  sendHotCommentsForward,
  sendNoteMedia,
  sendVideoMedia,
} from "../src/plugins/douyin/controllers/handlers.js"
import DouyinService, {
  buildLaunchOptions,
  extractFirstDouyinUrlFromText,
  normalizeDouyinAweme,
} from "../src/plugins/douyin/services/douyin-service.js"
import {
  clearDouyinAuth,
  getDouyinAuthFilePath,
  writeDouyinAuth,
} from "../src/plugins/douyin/model/auth-store.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")
const masterId = 1765629830
const tempDouyinDir = path.resolve(repoRoot, "temp", "douyin")

installTestRuntime(test)

function ensureFile(filePath, content = "fixture") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
  return filePath
}

function cleanupDouyinArtifacts() {
  clearDouyinAuth()
  try {
    fs.rmSync(tempDouyinDir, { recursive: true, force: true })
  } catch {}
  __resetDouyinSessionsForTests()
}

async function withHarness(options, fn) {
  const harness = await createPluginTestHarness({
    plugins: [douyinPlugin],
    protocol: "milky",
    ...options,
  })
  try {
    return await fn(harness)
  } finally {
    await harness.dispose()
  }
}

async function withPatchedMethods(target, patches, fn) {
  const originals = new Map()
  for (const [key, value] of Object.entries(patches)) {
    originals.set(key, target[key])
    target[key] = value
  }

  try {
    return await fn()
  } finally {
    for (const [key, value] of originals.entries()) {
      target[key] = value
    }
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

function createMockVideoAweme() {
  return {
    id: "7499999999999999999",
    type: "video",
    author: {
      nickname: "测试抖音作者",
      id: "author-1",
      avatar: "https://example.com/avatar.png",
    },
    desc: "这是一条测试抖音视频文案",
    stats: {
      playCount: 123456,
      diggCount: 7890,
      commentCount: 321,
      shareCount: 88,
    },
    cover: "https://example.com/cover.jpg",
    video: {
      url: "https://example.com/video.mp4",
      duration: 15,
    },
    images: [],
    link: "https://www.douyin.com/video/7499999999999999999",
    publishedAt: "2026-04-08 12:00:00",
  }
}

function createMockNoteAweme() {
  return {
    id: "7599999999999999999",
    type: "note",
    author: {
      nickname: "测试图文作者",
      id: "author-2",
      avatar: "https://example.com/avatar2.png",
    },
    desc: "这是一条测试抖音图文内容",
    stats: {
      playCount: 0,
      diggCount: 666,
      commentCount: 66,
      shareCount: 6,
    },
    cover: "https://example.com/note-cover.jpg",
    video: {
      url: "",
      duration: 0,
    },
    images: [
      "https://example.com/note-1.jpg",
      "https://example.com/note-2.jpg",
    ],
    link: "https://www.douyin.com/note/7599999999999999999",
    publishedAt: "2026-04-08 13:00:00",
  }
}

test.beforeEach(() => {
  cleanupDouyinArtifacts()
})

test.afterEach(() => {
  cleanupDouyinArtifacts()
})

test("douyin scan command replies with cookie setup guide", async () => {
  await withHarness({}, async harness => {
    const res = await harness.emitMessage({
      scene: "private",
      text: "#抖音扫码",
      user_id: masterId,
    })

    assert.equal(res.ok, true)
    const text = res.replies.map(item => item?.text || "").join("\n")
    assert.match(text, /手动设置 Cookie 登录/)
    assert.match(text, /WebUI 的抖音配置页/)
  })
})

test("douyin scan command falls back to cookie guide when qr start fails", async () => {
  await withHarness({}, async harness => {
    const res = await harness.emitMessage({
      scene: "private",
      text: "#抖音扫码",
      user_id: masterId,
    })

    assert.equal(res.ok, true)
    const text = res.replies.map(item => item?.text || "").join("\n")
    assert.match(text, /手动设置 Cookie 登录/)
    assert.match(text, /抖音登录/)
  })
})

test("douyin cookie login imports cookie and replies with summary", async () => {
  await withPatchedMethods(
    DouyinService,
    {
      async importCookieHeader(cookieHeader) {
        assert.ok(cookieHeader.includes("sessionid=abc"))
        return writeDouyinAuth({
          cookieHeader: "sessionid=abc; passport_csrf_token=def",
          cookies: {
            sessionid: "abc",
            passport_csrf_token: "def",
          },
          userInfo: {
            nickname: "测试抖音号",
            uid: "douyin-user-1",
          },
        })
      },
    },
    async () => {
      await withHarness({}, async harness => {
        const res = await harness.emitMessage({
          scene: "private",
          text: "#抖音登录 sessionid=abc; passport_csrf_token=def",
          user_id: masterId,
        })

        assert.equal(res.ok, true)
        assert.ok(res.replies.some(item => /抖音登录成功/.test(item?.text || "")))
        const saved = JSON.parse(fs.readFileSync(getDouyinAuthFilePath(), "utf8"))
        assert.equal(saved.userInfo.nickname, "测试抖音号")
      })
    },
  )
})

test("douyin parse prompts for login when auth is missing", async () => {
  await withHarness({}, async harness => {
    const res = await harness.emitMessage({
      scene: "group",
      text: "看看这个 https://v.douyin.com/iABC1234/",
      group_id: 123,
      user_id: 10001,
    })

    assert.equal(res.ok, true)
    assert.ok(res.replies.some(item => /抖音登录/.test(item?.text || "")))
  })
})

test("douyin helper extracts links from text and card context", () => {
  assert.equal(
    extractFirstDouyinUrlFromText("看看这个 https://v.douyin.com/iABC1234/ 再发一个 https://example.com"),
    "https://v.douyin.com/iABC1234/",
  )

  const ctx = {
    json: {
      meta: {
        news: {
          jumpUrl: "https://www.douyin.com/note/7599999999999999999",
        },
      },
    },
  }
  assert.equal(
    extractFirstDouyinUrlFromContext(ctx),
    "https://www.douyin.com/note/7599999999999999999",
  )
})

test("douyin aweme normalization supports video and note payloads", () => {
  const video = normalizeDouyinAweme(
    {
      aweme_id: "70001",
      desc: "视频文案",
      author: {
        nickname: "视频作者",
      },
      statistics: {
        digg_count: 12,
        comment_count: 3,
      },
      video: {
        play_addr: {
          url_list: ["https://example.com/video.mp4"],
        },
        cover: {
          url_list: ["https://example.com/video-cover.jpg"],
        },
      },
      create_time: 1710000000,
    },
    { sourceUrl: "https://www.douyin.com/video/70001" },
  )
  assert.equal(video.type, "video")
  assert.equal(video.id, "70001")
  assert.equal(video.video.url, "https://example.com/video.mp4")

  const note = normalizeDouyinAweme(
    {
      aweme_id: "70002",
      desc: "图文文案",
      author: {
        nickname: "图文作者",
      },
      image_post_info: {
        images: [
          {
            display_image: {
              url_list: ["https://example.com/note-1.jpg"],
            },
          },
          {
            display_image: {
              url_list: ["https://example.com/note-2.jpg"],
            },
          },
        ],
      },
    },
    { sourceUrl: "https://www.douyin.com/note/70002" },
  )
  assert.equal(note.type, "note")
  assert.equal(note.images.length, 2)
  assert.equal(note.link, "https://www.douyin.com/note/70002")
})

test("douyin aweme normalization picks video url from fallback fields", () => {
  const video = normalizeDouyinAweme(
    {
      aweme_id: "70003",
      desc: "视频文案 2",
      author: {
        nickname: "视频作者 2",
      },
      video: {
        bit_rate: [
          {},
          {
            play_addr: {
              url_list: ["https://example.com/video-fallback.mp4"],
            },
          },
        ],
        dynamic_cover: {
          url_list: ["https://example.com/video-fallback-cover.jpg"],
        },
      },
    },
    { sourceUrl: "https://www.douyin.com/video/70003" },
  )

  assert.equal(video.type, "video")
  assert.equal(video.video.url, "https://example.com/video-fallback.mp4")
  assert.equal(video.cover, "https://example.com/video-fallback-cover.jpg")
})

test("douyin launch options support sandbox override for container environments", () => {
  const previous = process.env.PUPPETEER_DISABLE_SANDBOX
  process.env.PUPPETEER_DISABLE_SANDBOX = "true"

  try {
    const options = buildLaunchOptions({ profileDir: path.join(tempDouyinDir, "profile") })
    assert.equal(options.userDataDir, path.join(tempDouyinDir, "profile"))
    assert.ok(options.args.includes("--no-sandbox"))
    assert.ok(options.args.includes("--disable-setuid-sandbox"))
    assert.ok(options.args.includes("--no-zygote"))
  } finally {
    if (previous === undefined) delete process.env.PUPPETEER_DISABLE_SANDBOX
    else process.env.PUPPETEER_DISABLE_SANDBOX = previous
  }
})

test("douyin video parse sends summary, video media and comment forward", async () => {
  const videoPath = ensureFile(path.join(tempDouyinDir, "video", "mock-video.mp4"), "video")

  await withPatchedMethods(
    DouyinService,
    {
      async ensureAuthorizedSession() {
        return {
          ok: true,
          auth: {
            cookieHeader: "sessionid=abc",
            userInfo: {
              nickname: "测试抖音号",
            },
          },
        }
      },
      async getAwemeDetail() {
        return createMockVideoAweme()
      },
      async downloadVideoFile() {
        return videoPath
      },
      async fetchHotComments() {
        return [
          {
            nickname: "评论用户1",
            diggCount: 18,
            publishedAt: "2026-04-08 12:10:00",
            text: "评论内容 1",
          },
          {
            nickname: "评论用户2",
            diggCount: 9,
            publishedAt: "2026-04-08 12:20:00",
            text: "评论内容 2",
          },
        ]
      },
      cleanupFiles() {},
    },
    async () => {
      await withHarness({}, async harness => {
        const res = await harness.emitMessage({
          scene: "group",
          text: "看看这个 https://v.douyin.com/iVideoMock/",
          group_id: 456,
          user_id: 10001,
        })

        assert.equal(res.ok, true)
        assert.ok(res.renderCalls.length >= 1)
        assert.ok(res.renderCalls.some(call => call.name === "douyin" && /card/.test(call.tplPath || "")))
        assert.ok(
          res.replies.some(item =>
            Array.isArray(item?.message)
              ? item.message.some(seg => seg?.type === "video")
              : false,
          ),
        )
        assert.ok(
          res.apiCalls.some(call => /forward/i.test(String(call?.name || ""))) ||
            JSON.stringify(res.apiCalls).includes("评论内容 1"),
        )
      })
    },
  )
})

test("douyin video helper falls back for oversized and failed downloads", async () => {
  const replies = []
  const ctx = {
    async reply(message) {
      replies.push(message)
      return true
    },
  }

  await withPatchedMethods(
    DouyinService,
    {
      async downloadVideoFile() {
        throw new Error("download size exceeds limit: 100 > 10")
      },
      cleanupFiles() {},
    },
    async () => {
      const ok = await sendVideoMedia(ctx, createMockVideoAweme())
      assert.equal(ok, false)
      assert.ok(String(replies[0]?.[1] || replies[0]).includes("已改为发送封面和原链接"))
    },
  )

  replies.length = 0

  await withPatchedMethods(
    DouyinService,
    {
      async downloadVideoFile() {
        throw new Error("network failed")
      },
      cleanupFiles() {},
    },
    async () => {
      const ok = await sendVideoMedia(ctx, createMockVideoAweme())
      assert.equal(ok, false)
      assert.ok(String(replies[0]?.[1] || replies[0]).includes("已改为发送封面和原链接"))
    },
  )
})

test("douyin note parse sends summary and image list", async () => {
  await withPatchedMethods(
    DouyinService,
    {
      async ensureAuthorizedSession() {
        return {
          ok: true,
          auth: {
            cookieHeader: "sessionid=abc",
          },
        }
      },
      async getAwemeDetail() {
        return createMockNoteAweme()
      },
      async fetchHotComments() {
        return []
      },
    },
    async () => {
      await withHarness({}, async harness => {
        const res = await harness.emitMessage({
          scene: "group",
          text: "看看这个 https://www.douyin.com/note/7599999999999999999",
          group_id: 789,
          user_id: 10001,
        })

        assert.equal(res.ok, true)
        assert.ok(res.renderCalls.length >= 1)
        assert.ok(res.renderCalls.some(call => call.name === "douyin" && /card/.test(call.tplPath || "")))
        assert.ok(
          res.apiCalls.some(call => /forward/i.test(String(call?.name || ""))) ||
            JSON.stringify(res.apiCalls).includes("抖音图文"),
        )
      })
    },
  )
})

test("douyin note helper falls back to first image when image sending fails", async () => {
  const calls = []
  const ctx = {
    self_id: 10000,
    async makeGroupForwardMsg() {
      throw new Error("send failed")
    },
    async reply(message) {
      calls.push(message)
      return true
    },
  }

  const ok = await sendNoteMedia(ctx, createMockNoteAweme())
  assert.equal(ok, false)
  assert.ok(String(calls[0]?.[1] || calls[0]).includes("已改为发送首图和原链接"))
})

test("douyin parse stays silent when hot comments fetch fails", async () => {
  await withPatchedMethods(
    DouyinService,
    {
      async ensureAuthorizedSession() {
        return {
          ok: true,
          auth: {
            cookieHeader: "sessionid=abc",
          },
        }
      },
      async getAwemeDetail() {
        return createMockVideoAweme()
      },
      async downloadVideoFile() {
        return ensureFile(path.join(tempDouyinDir, "video", "no-comment-video.mp4"), "video")
      },
      async fetchHotComments() {
        throw new Error("comment api failed")
      },
      cleanupFiles() {},
    },
    async () => {
      await withHarness({}, async harness => {
        const res = await harness.emitMessage({
          scene: "group",
          text: "看看这个 https://v.douyin.com/iNoComment/",
          group_id: 999,
          user_id: 10001,
        })

        assert.equal(res.ok, true)
        assert.ok(!res.replies.some(item => /热门评论获取失败/.test(item?.text || "")))
      })
    },
  )
})

test("douyin hot comments helper builds forward nodes and limits to top 10", async () => {
  const forwarded = []
  const replied = []
  const comments = Array.from({ length: 12 }, (_, index) => ({
    nickname: `评论用户${index + 1}`,
    diggCount: index + 1,
    publishedAt: `2026-04-08 12:${String(index).padStart(2, "0")}:00`,
    text: `评论内容 ${index + 1}`,
  }))

  const ok = await sendHotCommentsForward(
    {
      self_id: 10000,
      async makeGroupForwardMsg(ctx, nodes, desc) {
        forwarded.push({ ctx, nodes, desc })
        return [
          {
            type: "forward",
            data: {
              messages: nodes,
            },
          },
        ]
      },
      async reply(message) {
        replied.push(message)
        return true
      },
    },
    comments,
  )

  assert.equal(ok, true)
  assert.equal(forwarded[0].nodes.length, 10)
  assert.equal(replied.length, 1)
})

test("xunlu-dev simulate supports douyin plugin on protocol both", async () => {
  await withPatchedMethods(
    DouyinService,
    {
      async ensureAuthorizedSession() {
        return {
          ok: true,
          auth: {
            cookieHeader: "sessionid=abc",
          },
        }
      },
      async getAwemeDetail() {
        return createMockNoteAweme()
      },
      async fetchHotComments() {
        return []
      },
    },
    async () => {
      const res = await runCli([
        "simulate",
        "看看这个",
        "https://v.douyin.com/iCliMock/",
        "--plugin",
        "douyin",
        "--protocol",
        "both",
        "--scene",
        "group",
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
    },
  )
})
