import { installTakeoverBotCompatProxy } from "../../Bot/yunzai/takeover.js"

export default async function takeoverProxyMiddleware(ctx, next) {
  if (ctx.__xunluTakeover && globalThis.Bot) {
    globalThis.Bot = installTakeoverBotCompatProxy(globalThis.Bot)
  }
  await next()
}
