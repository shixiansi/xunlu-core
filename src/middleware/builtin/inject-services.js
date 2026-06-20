import { services } from "../../service-container.js"

export default async function injectServicesMiddleware(ctx, next) {
  ctx.services = services
  await next()
}
