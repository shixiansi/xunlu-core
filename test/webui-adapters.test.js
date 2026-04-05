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

  const sourceDefaultConfigDir = path.join(repoRoot, "config", "default_config")
  const targetDefaultConfigDir = path.join(workspace, "config", "default_config")

  fs.mkdirSync(targetDefaultConfigDir, { recursive: true })
  fs.cpSync(sourceDefaultConfigDir, targetDefaultConfigDir, { recursive: true })

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
    path.join(targetDefaultConfigDir, "bot.config.yaml"),
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

test("ai webui adapter persists caimiao and siliconflow settings", async () => {
  const workspace = createTempWorkspace()
  const result = await runWorkspaceScript(
    workspace,
    `
          const configModule = await import(${JSON.stringify(toModuleUrl("src/lib/config.js"))})
          const { default: provider } = await import(${JSON.stringify(toModuleUrl("src/plugins/ai/webui/index.js"))})

          const before = await provider.getValues()
          const after = await provider.updateValues({
            values: {
              caimiao: {
                "x-token": "token-123",
                proxy: "http://127.0.0.1:7890",
              },
              siliconflow: {
                base_url: "https://example.com/v1/chat/completions",
                api_key: "sf-key-456",
                model: "test-model",
                timeout_ms: 45000,
                max_history: 12,
                trigger_mode: "wake_only",
                fallback_persona_enabled: false,
                fallback_persona_prompt: "第一行\\n第二行\\n第三行",
                wake_words: "荨鹿, 调度器",
              },
            },
          })
          const stored = configModule.default.getConfig("ai")

          return {
            before,
            after,
            stored,
          }
`,
  )

  assert.equal(result.before.values.caimiao["x-token"], "")
  assert.equal(result.before.values.caimiao.proxy, "")
  assert.equal(result.before.values.siliconflow.base_url, "https://api.siliconflow.cn/v1/chat/completions")
  assert.equal(result.before.values.siliconflow.fallback_persona_enabled, true)
  assert.match(result.before.values.siliconflow.fallback_persona_prompt, /亚托莉|Atri/)
  assert.equal(result.after.values.caimiao["x-token"], "token-123")
  assert.equal(result.after.values.caimiao.proxy, "http://127.0.0.1:7890")
  assert.equal(result.after.values.siliconflow.base_url, "https://example.com/v1/chat/completions")
  assert.equal(result.after.values.siliconflow.api_key, "sf-key-456")
  assert.equal(result.after.values.siliconflow.model, "test-model")
  assert.equal(result.after.values.siliconflow.timeout_ms, 45000)
  assert.equal(result.after.values.siliconflow.max_history, 12)
  assert.equal(result.after.values.siliconflow.trigger_mode, "wake_only")
  assert.equal(result.after.values.siliconflow.fallback_persona_enabled, false)
  assert.equal(result.after.values.siliconflow.fallback_persona_prompt, "第一行\n第二行\n第三行")
  assert.equal(result.after.values.siliconflow.wake_words, "荨鹿, 调度器")
  assert.equal(result.stored.caimiao["x-token"], "token-123")
  assert.equal(result.stored.caimiao.proxy, "http://127.0.0.1:7890")
  assert.equal(result.stored.siliconflow.base_url, "https://example.com/v1/chat/completions")
  assert.equal(result.stored.siliconflow.api_key, "sf-key-456")
  assert.equal(result.stored.siliconflow.model, "test-model")
  assert.equal(result.stored.siliconflow.timeout_ms, 45000)
  assert.equal(result.stored.siliconflow.max_history, 12)
  assert.equal(result.stored.siliconflow.trigger_mode, "wake_only")
  assert.equal(result.stored.siliconflow.fallback_persona_enabled, false)
  assert.equal(result.stored.siliconflow.fallback_persona_prompt, "第一行\n第二行\n第三行")
  assert.deepEqual(result.stored.siliconflow.wake_words, ["荨鹿", "调度器"])
})

test("set webui adapter persists bot base configuration", async () => {
  const workspace = createTempWorkspace({ masters: ["10001"] })
  const result = await runWorkspaceScript(
    workspace,
    `
          const configModule = await import(${JSON.stringify(toModuleUrl("src/lib/config.js"))})
          const { default: provider } = await import(${JSON.stringify(toModuleUrl("src/plugins/set/webui/index.js"))})

          const before = await provider.getValues()
          const after = await provider.updateValues({
            values: {
              runtime: {
                adapter: "icqq",
                authority: "bot.example.com",
                basePath: ":3011",
                accessToken: "token-abc",
                image_display: false,
                suffix_text: "[face:123]",
                useTLS: true,
                useSSE: true,
                icqq_bridge_enable: true,
              },
              control: {
                enabled: false,
                port: 4099,
                token: "ctl-token",
                default_scene: "private",
                default_group_id: "12345",
                default_user_id: "20002",
              },
              webui: {
                enabled: false,
                host: "0.0.0.0",
                port: 3100,
              },
              admin: {
                masterQQ: ["10001", "20002", "10001"],
                log_level: "warn",
              },
            },
          })
          const stored = configModule.default.getConfig("bot")

          return {
            before,
            after,
            stored,
          }
`,
  )

  assert.equal(result.before.values.runtime.adapter, "milky")
  assert.equal(result.before.values.runtime.image_display, true)
  assert.equal(result.after.values.runtime.adapter, "icqq")
  assert.equal(result.after.values.runtime.authority, "bot.example.com")
  assert.equal(result.after.values.runtime.image_display, false)
  assert.equal(result.after.values.runtime.suffix_text, "[face:123]")
  assert.equal(result.after.values.control.enabled, false)
  assert.equal(result.after.values.control.port, 4099)
  assert.equal(result.after.values.webui.host, "0.0.0.0")
  assert.equal(result.after.values.webui.port, 3100)
  assert.deepEqual(result.after.values.admin.masterQQ, ["10001", "20002"])
  assert.equal(result.after.values.admin.log_level, "warn")
  assert.equal(result.stored.adapter, "icqq")
  assert.equal(result.stored.authority, "bot.example.com")
  assert.equal(result.stored.image_display, false)
  assert.equal(result.stored.suffix_text, "[face:123]")
  assert.equal(result.stored.ctl_enable, false)
  assert.equal(result.stored.ctl_port, 4099)
  assert.equal(result.stored.webui_enable, false)
  assert.equal(result.stored.webui_host, "0.0.0.0")
  assert.equal(result.stored.webui_port, 3100)
  assert.deepEqual(result.stored.masterQQ, ["10001", "20002"])
  assert.equal(result.stored.log_level, "warn")
})

test("qun-daily webui adapter persists report settings", async () => {
  const workspace = createTempWorkspace()
  const result = await runWorkspaceScript(
    workspace,
    `
          const configModule = await import(${JSON.stringify(toModuleUrl("src/plugins/qun-daily/model/config.js"))})
          const { default: provider } = await import(${JSON.stringify(toModuleUrl("src/plugins/qun-daily/webui/index.js"))})

          const before = await provider.getValues()
          const after = await provider.updateValues({
            values: {
              push: {
                enabled: false,
                cron: "0 30 6 * * *",
                include_stats: true,
                include_words: false,
                include_commands: true,
              },
              command_defaults: {
                stats_days: 7,
                words_days: 30,
                command_days: 3,
              },
            },
          })
          const stored = configModule.getQunDailyConfig()

          return {
            before,
            after,
            stored,
            statsDays: configModule.getDefaultRangeDays("stats"),
            wordsDays: configModule.getDefaultRangeDays("words"),
            commandDays: configModule.getDefaultRangeDays("commands"),
          }
`,
  )

  assert.equal(result.before.values.push.enabled, true)
  assert.equal(result.before.values.push.cron, "0 5 0 * * *")
  assert.equal(result.after.values.push.enabled, false)
  assert.equal(result.after.values.push.cron, "0 30 6 * * *")
  assert.equal(result.after.values.push.include_words, false)
  assert.equal(result.after.values.command_defaults.stats_days, 7)
  assert.equal(result.after.values.command_defaults.words_days, 30)
  assert.equal(result.after.values.command_defaults.command_days, 3)
  assert.equal(result.stored.push.enabled, false)
  assert.equal(result.stored.push.cron, "0 30 6 * * *")
  assert.equal(result.stored.push.include_words, false)
  assert.equal(result.statsDays, 7)
  assert.equal(result.wordsDays, 30)
  assert.equal(result.commandDays, 3)
})

test("diaoyu webui adapter persists gameplay config and updates derived defaults", async () => {
  const workspace = createTempWorkspace()
  const result = await runWorkspaceScript(
    workspace,
    `
          const configModule = await import(${JSON.stringify(toModuleUrl("src/plugins/diaoyu/model/config.js"))})
          const storeModule = await import(${JSON.stringify(toModuleUrl("src/plugins/diaoyu/model/store.js"))})
          const { default: provider } = await import(${JSON.stringify(toModuleUrl("src/plugins/diaoyu/webui/index.js"))})

          const before = await provider.getValues()
          const after = await provider.updateValues({
            values: {
              bootstrap: {
                starting_coins: 500,
                starting_rod_level: 3,
                starting_bait: 8,
                starting_advanced_bait: 2,
              },
              sign: {
                base_coins: 200,
                streak_bonus_coins: 25,
                base_bait: 4,
                bait_bonus_every_streak: 5,
                advanced_bait_every_streak: 10,
              },
            },
          })
          const stored = configModule.getDiaoyuConfig()
          const rewards = configModule.getSignRewards(10)
          const db = storeModule.loadDb()
          const user = storeModule.getOrCreateUser(db, "20002")

          return {
            before,
            after,
            stored,
            rewards,
            user,
          }
`,
  )

  assert.equal(result.before.values.bootstrap.starting_coins, 200)
  assert.equal(result.before.values.sign.base_coins, 120)
  assert.equal(result.after.values.bootstrap.starting_coins, 500)
  assert.equal(result.after.values.bootstrap.starting_rod_level, 3)
  assert.equal(result.after.values.bootstrap.starting_bait, 8)
  assert.equal(result.after.values.bootstrap.starting_advanced_bait, 2)
  assert.equal(result.after.values.sign.base_coins, 200)
  assert.equal(result.after.values.sign.streak_bonus_coins, 25)
  assert.equal(result.stored.bootstrap.starting_coins, 500)
  assert.equal(result.stored.sign.base_coins, 200)
  assert.equal(result.rewards.coins, 450)
  assert.equal(result.rewards.bait, 6)
  assert.equal(result.rewards.adv, 1)
  assert.equal(result.user.coins, 500)
  assert.equal(result.user.rodLevel, 3)
  assert.equal(result.user.items.bait, 8)
  assert.equal(result.user.items.bait_adv, 2)
})
