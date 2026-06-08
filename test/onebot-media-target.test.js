import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"

import { resolveOnebotMediaTarget } from "../src/Bot/adapter/onebotV11/media-target.js"

test("resolveOnebotMediaTarget passes remote and encoded media through", () => {
  assert.deepEqual(resolveOnebotMediaTarget("https://example.test/a.png"), {
    ok: true,
    kind: "url",
    value: "https://example.test/a.png",
  })

  assert.deepEqual(resolveOnebotMediaTarget("base64://Zm9v"), {
    ok: true,
    kind: "base64",
    value: "base64://Zm9v",
  })
})

test("resolveOnebotMediaTarget resolves relative paths against cwd before projectRoot", () => {
  const cwd = path.resolve("cwd-root")
  const projectRoot = path.resolve("project-root")
  const ref = path.join("assets", "image.png")
  const cwdHit = path.resolve(cwd, ref)
  const projectRootCandidate = path.resolve(projectRoot, ref)

  const result = resolveOnebotMediaTarget(ref, {
    cwd,
    projectRoot,
    exists: item => item === cwdHit,
  })

  assert.equal(result.ok, true)
  assert.equal(result.kind, "relativePath")
  assert.equal(result.value, cwdHit)
  assert.deepEqual(result.tried, [cwdHit, projectRootCandidate])
})

test("resolveOnebotMediaTarget reports missing local path candidates", () => {
  const cwd = path.resolve("cwd-root")
  const projectRoot = path.resolve("project-root")
  const ref = path.join("assets", "missing.png")
  const cwdCandidate = path.resolve(cwd, ref)
  const projectRootCandidate = path.resolve(projectRoot, ref)

  const result = resolveOnebotMediaTarget(ref, {
    cwd,
    projectRoot,
    exists: () => false,
  })

  assert.equal(result.ok, false)
  assert.equal(result.reason, "missing_local_path")
  assert.equal(result.value, ref)
  assert.deepEqual(result.tried, [cwdCandidate, projectRootCandidate])
})

test("resolveOnebotMediaTarget reports missing absolute paths without fallback", () => {
  const missingPath = path.resolve("missing.png")
  const result = resolveOnebotMediaTarget(missingPath, {
    exists: () => false,
  })

  assert.equal(result.ok, false)
  assert.equal(result.reason, "missing_absolute_path")
  assert.deepEqual(result.tried, [missingPath])
})
