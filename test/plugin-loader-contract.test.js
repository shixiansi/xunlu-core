import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { definePlugin } from "../src/plugins/define-plugin.js"
import { loadPlugins } from "../src/lib/pluginLoader.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const fixturesDir = path.resolve(__dirname, "fixtures", "plugins", "loader-contract")

installTestRuntime(test)

test("definePlugin normalizes title shortName and aliases", () => {
  const plugin = definePlugin({
    name: "demo-plugin",
    register() {},
    aliases: ["演示", "DEMO-PLUGIN"],
  })

  assert.equal(plugin.name, "demo-plugin")
  assert.equal(plugin.title, "Demo Plugin")
  assert.equal(plugin.shortName, "Demo Plugin")
  assert.deepEqual(plugin.aliases, ["demo-plugin", "Demo Plugin", "演示"])
})

test("definePlugin rejects missing plugin capabilities", () => {
  assert.throws(
    () =>
      definePlugin({
        name: "invalid-plugin",
      }),
    /at least one capability/i,
  )
})

test("loadPlugins skips invalid modules but keeps valid and webui-only plugins", async () => {
  const warnings = []
  const previousLogger = globalThis.logger
  globalThis.logger = {
    info() {},
    warn(...args) {
      warnings.push(args.map(item => String(item)).join(" "))
    },
    error() {},
  }

  try {
    const plugins = await loadPlugins(fixturesDir, { cacheBust: true })
    const names = plugins.map(item => item.name).sort()

    assert.deepEqual(names, ["valid-plugin", "webui-only"])
    assert.ok(warnings.some(item => /no default export/i.test(item)))
    assert.ok(warnings.some(item => /plugin definition must be an object/i.test(item)))
  } finally {
    globalThis.logger = previousLogger
  }
})
