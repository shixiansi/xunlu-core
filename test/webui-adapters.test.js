import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { Worker } from "node:worker_threads"
import { fileURLToPath, pathToFileURL } from "node:url"

import { installTestRuntime } from "./helpers/test-runtime.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")
const tempDirs = new Set()

let workspaceRunQueue = Promise.resolve()

installTestRuntime(test)

function toModuleUrl(relativePath) {
  return pathToFileURL(path.resolve(repoRoot, relativePath)).href
}

function createTempWorkspace({ masters = ["10001"] } = {}) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "xunlu-webui-adapter-"))
  tempDirs.add(workspace)

  fs.mkdirSync(path.join(workspace, "config", "default_config"), { recursive: true })
  fs.writeFileSync(
    path.join(workspace, "package.json"),
    JSON.stringify(
      {
        name: "xunlu-core",
        type: "module",
      },
      null,
      2,
    ),
    "utf8",
  )

  const masterLines = (Array.isArray(masters) && masters.length ? masters : ["10001"])
    .map(id => `  - "${String(id)}"`)
    .join("\n")

  fs.writeFileSync(
    path.join(workspace, "config", "default_config", "bot.config.yaml"),
    `masterQQ:\n${masterLines}\n`,
    "utf8",
  )

  return workspace
}

async function runWorkspaceScript(workspace, scriptBody) {
  const runTask = async () => {
    const previousCwd = process.cwd()
    process.chdir(workspace)

    const workerSource = `
      import { parentPort } from "node:worker_threads"

      console.log = () => {}
      console.info = () => {}
      console.warn = () => {}

      try {
        const result = await (async () => {
${scriptBody}
        })()
        parentPort.postMessage({ ok: true, result })
      } catch (error) {
        parentPort.postMessage({
          ok: false,
          error: {
            message: error?.message || String(error),
            stack: error?.stack || "",
          },
        })
      }
    `

    const worker = new Worker(workerSource, { eval: true, type: "module" })

    try {
      const message = await new Promise((resolve, reject) => {
        let settled = false

        worker.once("message", payload => {
          settled = true
          resolve(payload)
        })

        worker.once("error", error => {
          settled = true
          reject(error)
        })

        worker.once("exit", code => {
          if (!settled && code !== 0) {
            reject(new Error(`worker exited with code ${code}`))
          }
        })
      })

      if (!message?.ok) {
        const detail = message?.error?.stack || message?.error?.message || "worker script failed"
        throw new Error(detail)
      }

      return message.result
    } finally {
      try {
        await worker.terminate()
      } catch {}
      process.chdir(previousCwd)
    }
  }

  const queued = workspaceRunQueue.then(runTask)
  workspaceRunQueue = queued.catch(() => {})
  return await queued
}

test.after(() => {
  for (const dir of tempDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {}
  }
  tempDirs.clear()
})

test("group webui adapter persists global, bot, and group configs", async () => {
  const workspace = createTempWorkspace()
  const result = await runWorkspaceScript(
    workspace,
    `
          const fs = await import("node:fs")
          const path = await import("node:path")

          globalThis.Bot = {
            uin: 90001,
            gl: new Map([[12345, { group_name: "Alpha" }]]),
            async getGroupList() {
              return [{ group_id: 67890, group_name: "Beta" }]
            },
          }

          const { default: provider } = await import(${JSON.stringify(toModuleUrl("src/plugins/group/webui/index.js"))})

          const before = await provider.getValues({ scope: "global" })
          const botScopes = await provider.listScopes({ scope: "bot" })
          const groupScopes = await provider.listScopes({ scope: "group" })

          const botAfter = await provider.updateValues({
            scope: "bot",
            scopeId: "90001",
            values: {
              config: {
                friend_message: true,
                group_invite: true,
              },
            },
          })

          const groupAfter = await provider.updateValues({
            scope: "group",
            scopeId: "12345",
            values: {
              config: {
                group_message: true,
                bot_muted: true,
              },
            },
          })

          const globalAfter = await provider.updateValues({
            scope: "global",
            values: {
              system: {
                notify_all_masters: true,
                cache_ttl_sec: 90,
              },
              global: {
                friend_list_change: true,
              },
            },
          })

          const store = JSON.parse(
            fs.readFileSync(path.join(process.cwd(), "data", "group", "notice-settings.json"), "utf8"),
          )

          return {
            before,
            botScopes,
            groupScopes,
            botAfter,
            groupAfter,
            globalAfter,
            store,
          }
`,
  )

  assert.equal(result.before.values.system.notify_all_masters, false)
  assert.equal(result.before.values.system.cache_ttl_sec, 60)
  assert.deepEqual(result.botScopes.map(item => item.id), ["90001"])
  assert.deepEqual(result.groupScopes.map(item => item.id), ["12345", "67890"])
  assert.equal(result.botAfter.values.config.friend_message, true)
  assert.equal(result.botAfter.values.config.group_invite, true)
  assert.equal(result.groupAfter.values.config.group_message, true)
  assert.equal(result.groupAfter.values.config.bot_muted, true)
  assert.equal(result.globalAfter.values.system.notify_all_masters, true)
  assert.equal(result.globalAfter.values.system.cache_ttl_sec, 90)
  assert.equal(result.globalAfter.values.global.friend_list_change, true)

  assert.equal(result.store.system.notify_all_masters, true)
  assert.equal(result.store.system.cache_ttl_sec, 90)
  assert.equal(result.store.global.friend_list_change, true)
  assert.equal(result.store.bots["90001"].friend_message, true)
  assert.equal(result.store.bots["90001"].group_invite, true)
  assert.equal(result.store.groups["12345"].group_message, true)
  assert.equal(result.store.groups["12345"].bot_muted, true)
})

test("scheduler webui adapter normalizes tasks and reloads claimed runtime", async () => {
  const workspace = createTempWorkspace()
  const result = await runWorkspaceScript(
    workspace,
    `
          const fs = await import("node:fs")

          const runtimeModule = await import(${JSON.stringify(toModuleUrl("src/plugins/scheduler/model/runtime.js"))})
          const storeModule = await import(${JSON.stringify(toModuleUrl("src/plugins/scheduler/model/store.js"))})
          const { default: provider } = await import(${JSON.stringify(toModuleUrl("src/plugins/scheduler/webui/index.js"))})

          let reloadCount = 0
          runtimeModule.claimSchedulerRuntime({
            shutdown() {},
            reloadFromDisk() {
              reloadCount += 1
              const store = new storeModule.SchedulerStore()
              const loaded = store.load()
              return {
                ...loaded,
                scheduledCount: loaded.config.tasks.length,
              }
            },
          })

          const before = await provider.getValues()
          const after = await provider.updateValues({
            values: {
              tasks: [
                {
                  id: "morning_msg",
                  enabled: true,
                  schedule: { expr: "0 15 8 * * *" },
                  target: { scene: "group", id: "12345" },
                  action: { type: "message", text: "早上好", mentions: ["10001"] },
                  creator: { user_id: "10001" },
                },
                {
                  id: "daily_cmd",
                  schedule: { expr: "0 0 9 * * *" },
                  target: { scene: "private", id: "20002" },
                  action: { type: "command", raw_command: "#帮助" },
                  creator: { user_id: "10001" },
                },
                {
                  id: "daily_cmd",
                  schedule: { expr: "0 0 9 * * *" },
                  target: { scene: "private", id: "20002" },
                  action: { type: "command", raw_command: "#重复" },
                  creator: { user_id: "10001" },
                },
                {
                  id: "broken_task",
                  schedule: { expr: "bad expr" },
                  target: { scene: "group", id: "99999" },
                  action: { type: "message", text: "bad" },
                  creator: { user_id: "10001" },
                },
              ],
            },
          })

          const storedText = fs.readFileSync(storeModule.getDefaultSchedulerConfigPath(), "utf8")
          const stored = new storeModule.SchedulerStore().load()

          return {
            before,
            after,
            reloadCount,
            storedText,
            stored,
          }
`,
  )

  assert.deepEqual(result.before.values.tasks, [])
  assert.equal(result.reloadCount, 1)
  assert.equal(result.after.values.tasks.length, 2)
  assert.deepEqual(result.after.values.tasks.map(item => item.id), ["morning_msg", "daily_cmd"])
  assert.match(result.storedText, /morning_msg/)
  assert.match(result.storedText, /daily_cmd/)
  assert.equal(result.stored.config.tasks.length, 2)
  assert.deepEqual(result.stored.config.tasks.map(item => item.id), ["morning_msg", "daily_cmd"])
  assert.equal(result.stored.config.tasks[0].action.type, "message")
  assert.equal(result.stored.config.tasks[1].action.type, "command")
})

test("other webui adapter exposes master defaults and saves user overrides", async () => {
  const workspace = createTempWorkspace({ masters: ["10001", "10002"] })
  const result = await runWorkspaceScript(
    workspace,
    `
          const fs = await import("node:fs")
          const path = await import("node:path")

          const { default: provider } = await import(${JSON.stringify(toModuleUrl("src/plugins/other/webui/index.js"))})

          const scopesBefore = await provider.listScopes({ scope: "user" })
          const masterBefore = await provider.getValues({ scope: "user", scopeId: "10001" })

          const saved = await provider.updateValues({
            scope: "user",
            scopeId: "20002",
            values: {
              config: {
                enabled: false,
                reactions: ["233", "277", "233"],
              },
            },
          })

          const scopesAfter = await provider.listScopes({ scope: "user" })
          const stored = JSON.parse(
            fs.readFileSync(path.join(process.cwd(), "data", "other-reaction.json"), "utf8"),
          )

          return {
            scopesBefore,
            masterBefore,
            saved,
            scopesAfter,
            stored,
          }
`,
  )

  assert.deepEqual(result.scopesBefore.map(item => item.id), ["10001", "10002"])
  assert.equal(result.masterBefore.values.config.enabled, true)
  assert.deepEqual(result.masterBefore.values.config.reactions, [277])
  assert.equal(result.saved.values.config.enabled, false)
  assert.deepEqual(result.saved.values.config.reactions, [233, 277])
  assert.deepEqual(result.scopesAfter.map(item => item.id), ["10001", "10002", "20002"])
  assert.equal(result.stored.users["20002"].enabled, false)
  assert.deepEqual(result.stored.users["20002"].reactions, [233, 277])
  assert.equal(result.stored.users["20002"].reaction, 233)
})

test("chuo webui adapter toggles the shared config file", async () => {
  const workspace = createTempWorkspace()
  const result = await runWorkspaceScript(
    workspace,
    `
          const fs = await import("node:fs")

          const { getChuoConfigPath } = await import(${JSON.stringify(toModuleUrl("src/plugins/chuo/model/config.js"))})
          const { default: provider } = await import(${JSON.stringify(toModuleUrl("src/plugins/chuo/webui/index.js"))})

          const before = await provider.getValues()
          const after = await provider.updateValues({
            values: {
              settings: {
                enabled: false,
              },
            },
          })

          const stored = JSON.parse(fs.readFileSync(getChuoConfigPath(), "utf8"))

          return {
            before,
            after,
            stored,
          }
`,
  )

  assert.equal(result.before.values.settings.enabled, true)
  assert.equal(result.after.values.settings.enabled, false)
  assert.equal(result.stored.enabled, false)
})
