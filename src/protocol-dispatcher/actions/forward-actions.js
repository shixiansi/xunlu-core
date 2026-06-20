import {
  getRuntimeBotOrNull,
  toInt,
} from "../../Bot/api/universal-bot-api-utils.js"

export function registerForwardActions(dispatcher) {
  dispatcher.register("getForwardMessages", {
    onebotv11: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const forwardId = String(params.forward_id ?? params.id ?? "").trim()
      const groupId = toInt(params.group_id ?? ctx?.group_id)
      const userId = toInt(params.user_id ?? ctx?.user_id ?? ctx?.sender_id)

      if (groupId && typeof runtimeBot?.pickGroup === "function") {
        try {
          const g = runtimeBot.pickGroup(groupId)
          if (typeof g?.getForwardMsg === "function") {
            const detail = await g.getForwardMsg(forwardId)
            if (Array.isArray(detail) && detail.length) return detail
            if (Array.isArray(detail?.messages) && detail.messages.length) return detail.messages
          }
        } catch {}
      }
      if (userId) {
        const pickTarget = (typeof runtimeBot?.pickFriend === "function" && runtimeBot.pickFriend(userId)) || (typeof runtimeBot?.pickUser === "function" && runtimeBot.pickUser(userId))
        if (typeof pickTarget?.getForwardMsg === "function") {
          try {
            const detail = await pickTarget.getForwardMsg(forwardId)
            if (Array.isArray(detail) && detail.length) return detail
            if (Array.isArray(detail?.messages) && detail.messages.length) return detail.messages
          } catch {}
        }
      }
      return null
    },
    milky: async (params, ctx) => {
      const runtimeBot = getRuntimeBotOrNull()
      const forwardId = String(params.forward_id ?? params.id ?? "").trim()
      const groupId = toInt(params.group_id ?? ctx?.group_id)
      const userId = toInt(params.user_id ?? ctx?.user_id ?? ctx?.sender_id)
      const peerId = groupId || userId || ""
      const messageScene = params.message_scene || (groupId ? "group" : String(ctx?.message_scene || "friend"))

      if (typeof runtimeBot?.getForwardMessage === "function") {
        try {
          const detail = await runtimeBot.getForwardMessage({ forward_id: forwardId, peer_id: peerId, message_scene: messageScene })
          if (Array.isArray(detail?.messages) && detail.messages.length) return detail.messages
        } catch {}
      }
      return null
    },
    icqq: async () => null,
  })
}
