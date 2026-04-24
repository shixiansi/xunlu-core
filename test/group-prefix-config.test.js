import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import assert from "node:assert/strict"
import test from "node:test"

import YamlReader from "../src/utils/YamlReader.js"
import {
  formatGroupPrefixState,
  getCurrentGroupPrefixState,
  setCurrentGroupPrefix,
  setCurrentGroupPrefixEnabled,
} from "../src/plugins/set/model/prefix-config.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

test("yunzai prefix helper writes current group alias into host group.yaml", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "xunlu-yunzai-group-"))
  const groupFilePath = path.join(tempDir, "group.yaml")
  fs.writeFileSync(
    groupFilePath,
    "default:\n  onlyReplyAt: 0\n  botAlias:\n    - 云崽\n123456:\n  onlyReplyAt: 0\n",
    "utf8",
  )

  try {
    const state = await setCurrentGroupPrefix(123456, "小寻", {
      envName: "QQBot-YunZai",
      groupFilePath,
      loadGroupConfig: async groupId => {
        const data = new YamlReader(groupFilePath).jsonData
        return {
          ...(data?.default || {}),
          ...(data?.[String(groupId)] || {}),
        }
      },
    })

    const saved = new YamlReader(groupFilePath).jsonData
    assert.deepEqual(saved?.["123456"]?.botAlias, ["小寻"])
    assert.equal(state.prefix, "小寻")
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test("standalone prefix helper enables current group and falls back to hash alias", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "xunlu-standalone-group-"))
  const groupFilePath = path.join(tempDir, "group.config.yaml")
  fs.writeFileSync(groupFilePath, "default:\n  prefix_enabled: false\n  botAlias: []\n", "utf8")

  try {
    const reader = new YamlReader(groupFilePath)
    const state = await setCurrentGroupPrefixEnabled(123456, true, {
      envName: "xunlu-core",
      standaloneReader: reader,
    })

    const saved = new YamlReader(groupFilePath).jsonData
    assert.equal(saved?.["123456"]?.prefix_enabled, true)
    assert.deepEqual(saved?.["123456"]?.botAlias, ["#"])
    assert.equal(state.enabled, true)
    assert.equal(state.prefix, "#")
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test("prefix state formatter includes current prefix and enable status", () => {
  const text = formatGroupPrefixState({
    enabled: true,
    aliases: ["云崽"],
  })

  assert.match(text, /当前群前缀：云崽/)
  assert.match(text, /当前群前缀限制：开启/)
})

test("standalone prefix state merges default and group override", async () => {
  const state = await getCurrentGroupPrefixState(123456, {
    envName: "xunlu-core",
    standaloneConfigData: {
      default: {
        prefix_enabled: false,
        botAlias: ["#"],
      },
      "123456": {
        prefix_enabled: true,
        botAlias: ["云崽"],
      },
    },
  })

  assert.equal(state.enabled, true)
  assert.deepEqual(state.aliases, ["云崽"])
  assert.equal(state.prefix, "云崽")
})
