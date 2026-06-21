import {
  getRuntimeBotOrNull,
  toInt,
} from "../../Bot/api/universal-bot-api-utils.js"

export function registerMessageActions(dispatcher) {
  dispatcher.register("recallMessage", {
    milky: async (params) => {
      const runtimeBot = getRuntimeBotOrNull()
      const messageSeq = toInt(params.message_seq ?? params.seq)
      const isGroup = params.isGroup ?? Boolean(params.group_id)
      const peerId = params.group_id ?? params.user_id ?? params.peer_id
      if (messageSeq === undefined) throw new Error("[recallMessage] milky requires message_seq")
      if (!peerId) throw new Error("[recallMessage] milky requires peer_id/group_id/user_id")
      if (isGroup && runtimeBot?.recallGroupMessage) {
        return await runtimeBot.recallGroupMessage({ group_id: Number(peerId), message_seq: messageSeq })
      }
      if (!isGroup && runtimeBot?.recallPrivateMessage) {
        return await runtimeBot.recallPrivateMessage({ user_id: Number(peerId), message_seq: messageSeq })
      }
      throw new Error("[recallMessage] milky API not available")
    },
    onebotv11: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const messageId = toInt(params.message_id ?? params.message_seq ?? params.seq)
      if (messageId === undefined) throw new Error("[recallMessage] onebotv11 requires message_id")
      if (runtimeBot?.deleteMessage) return await runtimeBot.deleteMessage({ message_id: messageId })
      if (runtimeBot?.callApi) return await runtimeBot.callApi("delete_msg", { message_id: messageId })
      const nativeBotUin = String(ctx?.self_id ?? ctx?.uin ?? '')
      const targetBot = nativeBotUin && ctx?.[nativeBotUin]?.adapter ? ctx[nativeBotUin] : ctx?.bot ?? ctx
      if (targetBot?.callApi) return await targetBot.callApi("delete_msg", { message_id: messageId })
      if (targetBot?.adapter?.callApi) return await targetBot.adapter.callApi("delete_msg", { message_id: messageId })
      throw new Error("[recallMessage] onebotv11 API not available")
    },
    icqq: async (params) => {
      const runtimeBot = getRuntimeBotOrNull()
      const peerId = params.group_id ?? params.user_id ?? params.peer_id
      const seq = toInt(params.message_seq ?? params.seq)
      const isGroup = params.isGroup ?? Boolean(params.group_id)
      if (!peerId) throw new Error("[recallMessage] icqq requires peer_id/group_id/user_id")
      if (seq === undefined) throw new Error("[recallMessage] icqq requires message_seq/seq")
      if (isGroup && runtimeBot?.pickGroup) return await runtimeBot.pickGroup(Number(peerId)).recallMsg(seq)
      if (!isGroup && runtimeBot?.pickFriend) return await runtimeBot.pickFriend(Number(peerId)).recallMsg(seq)
      if (!isGroup && runtimeBot?.pickUser) return await runtimeBot.pickUser(Number(peerId)).recallMsg(seq)
      throw new Error("[recallMessage] icqq API not available")
    },
  })

  dispatcher.register("sendGroupMessageReaction", {
    milky: async (params) => {
      const runtimeBot = getRuntimeBotOrNull()
      const raw = runtimeBot?.__xunlu_raw_sendGroupMessageReaction || runtimeBot?.sendGroupMessageReaction || null
      if (!raw) throw new Error("[sendGroupMessageReaction] milky API not available")
      const groupId = toInt(params.group_id ?? params.peer_id)
      const messageSeq = toInt(params.message_seq ?? params.seq)
      const reactionRaw = params.reaction ?? params.emoji_id ?? params.emoji ?? params.id
      if (!groupId) throw new Error("[sendGroupMessageReaction] milky requires group_id")
      if (messageSeq === undefined) throw new Error("[sendGroupMessageReaction] milky requires message_seq")
      if (reactionRaw === undefined || reactionRaw === null || reactionRaw === "") throw new Error("[sendGroupMessageReaction] milky requires reaction")
      const is_add = params.is_add !== undefined ? Boolean(params.is_add) : true
      return await raw.call(runtimeBot, { group_id: groupId, message_seq: messageSeq, reaction: String(reactionRaw), is_add })
    },
    onebotv11: async (params) => {
      const ctx = params._ctx || null
      const runtimeBot = getRuntimeBotOrNull()
      const messageId = params.message_id
      const reactionRaw = params.reaction ?? params.emoji_id ?? params.emoji ?? params.id
      if (!messageId) throw new Error("[sendGroupMessageReaction] onebotv11 requires message_id")
      if (reactionRaw === undefined || reactionRaw === null || reactionRaw === "") throw new Error("[sendGroupMessageReaction] onebotv11 requires reaction")

      const apiParams = { message_id: messageId, emoji_id: Number(reactionRaw) }

      const sendApi = getOnebotReactionSendApi({ ctx, runtimeBot })
      if (sendApi) return await sendApi("set_msg_emoji_like", apiParams)

      const raw = getDirectOnebotReactionMethod(runtimeBot)
      if (raw) return await raw(apiParams)

      throw new Error("[sendGroupMessageReaction] onebotv11 API not available")
    },
    icqq: async (params) => {
      const runtimeBot = getRuntimeBotOrNull()
      const groupId = toInt(params.group_id ?? params.peer_id)
      const messageSeq = toInt(params.message_seq ?? params.seq)
      const reactionRaw = params.reaction ?? params.emoji_id ?? params.emoji ?? params.id
      if (!groupId) throw new Error("[sendGroupMessageReaction] icqq requires group_id")
      if (messageSeq === undefined) throw new Error("[sendGroupMessageReaction] icqq requires message_seq")
      if (reactionRaw === undefined || reactionRaw === null || reactionRaw === "") throw new Error("[sendGroupMessageReaction] icqq requires reaction")

      if (runtimeBot?.pickGroup) {
        const group = runtimeBot.pickGroup(groupId)
        if (group?.setReaction) return await group.setReaction(messageSeq, Number(reactionRaw))
      }

      const sendApi = getYunzaiSendApi(runtimeBot)
      if (sendApi && params.message_id) {
        return await sendApi("set_msg_emoji_like", { message_id: params.message_id, emoji_id: Number(reactionRaw) })
      }

      throw new Error("[sendGroupMessageReaction] API not available")
    },
  })

  dispatcher.register("getMessage", {
    milky: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const seq = toInt(params.message_seq ?? params.seq ?? params.message_id)
      const peerId = toInt(params.peer_id ?? params.group_id ?? params.user_id ?? ctx?.group_id ?? ctx?.user_id)
      const messageScene = params.message_scene || (params.group_id || ctx?.group_id ? "group" : String(ctx?.message_scene || "friend"))
      if (!seq || !peerId) return null
      const res = await runtimeBot?.callApi?.("get_message", { message_scene: messageScene, peer_id: peerId, message_seq: seq }).catch(() => null)
      if (!res) return null
      const msgObj = res?.message ?? res?.data?.message ?? (typeof res === "object" ? res : null)
      const rawSegments = Array.isArray(msgObj?.segments) ? msgObj.segments : []
      if (!rawSegments.length) return null
      return {
        protocol: "milky", message_scene: msgObj?.message_scene ?? messageScene,
        peer_id: msgObj?.peer_id ?? peerId, message_seq: msgObj?.message_seq ?? seq,
        seq: msgObj?.message_seq ?? seq, raw_message: msgObj?.raw_message ?? "",
        segments: rawSegments, message: rawSegments,
      }
    },
    onebotv11: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const messageId = params.message_id ?? params.msgId ?? params.msg_id
      if (!messageId) return null
      const res = await runtimeBot?.callApi?.("get_msg", { message_id: String(messageId) }).catch(() => null)
      if (!res) return null
      const rawSegments = res?.message ?? res?.data?.message
      if (!Array.isArray(rawSegments) || !rawSegments.length) return null
      return { protocol: "onebotv11", raw_message: res?.raw_message ?? res?.data?.raw_message ?? "", segments: rawSegments, message: rawSegments }
    },
    icqq: async () => null,
  })
}

function getOnebotReactionSendApi({ ctx, runtimeBot }) {
  const candidates = [ctx?.bot, globalThis.Bot, runtimeBot]
  for (const target of candidates) {
    if (!target) continue
    if (typeof target.__xunlu_raw_sendApi === "function") return target.__xunlu_raw_sendApi.bind(target)
    if (target.__xunlu_takeover_state) continue
    if (typeof target.sendApi === "function" && !target.sendApi?.__xunlu_universal) return target.sendApi.bind(target)
  }
  return null
}

function getDirectOnebotReactionMethod(runtimeBot) {
  if (!runtimeBot) return null
  if (typeof runtimeBot.__xunlu_raw_sendGroupMessageReaction === "function") return runtimeBot.__xunlu_raw_sendGroupMessageReaction.bind(runtimeBot)
  if (runtimeBot.__xunlu_takeover_state) return null
  const adapterIdentity = String(runtimeBot?.adapterType ?? runtimeBot?.adapter?.name ?? runtimeBot?.adapter_name ?? "").toLowerCase()
  if (!adapterIdentity.includes("onebot")) return null
  return typeof runtimeBot.sendGroupMessageReaction === "function" ? runtimeBot.sendGroupMessageReaction.bind(runtimeBot) : null
}

function getYunzaiSendApi(runtimeBot) {
  if (!runtimeBot || typeof runtimeBot !== "object") return null
  if (typeof runtimeBot.__xunlu_raw_sendApi === "function") return runtimeBot.__xunlu_raw_sendApi.bind(runtimeBot)
  if (runtimeBot.__xunlu_takeover_state && typeof globalThis.Bot?.sendApi === "function" && !globalThis.Bot.sendApi?.__xunlu_universal) return globalThis.Bot.sendApi.bind(globalThis.Bot)
  return null
}
