import { UniversalMessage, UniversalSegmentType } from "../../Bot/message/universal-message.js"

function looksLikeUniversalSegment(seg) {
  return Boolean(
    (seg?.type === UniversalSegmentType.TEXT &&
      seg?.data &&
      (Object.prototype.hasOwnProperty.call(seg.data, "text") ||
        Object.prototype.hasOwnProperty.call(seg.data, "content"))) ||
      (seg?.type === UniversalSegmentType.MENTION &&
        seg?.data &&
        (Object.prototype.hasOwnProperty.call(seg.data, "qq") ||
          Object.prototype.hasOwnProperty.call(seg.data, "target"))) ||
      (seg?.type === UniversalSegmentType.MENTION_ALL &&
        seg?.data &&
        typeof seg.data === "object") ||
      (seg?.type === UniversalSegmentType.REPLY &&
        seg?.data &&
        (Object.prototype.hasOwnProperty.call(seg.data, "id") ||
          Object.prototype.hasOwnProperty.call(seg.data, "msgId") ||
          Object.prototype.hasOwnProperty.call(seg.data, "seq"))) ||
      ((seg?.type === UniversalSegmentType.IMAGE ||
        seg?.type === UniversalSegmentType.VOICE ||
        seg?.type === UniversalSegmentType.VIDEO ||
        seg?.type === UniversalSegmentType.FILE) &&
        seg?.data &&
        (Object.prototype.hasOwnProperty.call(seg.data, "file") ||
          Object.prototype.hasOwnProperty.call(seg.data, "url") ||
          Object.prototype.hasOwnProperty.call(seg.data, "fileId") ||
          Object.prototype.hasOwnProperty.call(seg.data, "path") ||
          Object.prototype.hasOwnProperty.call(seg.data, "id"))),
  )
}

function looksLikeUniversalSegments(segments) {
  return Array.isArray(segments) && segments.length > 0 && segments.every(seg => looksLikeUniversalSegment(seg))
}

export default async function createUniversalMiddleware(ctx, next) {
  const rawLooksUniversal = looksLikeUniversalSegments(ctx.rawSegments)
  if (!ctx.universalMessage && Array.isArray(ctx.rawSegments) && ctx.protocol && !rawLooksUniversal) {
    try {
      ctx.universalMessage = UniversalMessage.from(ctx.protocol, ctx.rawSegments)
    } catch {}
  }

  if (ctx.universalMessage) {
    ctx.message = ctx.universalMessage.segments
  } else if (Array.isArray(ctx.message) && ctx.protocol) {
    if (!looksLikeUniversalSegments(ctx.message)) {
      try {
        ctx.universalMessage = UniversalMessage.from(ctx.protocol, ctx.message)
        ctx.message = ctx.universalMessage.segments
      } catch {}
    }
  }
  await next()
}
