import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { createPluginTestHarness } from "../src/dev/plugin-test-harness.js"
import bilibiliPlugin from "../src/plugins/bilibili/index.js"
import Bili from "../src/plugins/bilibili/model/Bilili.js"
import ffmpeg from "../src/component/ffmpeg/ffmpeg.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")

installTestRuntime(test)

function getGroupDataFile(groupId) {
  return path.resolve(
    repoRoot,
    "src",
    "plugins",
    "bilibili",
    "data",
    "group",
    `${groupId}.json`,
  )
}

function cleanupGroupData(groupId) {
  try {
    fs.unlinkSync(getGroupDataFile(groupId))
  } catch {}
}

function readGroupData(groupId) {
  return JSON.parse(fs.readFileSync(getGroupDataFile(groupId), "utf8"))
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

test("bilibili live room links reply with room info and a 10-second clip", async () => {
  const liveClipPath = path.resolve(
    repoRoot,
    "src",
    "plugins",
    "bilibili",
    "resources",
    "video",
    "live_test_clip.mp4",
  )

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
            assert.match(res.replies[0]?.text || "", /测试主播/)
            assert.match(res.replies[0]?.text || "", /今晚直播测试/)
            const hasVideoReply = res.replies.some(item =>
              Array.isArray(item?.message)
                ? item.message.some(seg => String(seg?.type || "").toLowerCase() === "video")
                : false,
            )
            assert.equal(hasVideoReply, true)
          })
        },
      )
    },
  )

  try {
    fs.unlinkSync(liveClipPath)
  } catch {}
})
