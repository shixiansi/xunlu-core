import test from "node:test"
import assert from "node:assert/strict"

import {
  RkeyService,
  applyRkeyToUrl,
  extractRkeySuffixFromUrl,
  stripRkeyFromUrl,
} from "../src/utils/rkey.js"

test("rkey url helpers extract, strip and replace suffixes", () => {
  const url = "https://multimedia.nt.qq.com.cn/download?appid=1407&fileid=abc&rkey=oldValue"
  assert.equal(extractRkeySuffixFromUrl(url), "&rkey=oldValue")
  assert.equal(
    stripRkeyFromUrl(url),
    "https://multimedia.nt.qq.com.cn/download?appid=1407&fileid=abc",
  )
  assert.equal(
    applyRkeyToUrl(url, "&rkey=newValue"),
    "https://multimedia.nt.qq.com.cn/download?appid=1407&fileid=abc&rkey=newValue",
  )
  assert.equal(
    extractRkeySuffixFromUrl("https://multimedia.nt.qq.com.cn/download?appid=1407&reky=legacy"),
    "&reky=legacy",
  )
})

test("fresh local scene cache bypasses server refresh", async () => {
  let fetchCalls = 0
  const service = new RkeyService({
    now: () => 1_700_000_000_000,
    initialCache: {
      group_rkey: "&rkey=local-group",
      group_expired_time: 1_700_000_000 + 1200,
      private_rkey: "",
      private_expired_time: 0,
    },
    fetchImpl: async () => {
      fetchCalls += 1
      throw new Error("should not fetch")
    },
    getRuntimeBot: () => null,
  })

  const res = await service.getSceneRkey("group")
  assert.deepEqual(res, {
    value: "&rkey=local-group",
    expired_time: 1_700_000_000 + 1200,
  })
  assert.equal(fetchCalls, 0)
})

test("expired server data falls back to onebot private probe", async () => {
  let fetchCalls = 0
  const bot = {
    adapterType: "onebotv11",
    async sendMessage(target) {
      assert.equal(target, "10001")
      return { message_id: 123 }
    },
    async getMessage(messageId) {
      assert.equal(messageId, 123)
      return {
        message: [
          {
            type: "image",
            data: {
              url: "https://multimedia.nt.qq.com.cn/download?appid=1407&fileid=abc&rkey=privateProbe",
            },
          },
        ],
      }
    },
  }

  const service = new RkeyService({
    now: () => 1_700_000_000_000,
    fetchImpl: async () => {
      fetchCalls += 1
      return {
        group_rkey: "&rkey=server-group",
        private_rkey: "&rkey=server-private",
        expired_time: 1_699_999_000,
      }
    },
    getRuntimeBot: () => bot,
    loadMasterList: async () => ["10001"],
  })

  const res = await service.getSceneRkey("private")
  assert.equal(fetchCalls, 1)
  assert.equal(res.value, "&rkey=privateProbe")
  assert.equal(res.expired_time, 1_700_000_000 + 1800)
})

test("expired server data falls back to onebot group probe and recalls message", async () => {
  const calls = []
  const bot = {
    adapterType: "onebotv11",
    async getGroupList() {
      return new Map([[20001, { group_id: 20001 }]])
    },
    async sendMessage(target) {
      calls.push(["send", target])
      return { message_id: 456 }
    },
    async getMessage(messageId) {
      calls.push(["get", messageId])
      return {
        message: [
          {
            type: "image",
            data: {
              url: "https://multimedia.nt.qq.com.cn/download?appid=1407&fileid=abc&reky=groupProbe",
            },
          },
        ],
      }
    },
    async recallMessage(input) {
      calls.push(["recall", input.group_id, input.message_id])
      return true
    },
  }

  const service = new RkeyService({
    now: () => 1_700_000_000_000,
    fetchImpl: async () => ({
      group_rkey: "",
      private_rkey: "",
      expired_time: 1_699_999_000,
    }),
    getRuntimeBot: () => bot,
    loadMasterList: async () => [],
    random: () => 0,
  })

  const res = await service.getSceneRkey("group")
  assert.equal(res.value, "&reky=groupProbe")
  assert.equal(res.expired_time, 1_700_000_000 + 1800)
  assert.deepEqual(calls, [
    ["send", { group_id: 20001 }],
    ["get", 456],
    ["recall", 20001, 456],
  ])
})

test("milky probe uses get_message payload and bundle expiry reflects both scenes", async () => {
  const calls = []
  const bot = {
    adapterType: "milky",
    async getGroupList() {
      return [{ group_id: 30001 }]
    },
    async sendMessage(target) {
      calls.push(["send", target])
      return { message_seq: 789 }
    },
    async getMessage(payload) {
      calls.push(["get", payload])
      return {
        message: {
          segments: [
            {
              type: "image",
              data: {
                temp_url:
                  "https://multimedia.nt.qq.com.cn/download?appid=1407&fileid=abc&rkey=milkyGroup",
              },
            },
          ],
        },
      }
    },
    async recallMessage(input) {
      calls.push(["recall", input.group_id, input.message_seq])
      return true
    },
  }

  const service = new RkeyService({
    now: () => 1_700_000_000_000,
    initialCache: {
      private_rkey: "&rkey=privateFresh",
      private_expired_time: 1_700_000_000 + 1500,
    },
    fetchImpl: async () => ({
      group_rkey: "",
      private_rkey: "",
      expired_time: 1_699_999_000,
    }),
    getRuntimeBot: () => bot,
    loadMasterList: async () => ["10001"],
    random: () => 0,
  })

  const scene = await service.getSceneRkey("group")
  assert.equal(scene.value, "&rkey=milkyGroup")
  assert.deepEqual(calls, [
    ["send", { group_id: 30001 }],
    [
      "get",
      {
        message_scene: "group",
        peer_id: 30001,
        message_seq: 789,
      },
    ],
    ["recall", 30001, 789],
  ])

  const bundle = await service.getRkeyBundle()
  assert.equal(bundle.group_rkey, "&rkey=milkyGroup")
  assert.equal(bundle.private_rkey, "&rkey=privateFresh")
  assert.equal(bundle.expired_time, 1_700_000_000 + 1500)
})
