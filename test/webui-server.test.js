import assert from "node:assert/strict"
import http from "node:http"
import test from "node:test"

import { startWebuiServer, stopWebuiServer } from "../src/lib/webuiServer.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

function createRegistryStub() {
  return {
    mount() {},
    list() {
      return []
    },
    async getDefinition() {
      return null
    },
    async listScopes() {
      return []
    },
    async getValues() {
      return { values: {} }
    },
    async updateValues() {
      return { values: {} }
    },
  }
}

function listen(server, port = 0, host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, host, () => {
      server.removeListener("error", reject)
      resolve(server.address())
    })
  })
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close(err => {
      if (err) return reject(err)
      resolve(true)
    })
  })
}

test("webui server falls back to a random port when requested port is already in use", async () => {
  await stopWebuiServer().catch(() => false)

  const blocker = http.createServer((_, res) => res.end("occupied"))
  const address = await listen(blocker)
  const occupiedPort = Number(address?.port || 0)

  assert.ok(occupiedPort > 0)

  try {
    const result = await startWebuiServer({
      host: "127.0.0.1",
      port: occupiedPort,
      plugins: [{ name: "fixture-webui-server" }],
      registry: createRegistryStub(),
    })

    const webuiAddress = result?.server?.address()
    const actualPort = typeof webuiAddress === "object" && webuiAddress ? Number(webuiAddress.port || 0) : 0

    assert.ok(actualPort > 0)
    assert.notEqual(actualPort, occupiedPort)
  } finally {
    await stopWebuiServer().catch(() => false)
    await close(blocker)
  }
})
