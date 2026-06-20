export default async function resolveMasterMiddleware(ctx, next) {
  const roleResolver = ctx.roleResolver
  if (roleResolver && typeof roleResolver.getMasterList === "function") {
    const masters = await roleResolver.getMasterList()
    const uid = ctx.sender_id ?? ctx.user_id
    const uidNum = Number(uid)
    if (Array.isArray(masters) && (masters.includes(uidNum) || masters.includes(uid))) {
      ctx.isMaster = true
    }
  }
  await next()
}
