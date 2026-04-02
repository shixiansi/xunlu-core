import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { createUniversalBotApi } from "../src/Bot/api/universal-bot-api.js"

function getDocumentedUniversalApiNames() {
  const md = fs.readFileSync(new URL("../md/api.md", import.meta.url), "utf8")
  const match = md.match(/### 2\.3[\s\S]*?(?=\n## 3\))/)
  assert.ok(match, "missing `### 2.3 通用 QQBot API` section in md/api.md")

  return [...new Set([...match[0].matchAll(/`botApi\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)].map(i => i[1]))]
    .sort()
}

test("md/api.md stays in sync with createUniversalBotApi public methods", () => {
  const api = createUniversalBotApi({ bot: {} })
  const actual = Object.keys(api).sort()
  const documented = getDocumentedUniversalApiNames()

  assert.deepEqual(documented, actual)
})
