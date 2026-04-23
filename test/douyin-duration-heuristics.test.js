import assert from "node:assert/strict"
import test from "node:test"

import { getVideoSkipReason } from "../src/plugins/douyin/controllers/handlers.js"
import { normalizeDouyinAweme } from "../src/plugins/douyin/services/douyin-service.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

function createMockStreamedVideoAweme({ duration = 600, streams = [], video = {}, ...overrides } = {}) {
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
    link: "https://www.douyin.com/video/7499999999999999999",
    publishedAt: "2026-04-08 12:00:00",
    ...overrides,
    video: {
      url: "https://example.com/video.mp4",
      duration,
      streams: Array.isArray(streams) ? streams.filter(item => item?.url) : [],
      ...video,
    },
  }
}

test("normalizeDouyinAweme infers series video duration from stream size instead of raw unit ambiguity", () => {
  const aweme = normalizeDouyinAweme({
    aweme_id: "7628865241719624561",
    desc: "夫人 #第五人格",
    duration: 9667,
    author: {
      uid: "3158224971767967",
      nickname: "五更百鬼🐢",
      avatar_thumb: {
        url_list: ["https://example.com/avatar.jpg"],
      },
    },
    music: {
      duration: 209,
      title: "The Juice",
    },
    video: {
      cover: {
        url_list: ["https://example.com/cover.jpg"],
      },
      bit_rate: [
        {
          bit_rate: 1795649,
          height: 1024,
          width: 576,
          gear_name: "normal_540_0",
          play_addr: {
            data_size: 2169818,
            url_list: ["https://example.com/video.mp4"],
          },
        },
      ],
    },
  })

  assert.equal(aweme.video.duration, 10)
  assert.equal(aweme.music.duration, 209)
})

test("getVideoSkipReason skips media sending when every stream exceeds size limit", () => {
  const reason = getVideoSkipReason(
    createMockStreamedVideoAweme({
      duration: 20,
      streams: [
        {
          url: "https://example.com/video-1080.mp4",
          qualityLabel: "1080P",
          height: 1080,
          dataSize: 90 * 1024 * 1024,
        },
        {
          url: "https://example.com/video-720.mp4",
          qualityLabel: "720P",
          height: 720,
          dataSize: 80 * 1024 * 1024,
        },
      ],
    }),
  )

  assert.match(reason, /所有可用清晰度均超过/)
})
