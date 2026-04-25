function toInt(value) {
  if (value === undefined || value === null) return undefined
  const text = typeof value === "string" ? value.trim() : value
  if (text === "") return undefined
  const num = Number(text)
  return Number.isFinite(num) ? Math.trunc(num) : undefined
}

function extractReplySenderId(replied) {
  return toInt(
    replied?.sender_id ??
      replied?.user_id ??
      replied?.sender?.user_id ??
      replied?.sender?.userId ??
      replied?.data?.sender_id ??
      replied?.data?.user_id ??
      replied?.data?.sender?.user_id ??
      replied?.data?.sender?.userId,
  )
}

function extractReplyMessageId(replied) {
  return (
    replied?.message_id ??
    replied?.messageId ??
    replied?.msgId ??
    replied?.data?.message_id ??
    replied?.data?.messageId ??
    replied?.messageRef?.msgId
  )
}

function extractReplyMessageSeq(replied) {
  return toInt(
    replied?.message_seq ??
      replied?.messageSeq ??
      replied?.seq ??
      replied?.data?.message_seq ??
      replied?.data?.messageSeq ??
      replied?.data?.seq ??
      replied?.messageRef?.seq,
  )
}

function extractSelfId(ctx) {
  return toInt(
    ctx?.self_id ??
      ctx?.bot?.self_id ??
      ctx?.bot?.uin ??
      globalThis.Bot?.self_id ??
      globalThis.Bot?.uin ??
      globalThis.Bot?.user_id,
  )
}

async function canBotRecallOthers(ctx) {
  if (typeof ctx?.isBotGroupAdmin === "function") return await ctx.isBotGroupAdmin()
  return Boolean(ctx?.botIsOwner || ctx?.botIsAdmin)
}

export async function handleRecallCommand(ctx, options = {}) {
  const missingReplyText =
    options.missingReplyText || "请先回复需要撤回的消息，再发送：撤回 / 引用撤回"
  const selfOnlyText =
    options.selfOnlyText || "只能撤回 bot 自己发的消息（请回复 bot 发出的那条）"
  const othersNeedBotAdminText =
    options.othersNeedBotAdminText || "Bot 需要管理员权限才能撤回其他人的消息"
  const failurePrefix = options.failurePrefix || "撤回失败："

  const replied = await ctx?.getReplyMessage?.()
  if (!replied) return await ctx.reply(missingReplyText)

  const selfId = extractSelfId(ctx)
  const senderId = extractReplySenderId(replied)
  const isBotMessage = Boolean(selfId && senderId && selfId === senderId)
  const isGroup = Boolean(ctx?.group_id ?? replied?.group_id ?? replied?.peer_id)

  if (!isBotMessage) {
    if (!ctx?.isMaster) {
      return await ctx.reply(selfOnlyText)
    }

    if (isGroup && !(await canBotRecallOthers(ctx))) {
      return await ctx.reply(othersNeedBotAdminText)
    }

    if (!isGroup) {
      return await ctx.reply(selfOnlyText)
    }
  }

  const peer_id = isGroup
    ? toInt(ctx?.group_id ?? replied?.group_id ?? replied?.peer_id)
    : toInt(ctx?.user_id ?? replied?.user_id ?? replied?.peer_id)
  const message_id = extractReplyMessageId(replied)
  const message_seq = extractReplyMessageSeq(replied)

  if (peer_id === undefined || (message_id === undefined && message_seq === undefined)) {
    return await ctx.reply(`${failurePrefix}无法识别要撤回的消息`)
  }

  try {
    const res = await ctx.recallMessage({
      peer_id,
      message_id,
      message_seq,
      isGroup,
    })
    if (res === false) {
      throw new Error("协议端未撤回该消息（可能权限不足或消息不支持撤回）")
    }
    return true
  } catch (err) {
    return await ctx.reply(`${failurePrefix}${err?.message || err}`)
  }
}

export const __test = {
  extractReplySenderId,
  extractReplyMessageId,
  extractReplyMessageSeq,
  extractSelfId,
}
