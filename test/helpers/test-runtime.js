import CommandUsageDB from "../../src/db/CommandUsageDB.js"
import MessageDB from "../../src/db/MessageDB.js"
import cfg from "../../src/lib/config.js"

const originalConsole = {
  debug: console.debug,
  error: console.error,
  info: console.info,
  log: console.log,
  warn: console.warn,
}

export async function cleanupTestRuntime() {
  try {
    cfg?.cleanup?.()
  } catch {}
  try {
    await CommandUsageDB?.close?.()
  } catch {}
  try {
    await MessageDB?.close?.()
  } catch {}
}

export function installTestRuntime(test) {
  test.before(() => {
    console.debug = () => {}
    console.error = () => {}
    console.info = () => {}
    console.log = () => {}
    console.warn = () => {}
  })

  test.afterEach(async () => {
    await cleanupTestRuntime()
  })

  test.after(async () => {
    await cleanupTestRuntime()
    console.debug = originalConsole.debug
    console.error = originalConsole.error
    console.info = originalConsole.info
    console.log = originalConsole.log
    console.warn = originalConsole.warn
  })
}
