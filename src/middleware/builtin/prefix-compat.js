import { applyPrefixCompatibilityToEvent } from "../../Bot/runtime/prefix-compat.js"

export default async function prefixCompatMiddleware(ctx, next) {
  await applyPrefixCompatibilityToEvent(ctx)
  await next()
}
