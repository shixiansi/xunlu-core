import { normalizeEventTargetFields } from "../../Bot/runtime/shared.js"

export default async function normalizeTargetMiddleware(ctx, next) {
  normalizeEventTargetFields(ctx)
  await next()
}
