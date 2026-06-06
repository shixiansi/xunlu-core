import assert from "node:assert/strict"
import test from "node:test"

import redisInit from "../src/component/redis/redis.js"

function createClientFactory(outcomes = []) {
  const clients = []

  return {
    clients,
    createClient(options) {
      const outcome = outcomes.shift()
      const client = {
        options,
        listeners: {},
        async connect() {
          if (outcome instanceof Error) throw outcome
          return outcome
        },
        on(event, handler) {
          this.listeners[event] = handler
          return this
        },
      }
      clients.push(client)
      return client
    },
  }
}

function createLoggerSink() {
  const entries = []
  return {
    entries,
    logger: {
      info(message) {
        entries.push(["info", String(message)])
      },
      error(message) {
        entries.push(["error", String(message)])
      },
      red(value) {
        return `red:${value?.message || value}`
      },
      blue(value) {
        return `blue:${value}`
      },
    },
  }
}

test("redisInit retries with injectable startup command after first connection failure", async () => {
  const clientFactory = createClientFactory([new Error("down"), true])
  const loggerSink = createLoggerSink()
  const execCommands = []
  const sleeps = []
  let globalClient = null

  const client = await redisInit({
    redisConfig: {
      host: "redis.local",
      port: 6380,
      username: "user",
      password: "pass",
      db: 2,
    },
    createClient: clientFactory.createClient,
    execCommand: async cmd => {
      execCommands.push(cmd)
      return { stdout: "" }
    },
    sleep: async ms => {
      sleeps.push(ms)
    },
    logger: loggerSink.logger,
    platform: "win32",
    setGlobalClient(value) {
      globalClient = value
    },
  })

  assert.equal(client, clientFactory.clients[1])
  assert.equal(globalClient, client)
  assert.equal(clientFactory.clients[0].options.url, "redis://user:pass@redis.local:6380/2")
  assert.deepEqual(execCommands, ["redis-server --save 900 1 --save 300 10 --daemonize yes"])
  assert.deepEqual(sleeps, [1000])
  assert.ok(loggerSink.entries.some(([level, message]) => level === "info" && message.includes("Redis")))
})

test("redisInit uses injectable exit on fatal connection failure", async () => {
  const clientFactory = createClientFactory([new Error("first"), new Error("second")])
  let exitCalls = 0
  let globalSetCalls = 0

  await assert.rejects(
    async () =>
      await redisInit({
        redisConfig: {
          host: "127.0.0.1",
          port: 6379,
          username: "",
          password: "",
          db: 0,
        },
        createClient: clientFactory.createClient,
        execCommand: async () => ({ stdout: "" }),
        sleep: async () => {},
        logger: createLoggerSink().logger,
        platform: "win32",
        exit() {
          exitCalls += 1
          throw new Error("exit called")
        },
        setGlobalClient() {
          globalSetCalls += 1
        },
      }),
    /exit called/,
  )

  assert.equal(exitCalls, 1)
  assert.equal(globalSetCalls, 0)
})

test("redisInit error listener uses injectable exit without touching process.exit", async () => {
  const clientFactory = createClientFactory([true])
  let exitCalls = 0

  const client = await redisInit({
    redisConfig: {
      host: "127.0.0.1",
      port: 6379,
      username: "",
      password: "",
      db: 0,
    },
    createClient: clientFactory.createClient,
    execCommand: async () => ({ stdout: "" }),
    sleep: async () => {},
    logger: createLoggerSink().logger,
    platform: "win32",
    exit() {
      exitCalls += 1
    },
    setGlobalClient() {},
  })

  await client.listeners.error(new Error("later"))

  assert.equal(exitCalls, 1)
})
