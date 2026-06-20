export default async function classifySceneMiddleware(ctx, next) {
  ctx.logText = ""

  ctx.isGroup = Boolean(ctx.group_id)
  ctx.isPrivate = !ctx.isGroup && (ctx.message_type === "private" || Boolean(ctx.friend))

  if (ctx.isPrivate) {
    if (!ctx.sender) {
      const nickname = ctx.friend?.nickname || ctx.sender?.nickname || ""
      ctx.sender = { card: nickname, nickname }
    } else if (ctx.sender && !ctx.sender.card) {
      ctx.sender.card = ctx.sender.nickname
    }
    const senderId = ctx.sender_id ?? ctx.user_id ?? ""
    ctx.logText = `[私聊][${ctx.sender.nickname}(${senderId})]`
  }

  if (ctx.isGroup) {
    if (!ctx.sender) {
      ctx.sender = {
        card: ctx.group_member?.card,
        nickname: ctx.group_member?.nickname,
      }
    }
    if (!ctx.group_name) ctx.group_name = ctx.group?.group_name || ctx.group_name
    const displayName = ctx.sender?.card || ctx.sender?.nickname || ""
    ctx.logText = `[${ctx.group_name || ctx.group_id}(${displayName})]`
  }
  await next()
}
