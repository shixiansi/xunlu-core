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

function request(server, pathname) {
  const address = server.address()
  const port = typeof address === "object" && address ? Number(address.port || 0) : 0

  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path: pathname }, res => {
      let body = ""
      res.setEncoding("utf8")
      res.on("data", chunk => {
        body += chunk
      })
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          body,
        })
      })
    })
    req.on("error", reject)
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

test("webui server serves shell assets from root resources directory", async () => {
  await stopWebuiServer().catch(() => false)

  try {
    const result = await startWebuiServer({
      host: "127.0.0.1",
      port: 0,
      plugins: [{ name: "fixture-webui-server" }],
      registry: createRegistryStub(),
    })

    const page = await request(result.server, "/webui")
    assert.equal(page.statusCode, 200)
    assert.match(page.body, /xunlu-core WebUI/)

    const script = await request(result.server, "/webui/static/app.js")
    assert.equal(script.statusCode, 200)
    assert.match(script.body, /const PAGE/)
  } finally {
    await stopWebuiServer().catch(() => false)
  }
})
