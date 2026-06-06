import assert from "node:assert/strict"
import test from "node:test"

import {
  __resetParseDedupeForTests,
  isDuplicateParseRequest,
} from "../src/plugins/shared/parse-dedupe.js"

test.beforeEach(() => {
  __resetParseDedupeForTests()
})

test.afterEach(() => {
  __resetParseDedupeForTests()
})

function withFakeNow(now, fn) {
  const originalNow = Date.now
  Date.now = () => now
  try {
    return fn()
  } finally {
    Date.now = originalNow
  }
}

test("parse dedupe normalizes urls and trims trailing punctuation", () => {
  const ctx = {
    group_id: 10001,
    user_id: 20001,
  }

  assert.equal(
    isDuplicateParseRequest(ctx, "https://WWW.BILIBILI.com/video/BV1xx411c7mD#reply", {
      parser: "bilibili",
    }),
    false,
  )
  assert.equal(
    isDuplicateParseRequest(ctx, "https://www.bilibili.com/video/BV1xx411c7mD。", {
      parser: "bilibili",
    }),
    true,
  )
})

test("parse dedupe keeps parser peer and sender scopes independent", () => {
  const ctx = {
    group_id: 10001,
    user_id: 20001,
  }

  assert.equal(isDuplicateParseRequest(ctx, "video:BV1xx411c7mD", { parser: "bilibili" }), false)
  assert.equal(isDuplicateParseRequest(ctx, "video:BV1xx411c7mD", { parser: "bilibili" }), true)
  assert.equal(isDuplicateParseRequest(ctx, "video:BV1xx411c7mD", { parser: "douyin" }), false)
  assert.equal(
    isDuplicateParseRequest({ ...ctx, user_id: 20002 }, "video:BV1xx411c7mD", { parser: "bilibili" }),
    false,
  )
  assert.equal(
    isDuplicateParseRequest({ ...ctx, group_id: 10002 }, "video:BV1xx411c7mD", { parser: "bilibili" }),
    false,
  )
})

test("parse dedupe expires keys after ttl", () => {
  const ctx = {
    group_id: 10001,
    user_id: 20001,
  }

  withFakeNow(1_000, () => {
    assert.equal(
      isDuplicateParseRequest(ctx, "video:BV1xx411c7mD", { parser: "bilibili", ttlMs: 50 }),
      false,
    )
  })
  withFakeNow(1_020, () => {
    assert.equal(
      isDuplicateParseRequest(ctx, "video:BV1xx411c7mD", { parser: "bilibili", ttlMs: 50 }),
      true,
    )
  })
  withFakeNow(1_060, () => {
    assert.equal(
      isDuplicateParseRequest(ctx, "video:BV1xx411c7mD", { parser: "bilibili", ttlMs: 50 }),
      false,
    )
  })
})
