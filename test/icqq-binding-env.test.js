import assert from "node:assert/strict"
import test from "node:test"

import { createIcqqBinding } from "../src/runtime/drivers/icqq-binding.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

test("icqq binding detects wrapped onebot adapter before QQNT heuristic", () => {
  const binding = createIcqqBinding()
  const envName = binding.detectEnv({
    uin: 1765629830,
    QQNT: true,
    botQQ: 2548285036,
    2548285036: {
      adapter: {
        name: "OneBotV11",
      },
    },
  })

  assert.equal(envName, "OneBotv11")
})
