import assert from "node:assert/strict"
import test from "node:test"

import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

function buildPrimitiveIdFacade(id, extra = {}) {
  return {
    ...extra,
    valueOf() {
      return id
    },
    toString() {
      return String(id)
    },
    [Symbol.toPrimitive](hint) {
      if (hint === "number") return Number(id)
      return String(id)
    },
  }
}

test("takeover-compatible group/member facades coerce to numeric ids", () => {
  const group = buildPrimitiveIdFacade(629661253, { group_id: 629661253, gid: 629661253 })
  const member = buildPrimitiveIdFacade(1765629830, { user_id: 1765629830, uin: 1765629830 })

  assert.equal(Number(group), 629661253)
  assert.equal(String(group), "629661253")
  assert.equal(Number(member), 1765629830)
  assert.equal(String(member), "1765629830")
})
