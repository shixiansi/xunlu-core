export function isNativeForwardPayload(payload) {
  const list = Array.isArray(payload) ? payload : payload ? [payload] : []
  return list.some(item => {
    if (!item || typeof item !== "object") return false
    if (item.type === "node") return true
    return item.type === "forward" && Array.isArray(item?.data?.messages)
  })
}

export async function buildDynamicForwardNodes(ctx, msgList = [], options = {}) {
  const list = Array.isArray(msgList) ? msgList : [msgList]
  const runtimeBot = options.runtimeBot ?? globalThis.Bot ?? {}
  const logger = options.logger ?? globalThis.logger
  const defaultId = Number(ctx?.user_id ?? runtimeBot?.uin ?? runtimeBot?.user_id ?? 0)
  let nickname = String(runtimeBot?.nickname || "Bilibili动态").trim() || "Bilibili动态"

  if (
    ctx?.isGroup &&
    ctx?.group_id &&
    defaultId > 0 &&
    typeof ctx?.getGroupMemberInfo === "function"
  ) {
    try {
      const info = await ctx.getGroupMemberInfo({ group_id: ctx.group_id, user_id: defaultId })
      const member = info?.member ?? info?.data?.member ?? info?.data ?? info
      nickname = String(member?.card || member?.nickname || nickname).trim() || nickname
    } catch (err) {
      logger?.warn?.(`[Bilibili] 获取转发昵称失败：${err?.message || err}`)
    }
  }

  return list.filter(Boolean).map(message => ({
    user_id: defaultId > 0 ? defaultId : 0,
    uin: defaultId > 0 ? defaultId : 0,
    nickname,
    sender_name: nickname,
    name: nickname,
    message,
  }))
}

export async function makeDynamicImageForward(baseBot, ctx, groupId, msgList = [], desc = "", options = {}) {
  const targetGroupId = Number(groupId)
  const forwardCtx = {
    ...(ctx || {}),
    isGroup: true,
    group_id: Number.isFinite(targetGroupId) ? targetGroupId : groupId,
  }
  const runtimeBot = options.runtimeBot ?? globalThis.Bot
  const normalizedList = await buildDynamicForwardNodes(forwardCtx, msgList, {
    ...options,
    runtimeBot,
  })

  if (baseBot && typeof baseBot.makeGroupForwardMsg === "function") {
    const forwardMsg = await baseBot.makeGroupForwardMsg(forwardCtx, normalizedList, desc)
    if (isNativeForwardPayload(forwardMsg)) return forwardMsg
  }

  if (baseBot && typeof baseBot.makeForwardMsg === "function") {
    const forwardMsg = await baseBot.makeForwardMsg(forwardCtx, normalizedList, desc)
    if (isNativeForwardPayload(forwardMsg)) return forwardMsg
  }

  if (ctx && typeof ctx.makeGroupForwardMsg === "function") {
    const forwardMsg = await ctx.makeGroupForwardMsg(forwardCtx, normalizedList, desc)
    if (isNativeForwardPayload(forwardMsg)) return forwardMsg
  }

  if (typeof runtimeBot?.makeGroupForwardMsg === "function") {
    const forwardMsg = await runtimeBot.makeGroupForwardMsg(normalizedList, forwardCtx.group_id)
    if (isNativeForwardPayload(forwardMsg)) return forwardMsg
  }

  throw new Error("[Bilibili] forward message API returned non-forward payload")
}
