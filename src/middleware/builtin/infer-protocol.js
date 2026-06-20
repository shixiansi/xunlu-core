export default async function inferProtocolMiddleware(ctx, next) {
  if (!ctx.protocol) {
    const adapterHint = String(ctx.adapterType || ctx.baseBot?.adapter || "").toLowerCase()
    if (adapterHint.includes("milky")) ctx.protocol = "milky"
    else if (adapterHint.includes("onebot")) ctx.protocol = "onebotv11"
    else if (adapterHint.includes("icqq")) ctx.protocol = "icqq"
  }
  await next()
}
