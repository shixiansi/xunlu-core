import fs from "node:fs"
import { fileURLToPath } from "url"
import { dirname, resolve as resolvePath } from "path"

import { classifyMediaReference } from "../../message/context.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = resolvePath(__dirname, "..", "..", "..")

function dedupeStringList(list) {
  const out = []
  const seen = new Set()
  for (const item of Array.isArray(list) ? list : []) {
    const text = String(item || "").trim()
    if (!text || seen.has(text)) continue
    seen.add(text)
    out.push(text)
  }
  return out
}

export function resolveOnebotMediaTarget(
  value,
  { cwd = process.cwd(), projectRoot = PROJECT_ROOT, exists = fs.existsSync } = {},
) {
  const ref = classifyMediaReference(value)
  if (!ref.value) {
    return {
      ok: false,
      kind: ref.kind,
      value: "",
      reason: "empty",
      message: "[OneBotV11Adapter] empty media reference",
    }
  }

  if (["url", "fileUri", "base64", "dataUri", "opaqueId"].includes(ref.kind)) {
    return { ok: true, kind: ref.kind, value: ref.value }
  }

  if (ref.kind === "absolutePath") {
    if (exists(ref.value)) return { ok: true, kind: ref.kind, value: ref.value }
    return {
      ok: false,
      kind: ref.kind,
      value: ref.value,
      reason: "missing_absolute_path",
      message: `[OneBotV11Adapter] local media path not found: ${ref.value}`,
      tried: [ref.value],
    }
  }

  if (ref.kind === "relativePath" || ref.kind === "basename") {
    const tried = dedupeStringList([resolvePath(cwd, ref.value), resolvePath(projectRoot, ref.value)])
    const hit = tried.find(item => exists(item))
    if (hit) return { ok: true, kind: ref.kind, value: hit, tried }
    return {
      ok: false,
      kind: ref.kind,
      value: ref.value,
      reason: "missing_local_path",
      message: `[OneBotV11Adapter] unresolved local media reference: ${ref.value}; tried: ${tried.join(", ")}`,
      tried,
    }
  }

  return { ok: true, kind: ref.kind, value: ref.value }
}
