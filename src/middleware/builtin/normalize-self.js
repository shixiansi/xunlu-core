export default async function normalizeSelfMiddleware(ctx, next) {
  ctx.self_id = Array.isArray(ctx.self_id) ? ctx.self_id[0] : ctx?.self_id
  await next()
}
