import { applyDerivedFieldsFromUniversalSegments } from "../../Bot/message/context.js"

export default async function deriveFieldsMiddleware(ctx, next) {
  if (Array.isArray(ctx.message)) {
    applyDerivedFieldsFromUniversalSegments(ctx)

    if (!ctx.url && ctx.json && typeof ctx.json === "object") {
      const derivedUrl =
        ctx.json?.meta?.detail_1?.qqdocurl ||
        ctx.json?.meta?.detail_1?.url ||
        ctx.json?.meta?.news?.jumpUrl ||
        ctx.json?.meta?.news?.jump_url ||
        ctx.json?.meta?.news?.jumpURL ||
        ""
      if (derivedUrl) ctx.url = String(derivedUrl)
    }
  } else if (!ctx.msg) {
    ctx.msg = ctx.raw_message || ""
  }
  await next()
}
