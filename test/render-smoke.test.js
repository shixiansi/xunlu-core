import assert from "node:assert/strict"
import test from "node:test"

import { createPluginTestHarness } from "../src/dev/plugin-test-harness.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

const shouldRun = Boolean(process.env.XUNLU_RUN_RENDER_TESTS)

installTestRuntime(test)

test(
  "real render smoke",
  { skip: !shouldRun },
  async () => {
    const harness = await createPluginTestHarness({
      plugins: ["help"],
      protocol: "milky",
      renderMode: "real",
    })
    try {
      const res = await harness.emitMessage({
        scene: "group",
        text: "帮助",
        group_id: 123,
        user_id: 1765629830,
      })
      assert.equal(res.ok, true)
      assert.ok(res.replies.length >= 1)
    } finally {
      await harness.dispose()
    }
  },
)
