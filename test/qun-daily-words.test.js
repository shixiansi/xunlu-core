import assert from "node:assert/strict"
import test from "node:test"

import { buildWordStatsFromMessages } from "../src/plugins/qun-daily/model/words.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

test("word stats strip embedded json fragments before tokenizing", () => {
  const result = buildWordStatsFromMessages([
    {
      message: [
        {
          type: "text",
          data: {
            text: '今天测试一下 {"app":"com.tencent","meta":{"detail_1":{"qqdocurl":"https://example.com"}}} 真正内容是直播切片真不错',
          },
        },
      ],
    },
  ])

  const words = result.topWords.map(item => item.word)
  assert.equal(words.includes("qqdocurl"), false)
  assert.equal(words.includes("meta"), false)
  assert.equal(words.includes("直播"), true)
})
