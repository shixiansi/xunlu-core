export default async function normalizeSegmentsMiddleware(ctx, next) {
  if (!Array.isArray(ctx.rawSegments)) {
    if (Array.isArray(ctx.segments)) ctx.rawSegments = ctx.segments
    else if (Array.isArray(ctx.message)) ctx.rawSegments = ctx.message
  }
  await next()
}
