import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { createPluginTestHarness } from "../src/dev/plugin-test-harness.js"
import diangePlugin from "../src/plugins/diange/index.js"
import musicService from "../src/plugins/diange/services/music-service.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")

installTestRuntime(test)

async function withHarness(options, fn) {
  const harness = await createPluginTestHarness({
    plugins: [diangePlugin],
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

test("diange sends song image card before follow-up media", async () => {
  const voicePath = path.resolve(repoRoot, "temp", "diange", "single-song.mp3")

  await withPatchedMethods(
    musicService,
    {
      async searchSongs() {
        return [
          {
            id: 123456,
            name: "稻香",
            artists: "周杰伦",
            album: "魔杰座",
            cover: "https://example.com/cover.jpg",
          },
        ]
      },
      buildMusicCard() {
        return null
      },
      async downloadSongAudio() {
        fs.mkdirSync(path.dirname(voicePath), { recursive: true })
        fs.writeFileSync(voicePath, Buffer.from("fake-audio"))
        return voicePath
      },
      cleanupFiles() {},
    },
    async () => {
      await withHarness({ protocol: "onebotv11" }, async harness => {
        const res = await harness.emitMessage({
          scene: "group",
          text: "点歌 稻香",
          group_id: 996001,
          user_id: 10001,
        })

        const hasImageReply = res.replies.some(item =>
          Array.isArray(item?.message)
            ? item.message.some(seg => String(seg?.type || "").toLowerCase() === "image")
            : false,
        )
        assert.equal(hasImageReply, true)

        const hasRecordReply = res.replies.some(item =>
          Array.isArray(item?.message)
            ? item.message.some(seg => String(seg?.type || "").toLowerCase() === "record")
            : false,
        )
        assert.equal(hasRecordReply, true)
      })

      try {
        fs.unlinkSync(voicePath)
      } catch {}
    },
  )
})

test("music service builds netease music card payload", () => {
  const payload = musicService.buildMusicCard({
    id: 123456,
    name: "稻香",
  })

  assert.deepEqual(payload, [{ type: "music", data: { type: "163", id: "123456" } }])
})

test("music service builds qq custom music card payload", () => {
  const payload = musicService.buildMusicCard({
    id: 100,
    name: "我爱你",
    artists: "歌手",
    cover: "https://example.com/pic.jpg",
    songmid: "mid001",
    source: "qq",
  })

  assert.deepEqual(payload, [
    {
      type: "music",
      data: {
        type: "custom",
        url: "https://y.qq.com/n/ryqq/songDetail/mid001",
        audio: "https://ws.stream.qqmusic.qq.com/C100mid001.m4a",
        title: "我爱你",
        content: "歌手",
        image: "https://example.com/pic.jpg",
      },
    },
  ])
})

test("music service ranks merged netease and qq candidates by keyword", async () => {
  await withPatchedMethods(
    musicService,
    {
      async searchNeteaseSongs() {
        return [
          {
            id: 1,
            name: "我爱你",
            artists: "陈百强",
            album: "专辑A",
            cover: "",
            source: "163",
            sourceLabel: "网易云",
          },
          {
            id: 2,
            name: "晚安",
            artists: "其他歌手",
            album: "专辑B",
            cover: "",
            source: "163",
            sourceLabel: "网易云",
          },
        ]
      },
      async searchQqSongs() {
        return [
          {
            id: 3,
            name: "我爱的人",
            artists: "歌手A",
            album: "专辑C",
            cover: "",
            songmid: "mid003",
            source: "qq",
            sourceLabel: "QQ音乐",
          },
          {
            id: 4,
            name: "我爱你",
            artists: "歌手B",
            album: "专辑D",
            cover: "",
            songmid: "mid004",
            source: "qq",
            sourceLabel: "QQ音乐",
          },
        ]
      },
    },
    async () => {
      const songs = await musicService.searchSongs("我爱你", 4)

      assert.equal(songs.length, 4)
      assert.equal(songs[0]?.id, 1)
      assert.equal(songs[0]?.source, "163")
      assert.equal(songs[1]?.id, 4)
      assert.equal(songs[1]?.source, "qq")
      assert.equal(songs[2]?.id, 3)
      assert.equal(songs[3]?.id, 2)
    },
  )
})

test("diange waits for user selection before sending duplicate song names", async () => {
  await withPatchedMethods(
    musicService,
    {
      async searchSongs() {
        return [
          {
            id: 111111,
            name: "晴天",
            artists: "周杰伦",
            album: "叶惠美",
            cover: "https://example.com/cover-1.jpg",
          },
          {
            id: 222222,
            name: "晴天",
            artists: "五月天",
            album: "Live 巡演版",
            cover: "https://example.com/cover-2.jpg",
          },
        ]
      },
      buildMusicCard() {
        return null
      },
      async getSongAudioUrl() {
        return "http://example.com/test.mp3"
      },
      async downloadSongAudio() {
        throw new Error("milky should use official audio url instead of local download")
      },
      cleanupFiles() {},
    },
    async () => {
      await withHarness({}, async harness => {
        const searchRes = await harness.emitMessage({
          scene: "group",
          text: "点歌 晴天",
          group_id: 996002,
          user_id: 10001,
        })

        assert.equal(searchRes.ok, true)
        assert.equal(searchRes.renderCalls.length, 1)
        assert.equal(searchRes.renderCalls[0]?.name, "diange")
        assert.equal(searchRes.renderCalls[0]?.data?.songs?.length, 2)
        assert.match(searchRes.replies[1]?.text || "", /请回复 1-2 的序号选择歌曲/)

        const hasRecordBeforeSelect = searchRes.replies.some(item =>
          Array.isArray(item?.message)
            ? item.message.some(seg => String(seg?.type || "").toLowerCase() === "record")
            : false,
        )
        assert.equal(hasRecordBeforeSelect, false)

        harness.resetCaptures()

        const selectRes = await harness.emitMessage({
          scene: "group",
          text: "选2",
          group_id: 996002,
          user_id: 10001,
        })

        assert.equal(selectRes.ok, true)
        assert.equal(selectRes.renderCalls.length, 1)
        assert.equal(selectRes.renderCalls[0]?.data?.songId, "222222")
        assert.equal(selectRes.renderCalls[0]?.data?.songName, "晴天")
        assert.equal(selectRes.renderCalls[0]?.data?.artists, "五月天")

        const hasRecordAfterSelect = selectRes.replies.some(item =>
          Array.isArray(item?.message)
            ? item.message.some(seg => String(seg?.type || "").toLowerCase() === "record")
            : false,
        )
        assert.equal(hasRecordAfterSelect, true)

        harness.resetCaptures()

        const afterRes = await harness.emitMessage({
          scene: "group",
          text: "1",
          group_id: 996002,
          user_id: 10001,
        })

        assert.equal(afterRes.ok, true)
        assert.equal(afterRes.replies.length, 0)
      })
    },
  )
})

test("diange keeps selection context after invalid input and allows cancel", async () => {
  const voicePath = path.resolve(repoRoot, "temp", "diange", "test-song.mp3")

  await withPatchedMethods(
    musicService,
    {
      async searchSongs() {
        return [
          {
            id: 654321,
            name: "晴天",
            artists: "周杰伦",
            album: "叶惠美",
            cover: "https://example.com/cover2.jpg",
          },
          {
            id: 654322,
            name: "晴天",
            artists: "周杰伦",
            album: "演唱会",
            cover: "https://example.com/cover3.jpg",
          },
        ]
      },
      buildMusicCard() {
        return null
      },
      async downloadSongAudio() {
        fs.mkdirSync(path.dirname(voicePath), { recursive: true })
        fs.writeFileSync(voicePath, Buffer.from("fake-audio"))
        return voicePath
      },
      cleanupFiles() {},
    },
    async () => {
      await withHarness({}, async harness => {
        const startRes = await harness.emitMessage({
          scene: "group",
          text: "点歌 晴天",
          group_id: 996003,
          user_id: 10001,
        })

        assert.equal(startRes.ok, true)

        harness.resetCaptures()

        const invalidRes = await harness.emitMessage({
          scene: "group",
          text: "第9首",
          group_id: 996003,
          user_id: 10001,
        })

        assert.equal(invalidRes.ok, true)
        assert.match(invalidRes.replies[0]?.text || "", /请输入 1-2 的序号/)

        harness.resetCaptures()

        const cancelRes = await harness.emitMessage({
          scene: "group",
          text: "取消",
          group_id: 996003,
          user_id: 10001,
        })

        assert.equal(cancelRes.ok, true)
        assert.match(cancelRes.replies[0]?.text || "", /已取消点歌/)

        harness.resetCaptures()

        const afterRes = await harness.emitMessage({
          scene: "group",
          text: "1",
          group_id: 996003,
          user_id: 10001,
        })

        assert.equal(afterRes.ok, true)
        assert.equal(afterRes.replies.length, 0)
      })
    },
  )

  try {
    fs.unlinkSync(voicePath)
  } catch {}
})

test("diange falls back to song page when official audio url is unavailable", async () => {
  await withPatchedMethods(
    musicService,
    {
      async searchSongs() {
        return [
          {
            id: 354750,
            name: "奢香夫人",
            artists: "凤凰传奇",
            album: "最炫民族风",
            cover: "https://example.com/cover-x.jpg",
          },
        ]
      },
      buildMusicCard() {
        return null
      },
      async getSongAudioUrl() {
        return ""
      },
      async downloadSongAudio() {
        throw new Error("download should not run when official audio url is unavailable")
      },
      cleanupFiles() {},
    },
    async () => {
      await withHarness({}, async harness => {
        const res = await harness.emitMessage({
          scene: "group",
          text: "点歌 奢香夫人",
          group_id: 996004,
          user_id: 10001,
        })

        assert.equal(res.ok, true)
        assert.equal(res.renderCalls.length, 1)
        assert.match(res.replies[1]?.text || "", /歌曲页：https:\/\/y\.music\.163\.com\/m\/song\?id=354750/)
      })
    },
  )
})
