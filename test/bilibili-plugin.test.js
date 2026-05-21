import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { segment } from "../src/Bot/message/index.js"
import { createPluginTestHarness } from "../src/dev/plugin-test-harness.js"
import bilibiliPlugin from "../src/plugins/bilibili/index.js"
import Bili from "../src/plugins/bilibili/model/Bilili.js"
import ffmpeg from "../src/component/ffmpeg/ffmpeg.js"
import { getRuntimePaths } from "../src/runtime/runtime-context.js"
import Download from "../src/utils/download.js"
import { __resetParseDedupeForTests } from "../src/plugins/shared/parse-dedupe.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")

installTestRuntime(test)

test.beforeEach(() => {
  __resetParseDedupeForTests()
})

test.afterEach(() => {
  __resetParseDedupeForTests()
})

function getGroupDataFile(groupId) {
  return path.resolve(getRuntimePaths().getPluginDataDir("bilibili", "group"), `${groupId}.json`)
}

function cleanupGroupData(groupId) {
  try {
    fs.unlinkSync(getGroupDataFile(groupId))
  } catch {}
}

function readGroupData(groupId) {
  return JSON.parse(fs.readFileSync(getGroupDataFile(groupId), "utf8"))
}

function writeGroupData(groupId, data) {
  fs.mkdirSync(path.dirname(getGroupDataFile(groupId)), { recursive: true })
  fs.writeFileSync(getGroupDataFile(groupId), JSON.stringify(data, null, 2), "utf8")
}

function createNativeForwardPayload(messages = []) {
  return [
    {
      type: "forward",
      data: {
        messages: messages.map(item => ({
          user_id: Number(item?.user_id || item?.uin || 10000),
          sender_name: String(item?.sender_name || item?.nickname || item?.name || "Bilibili动态"),
          segments: Array.isArray(item?.message) ? item.message : [item?.message],
        })),
      },
    },
  ]
}

async function withHarness(options, fn) {
  const harness = await createPluginTestHarness({
    plugins: [bilibiliPlugin],
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

test("bilibili model keeps negative errcode instead of throwing", async () => {
  await withPatchedMethods(
    Bili,
    {
      async getdynamiclist() {
        throw new Error("API 错误: [errcode:-352]")
      },
    },
    async () => {
      const result = await Bili.getDynamic("123", "update")
      assert.equal(result.code, "-352")
      assert.ok(result.message)
    },
  )
})

test("dealDynamicData handles lottery text without const reassignment crash", () => {
  const result = Bili.dealDynamicData({
    id_str: "123456",
    type: "DYNAMIC_TYPE_WORD",
    modules: {
      module_dynamic: {
        major: {
          opus: {
            summary: {
              rich_text_nodes: [
                {
                  type: "RICH_TEXT_NODE_TYPE_TEXT",
                  orig_text: "互动抽奖",
                },
              ],
            },
          },
        },
      },
      module_author: {
        name: "测试UP",
        face: "https://example.com/avatar.png",
        pendant: {
          image: "",
        },
        pub_ts: 1710000000,
      },
    },
  })

  assert.equal(result.type, "抽奖")
  assert.equal(result.author.nickname, "测试UP")
})

test("empty bilibili subscription list replies instead of crashing", async () => {
  const groupId = 991001
  cleanupGroupData(groupId)

  try {
    await withHarness({}, async harness => {
      const res = await harness.emitMessage({
        scene: "group",
        text: "#订阅列表",
        group_id: groupId,
        user_id: 10001,
      })

      assert.equal(res.ok, true)
      assert.match(res.replies[0]?.text || "", /这个群还没订阅任何up主呢/)
    })
  } finally {
    cleanupGroupData(groupId)
  }
})

test("duplicate bilibili subscriptions are deduplicated and last type cancel removes entry", async () => {
  const groupId = 991002
  const uid = "123"
  cleanupGroupData(groupId)

  try {
    await withPatchedMethods(
      Bili,
      {
        async getUpdateDynamic() {
          return {
            id: "dynamic-1",
            author: {
              nickname: "测试UP",
              img: "https://example.com/avatar.png",
              pendantImg: "https://example.com/pendant.png",
            },
          }
        },
        async getUserBaseInfo(mid) {
          return {
            mid,
            name: "测试UP",
            face: "https://example.com/avatar.png",
          }
        },
      },
      async () => {
        await withHarness({}, async harness => {
          const first = await harness.emitMessage({
            scene: "group",
            text: "#订阅视频动态uid:123",
            group_id: groupId,
            user_id: 10001,
          })
          assert.equal(first.ok, true)

          const second = await harness.emitMessage({
            scene: "group",
            text: "#订阅视频动态uid:123",
            group_id: groupId,
            user_id: 10001,
          })
          assert.equal(second.ok, true)

          const storedAfterSubscribe = readGroupData(groupId)
          assert.deepEqual(storedAfterSubscribe[uid]?.dynamicType, ["av"])

          const cancel = await harness.emitMessage({
            scene: "group",
            text: "#取消订阅视频动态uid:123",
            group_id: groupId,
            user_id: 10001,
          })
          assert.equal(cancel.ok, true)

          const storedAfterCancel = readGroupData(groupId)
          assert.equal(storedAfterCancel[uid], undefined)
        })
      },
    )
  } finally {
    cleanupGroupData(groupId)
  }
})

test("invalid bilibili short links reply gracefully", async () => {
  await withPatchedMethods(
    Bili,
    {
      async getCompleteUrl() {
        return "https://www.bilibili.com/video/not-a-bv"
      },
    },
    async () => {
      await withHarness({}, async harness => {
        const res = await harness.emitMessage({
          scene: "group",
          text: "https://b23.tv/not-real",
          group_id: 991003,
          user_id: 10001,
        })

        assert.equal(res.ok, true)
        assert.match(res.replies[0]?.text || "", /未识别到有效的B站视频链接/)
      })
    },
  )
})

test("bilibili video links reply with rendered image card", async () => {
  const savedPaths = []
  await withPatchedMethods(
    Bili,
    {
      async getVideoInfo() {
        return {
          bvid: "BV1xx411c7mD",
          ctime: 1710000000,
          pic: "https://example.com/video-cover.jpg",
          title: "测试视频标题",
          desc: "测试视频简介",
          duration: 123,
          owner: {
            name: "测试UP主",
          },
          stat: {
            view: 123456,
            danmaku: 7890,
            like: 4567,
            coin: 345,
            favorite: 678,
            share: 90,
          },
        }
      },
      async getQnVideo() {
        return {
          qn: 80,
          audio: "https://example.com/audio.mp3",
          duration: 123,
          audioBandwidth: 128000,
          videoStreams: [
            {
              qn: 80,
              url: "https://example.com/video.mp4",
              bandwidth: 800000,
            },
          ],
        }
      },
    },
    async () => {
      await withPatchedMethods(
        ffmpeg,
        {
          VideoComposite(_videoPath, _audioPath, outputPath, suc) {
            fs.writeFileSync(outputPath, Buffer.from("fake-video"))
            void suc()
          },
        },
        async () => {
          await withPatchedMethods(
            Download.prototype,
            {
              async downloadFile(_url, savePath) {
                savedPaths.push(savePath)
                const full = path.resolve(repoRoot, savePath)
                fs.mkdirSync(path.dirname(full), { recursive: true })
                fs.writeFileSync(full, Buffer.from("fake-media"))
                return true
              },
            },
            async () => {
              await withHarness({}, async harness => {
                const res = await harness.emitMessage({
                  scene: "group",
                  text: "https://www.bilibili.com/video/BV1xx411c7mD",
                  group_id: 991006,
                  user_id: 10001,
                })

                assert.equal(res.ok, true)
                const hasImageReply = res.replies.some(item =>
                  Array.isArray(item?.message)
                    ? item.message.some(seg => String(seg?.type || "").toLowerCase() === "image")
                    : false,
                )
                const hasVideoReply = res.replies.some(item =>
                  Array.isArray(item?.message)
                    ? item.message.some(seg => String(seg?.type || "").toLowerCase() === "video")
                    : false,
                )
                assert.equal(hasImageReply, true)
                assert.equal(hasVideoReply, true)
                assert.ok(savedPaths.some(item => /temp\/bilibili\/video\/source_.*\.mp4$/i.test(String(item))))
                assert.ok(savedPaths.some(item => /temp\/bilibili\/video\/source_.*\.mp3$/i.test(String(item))))
              })
            },
          )
        },
      )
    },
  )
})

test("bilibili parser deduplicates repeated video link events", async () => {
  let videoInfoCalls = 0

  await withPatchedMethods(
    Bili,
    {
      async getVideoInfo() {
        videoInfoCalls += 1
        return {
          bvid: "BV1xx411c7mD",
          ctime: 1710000000,
          pic: "https://example.com/video-cover.jpg",
          title: "测试视频标题",
          desc: "测试视频简介",
          duration: 1800,
          owner: {
            name: "测试UP主",
          },
          stat: {},
        }
      },
    },
    async () => {
      await withHarness({}, async harness => {
        const input = {
          scene: "group",
          text: "https://www.bilibili.com/video/BV1xx411c7mD",
          group_id: 991009,
          user_id: 10001,
        }

        const first = await harness.emitMessage(input)
        const second = await harness.emitMessage(input)

        assert.equal(first.ok, true)
        assert.equal(second.ok, true)
        assert.equal(videoInfoCalls, 1)
      })
    },
  )
})

test("latest dynamic query falls back to text when render fails", async () => {
  await withPatchedMethods(
    Bili,
    {
      async getFirstDynamic() {
        return {
          id: "dynamic-2",
          type: "图文",
          text: "<div>测试动态内容</div>",
          author: {
            nickname: "测试UP",
            img: "https://example.com/avatar.png",
          },
          date: "2026年04月02日 12:00:00",
          erm: "https://www.bilibili.com/opus/2",
        }
      },
    },
    async () => {
      await withHarness({}, async harness => {
        harness.bot.renderImg = async () => false

        const res = await harness.emitMessage({
          scene: "group",
          text: "#查询up最新动态123",
          group_id: 991004,
          user_id: 10001,
        })

        assert.equal(res.ok, true)
        assert.match(res.replies[0]?.text || "", /测试UP发布了新的图文动态/)
        assert.match(res.replies[0]?.text || "", /测试动态内容/)
      })
    },
  )
})

test("bilibili live room links reply with rendered image card", async () => {
  await withPatchedMethods(
    Bili,
    {
      async getRoomInfo(roomId) {
        return {
          uid: "12345",
          room_id: Number(roomId),
          area_name: "虚拟主播",
          attention: 32000,
          online: 8800,
          description: "直播间简介",
          live_status: 1,
          user_cover: "https://example.com/live-cover.jpg",
          live_time: "2026-04-09 12:00:00",
          title: "今晚直播测试",
        }
      },
      async getUserBaseInfo(uid) {
        return {
          mid: uid,
          name: "测试主播",
          face: "https://example.com/avatar.png",
        }
      },
      async getLivePlayInfo() {
        return {
          roomId: "778899",
          streams: [
            {
              url: "https://example.com/live.m3u8",
              protocolName: "http_hls",
              formatName: "ts",
              codecName: "avc",
              qn: 10000,
            },
          ],
        }
      },
    },
    async () => {
      await withPatchedMethods(
        ffmpeg,
        {
          async saveVideoClip(_input, output) {
            fs.writeFileSync(output, Buffer.from("fake-live-clip"))
            return true
          },
        },
        async () => {
          await withHarness({}, async harness => {
            const res = await harness.emitMessage({
              scene: "group",
              text: "https://live.bilibili.com/778899",
              group_id: 991005,
              user_id: 10001,
            })

            assert.equal(res.ok, true)
            const hasImageReply = res.replies.some(item =>
              Array.isArray(item?.message)
                ? item.message.some(seg => String(seg?.type || "").toLowerCase() === "image")
                : false,
            )
            const hasVideoReply = res.replies.some(item =>
              Array.isArray(item?.message)
                ? item.message.some(seg => String(seg?.type || "").toLowerCase() === "video")
                : false,
            )
            assert.equal(hasImageReply, true)
            assert.equal(hasVideoReply, true)
          })
        },
      )
    },
  )
})

test("dynamic image push falls through to native forward builder with normalized nodes", async () => {
  const groupId = 991007
  const uid = "123"
  const savedPaths = []
  cleanupGroupData(groupId)
  writeGroupData(groupId, {
    [uid]: {
      uid,
      upuid: "old-dynamic",
      nickname: "测试UP",
      img: "https://example.com/avatar.png",
    },
  })

  try {
    await withPatchedMethods(
      Bili,
      {
        async getUpdateDynamic() {
          return {
            id: "dynamic-3",
            type: "图文",
            text: "测试动态图片转发",
            author: {
              nickname: "测试UP",
              img: "https://example.com/avatar.png",
            },
            date: "2026年04月24日 12:00:00",
            erm: "https://www.bilibili.com/opus/3",
            imglist: ["https://example.com/dynamic-image.jpg"],
          }
        },
      },
      async () => {
        await withPatchedMethods(
          Download.prototype,
          {
            async downloadFile(_url, savePath) {
              savedPaths.push(savePath)
              const full = path.resolve(repoRoot, savePath)
              fs.mkdirSync(path.dirname(full), { recursive: true })
              fs.writeFileSync(full, Buffer.from("fake-image"))
              return true
            },
          },
          async () => {
            await withHarness({}, async harness => {
              const sent = []
              let fallbackBuilderInput = null
              const originalSendMessage = globalThis.Bot.sendMessage
              const originalSendMsg = globalThis.Bot.sendMsg
              const originalForwardBuilder = globalThis.Bot.makeGroupForwardMsg
              const originalBaseForward = harness.bot.makeForwardMsg

              harness.bot.makeForwardMsg = async () => [segment.image("https://example.com/not-forward-1.jpg")]
              globalThis.Bot.makeGroupForwardMsg = async messages => {
                fallbackBuilderInput = messages
                return createNativeForwardPayload(messages)
              }
              const captureSend = async (target, message) => {
                sent.push({ target, message })
                return { message_id: String(sent.length), seq: sent.length }
              }
              globalThis.Bot.sendMessage = captureSend
              globalThis.Bot.sendMsg = captureSend

              try {
                const res = await harness.runTask({
                  index: 1,
                  ctxLike: {
                    async makeGroupForwardMsg() {
                      return [segment.image("https://example.com/not-forward-2.jpg")]
                    },
                  },
                })

                assert.equal(res.ok, true)
                assert.equal(sent.length, 2)
                assert.ok(Array.isArray(fallbackBuilderInput))
                assert.ok(fallbackBuilderInput.every(item => item && typeof item === "object"))
                assert.ok(
                  fallbackBuilderInput.every(item => Object.prototype.hasOwnProperty.call(item, "message")),
                )

                const forwardPayload = Array.isArray(sent[1].message) ? sent[1].message : [sent[1].message]
                assert.ok(forwardPayload.some(item => item?.type === "forward"))
                assert.ok(!forwardPayload.some(item => item?.type === "image"))
              } finally {
                harness.bot.makeForwardMsg = originalBaseForward
                globalThis.Bot.makeGroupForwardMsg = originalForwardBuilder
                globalThis.Bot.sendMessage = originalSendMessage
                globalThis.Bot.sendMsg = originalSendMsg
              }
            })
          },
        )
      },
    )
  } finally {
    cleanupGroupData(groupId)
    for (const item of savedPaths) {
      try {
        fs.unlinkSync(path.resolve(repoRoot, item))
      } catch {}
    }
  }
})

test("dynamic image push falls back to direct images when all forward builders fail", async () => {
  const groupId = 991008
  const uid = "123"
  const savedPaths = []
  cleanupGroupData(groupId)
  writeGroupData(groupId, {
    [uid]: {
      uid,
      upuid: "old-dynamic",
      nickname: "测试UP",
      img: "https://example.com/avatar.png",
    },
  })

  try {
    await withPatchedMethods(
      Bili,
      {
        async getUpdateDynamic() {
          return {
            id: "dynamic-4",
            type: "图文",
            text: "测试动态图片兜底",
            author: {
              nickname: "测试UP",
              img: "https://example.com/avatar.png",
            },
            date: "2026年04月24日 12:10:00",
            erm: "https://www.bilibili.com/opus/4",
            imglist: ["https://example.com/dynamic-fallback.jpg"],
          }
        },
      },
      async () => {
        await withPatchedMethods(
          Download.prototype,
          {
            async downloadFile(_url, savePath) {
              savedPaths.push(savePath)
              const full = path.resolve(repoRoot, savePath)
              fs.mkdirSync(path.dirname(full), { recursive: true })
              fs.writeFileSync(full, Buffer.from("fake-image"))
              return true
            },
          },
          async () => {
            await withHarness({}, async harness => {
              const sent = []
              const originalSendMessage = globalThis.Bot.sendMessage
              const originalSendMsg = globalThis.Bot.sendMsg
              const originalForwardBuilder = globalThis.Bot.makeGroupForwardMsg
              const originalBaseForward = harness.bot.makeForwardMsg

              harness.bot.makeForwardMsg = async () => [segment.image("https://example.com/not-forward-1.jpg")]
              globalThis.Bot.makeGroupForwardMsg = async () => [segment.image("https://example.com/not-forward-3.jpg")]
              const captureSend = async (target, message) => {
                sent.push({ target, message })
                return { message_id: String(sent.length), seq: sent.length }
              }
              globalThis.Bot.sendMessage = captureSend
              globalThis.Bot.sendMsg = captureSend

              try {
                const res = await harness.runTask({
                  index: 1,
                  ctxLike: {
                    async makeGroupForwardMsg() {
                      return [segment.image("https://example.com/not-forward-2.jpg")]
                    },
                  },
                })

                assert.equal(res.ok, true)
                assert.equal(sent.length, 2)
                const fallbackPayload = Array.isArray(sent[1].message)
                  ? sent[1].message
                  : [sent[1].message]
                assert.ok(fallbackPayload.some(item => item?.type === "image"))
                assert.ok(!fallbackPayload.some(item => item?.type === "forward"))
              } finally {
                harness.bot.makeForwardMsg = originalBaseForward
                globalThis.Bot.makeGroupForwardMsg = originalForwardBuilder
                globalThis.Bot.sendMessage = originalSendMessage
                globalThis.Bot.sendMsg = originalSendMsg
              }
            })
          },
        )
      },
    )
  } finally {
    cleanupGroupData(groupId)
    for (const item of savedPaths) {
      try {
        fs.unlinkSync(path.resolve(repoRoot, item))
      } catch {}
    }
  }
})
