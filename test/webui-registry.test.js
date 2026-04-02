import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { loadPlugins } from "../src/lib/pluginLoader.js"
import { createWebUiRegistry } from "../src/lib/webui/registry.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")
const fixturesDir = path.resolve(repoRoot, "test", "fixtures", "plugins", "webui-registry")

installTestRuntime(test)

test("webui registry discovers providers and supports read/write flows", async () => {
  const plugins = await loadPlugins(fixturesDir, { cacheBust: true })
  const registry = await createWebUiRegistry(plugins)

  const list = registry.list()
  const enabled = list.find(item => item.name === "fixture-webui")
  const disabled = list.find(item => item.name === "fixture-no-webui")

  assert.equal(Boolean(enabled?.configurable), true)
  assert.equal(Boolean(disabled?.configurable), false)

  const definition = await registry.getDefinition("fixture-webui")
  assert.equal(definition.sections.length, 2)

  const globalBefore = await registry.getValues("fixture-webui", { scope: "global" })
  assert.equal(globalBefore.values.settings.enabled, true)

  const globalAfter = await registry.updateValues("fixture-webui", {
    scope: "global",
    values: {
      settings: {
        enabled: false,
      },
    },
  })
  assert.equal(globalAfter.values.settings.enabled, false)

  const scopes = await registry.listScopes("fixture-webui", "group")
  assert.deepEqual(scopes.map(item => item.id), ["10001", "10002"])

  const groupAfter = await registry.updateValues("fixture-webui", {
    scope: "group",
    scopeId: "10002",
    values: {
      threshold: 12,
    },
  })
  assert.equal(groupAfter.values.threshold, 12)
})
