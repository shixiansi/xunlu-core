import cfg from "../../src/lib/config.js"
import { resetRuntimeContextForTests } from "../../src/runtime/runtime-context.js"

const originalConsole = {
  debug: console.debug,
  error: console.error,
  info: console.info,
  log: console.log,
  warn: console.warn,
}

async function cleanupDatabases() {
  try {
    const { default: CommandUsageDB } = await import("../../src/db/CommandUsageDB.js")
    await CommandUsageDB?.close?.()
  } catch {}
  try {
    const { default: MessageDB } = await import("../../src/db/MessageDB.js")
    await MessageDB?.close?.()
  } catch {}
  try {
    const learningChatDb = await import("../../src/plugins/learning_chat/model/db.js")
    await learningChatDb?.closeDb?.()
  } catch {}
}

export async function cleanupTestRuntime({
  cleanupAdapter: shouldCleanupAdapter = true,
  cleanupDatabases: shouldCleanupDatabases = true,
} = {}) {
  try {
    cfg?.cleanup?.()
  } catch {}
  try {
    resetRuntimeContextForTests?.()
  } catch {}
  if (shouldCleanupAdapter) {
    try {
      const adapter = await import("../../src/Bot/adapter/index.js")
      adapter.resetActiveIcqqPluginLoader?.()
    } catch {}
  }
  if (shouldCleanupDatabases) await cleanupDatabases()
}

export function installTestRuntime(test, options = {}) {
  test.before(() => {
    console.debug = () => {}
    console.error = () => {}
    console.info = () => {}
    console.log = () => {}
    console.warn = () => {}
  })

  test.afterEach(async () => {
    await cleanupTestRuntime(options)
  })

  test.after(async () => {
    await cleanupTestRuntime(options)
    console.debug = originalConsole.debug
    console.error = originalConsole.error
    console.info = originalConsole.info
    console.log = originalConsole.log
    console.warn = originalConsole.warn
  })
}
