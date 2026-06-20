function tryParseJsonPayload(payload) {
  if (!payload) return null
  if (typeof payload === "object") return payload
  if (typeof payload !== "string") return null
  const text = payload.trim()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function extractJsonFromSegments(segments, protocol) {
  if (!Array.isArray(segments)) return null

  if (protocol === "milky") {
    const lightApp = segments.find(seg => seg?.type === "light_app")
    const payload = lightApp?.data?.json_payload ?? lightApp?.data?.jsonPayload
    return tryParseJsonPayload(payload)
  }

  const jsonSeg = segments.find(seg => seg?.type === "json")
  if (!jsonSeg) return null
  const payload = jsonSeg?.data?.data ?? jsonSeg?.data?.json ?? jsonSeg?.data ?? jsonSeg?.json
  return tryParseJsonPayload(payload)
}

export default async function extractJsonMiddleware(ctx, next) {
  if (!ctx.json) {
    ctx.json = extractJsonFromSegments(ctx.rawSegments, String(ctx.protocol || "").toLowerCase()) || undefined
  }
  await next()
}
