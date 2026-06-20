export default async function enrichRolesMiddleware(ctx, next) {
  const roleResolver = ctx.roleResolver
  if (roleResolver && typeof roleResolver.enrichGroupRoleFlags === "function") {
    await roleResolver.enrichGroupRoleFlags(ctx)
  }
  await next()
}
