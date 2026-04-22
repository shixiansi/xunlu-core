function coerceFileLikeToBase64(value) {
  if (value === undefined || value === null) return value

  if (Buffer.isBuffer(value)) {
    return `base64://${value.toString("base64")}`
  }

  if (value instanceof ArrayBuffer) {
    return `base64://${Buffer.from(value).toString("base64")}`
  }

  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    try {
      const buf = Buffer.from(value.buffer, value.byteOffset, value.byteLength)
      return `base64://${buf.toString("base64")}`
    } catch {
      return value
    }
  }

  return value
}

function normalizeMediaReferenceValue(value) {
  const coerced = coerceFileLikeToBase64(value)
  if (coerced === undefined || coerced === null) return ""
  return String(coerced).trim()
}

export function classifyMediaReference(value) {
  const raw = normalizeMediaReferenceValue(value)
  if (!raw) return { kind: "empty", value: "" }
  if (/^base64:\/\//i.test(raw)) return { kind: "base64", value: raw }
  if (/^data:[^,]+,/i.test(raw)) return { kind: "dataUri", value: raw }
  if (/^(https?|ftp):\/\//i.test(raw)) return { kind: "url", value: raw }
  if (/^file:\/\//i.test(raw)) return { kind: "fileUri", value: raw }
  if (/^[a-zA-Z]:[\\/]/.test(raw) || raw.startsWith("\\\\") || raw.startsWith("/")) {
    return { kind: "absolutePath", value: raw }
  }
  if (/^[.]{1,2}([\\/]|$)/.test(raw) || /[\\/]/.test(raw)) {
    return { kind: "relativePath", value: raw }
  }
  if (/^[^\\/:*?"<>|\r\n]+\.[A-Za-z0-9]{1,12}$/.test(raw)) {
    return { kind: "basename", value: raw }
  }
  return { kind: "opaqueId", value: raw }
}

export function resolveMediaReferenceFields(entries = []) {
  const out = {
    url: undefined,
    path: undefined,
    fileId: undefined,
  }

  const assign = (value, preferred = "auto") => {
    const ref = classifyMediaReference(value)
    if (!ref.value) return

    if (["url", "fileUri", "base64", "dataUri"].includes(ref.kind)) {
      if (!out.url) out.url = ref.value
      return
    }

    if (["absolutePath", "relativePath", "basename"].includes(ref.kind)) {
      if (preferred === "fileId" && ref.kind === "basename") {
        if (!out.fileId) out.fileId = ref.value
        return
      }
      if (!out.path) out.path = ref.value
      return
    }

    if (preferred === "url") {
      if (!out.url) out.url = ref.value
      return
    }
    if (preferred === "path") {
      if (!out.path) out.path = ref.value
      return
    }
    if (!out.fileId) out.fileId = ref.value
  }

  for (const entry of Array.isArray(entries) ? entries : []) {
    if (
      entry &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      Object.prototype.hasOwnProperty.call(entry, "value")
    ) {
      assign(entry.value, entry.preferred)
      continue
    }
    assign(entry)
  }

  return out
}

export function pickPrimaryMediaReference(...values) {
  for (const value of values) {
    const ref = classifyMediaReference(value)
    if (ref.value) return ref.value
  }
  return ""
}
