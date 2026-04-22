import { normalizeProtocolName } from "../../Bot/runtime/shared.js"

function defaultNormalizeEnv(raw) {
  const v = String(raw || "")
  const lower = v.toLowerCase()
  if (lower.includes("onebot")) return "OneBotv11"
  if (lower.includes("milky")) return "milky"
  if (lower.includes("icqq")) return "icqq"
  return "icqq"
}

/**
 * icqq binding 负责把 yunzai / icqq / takeover 这条历史最重的协议分支封装起来。
 *
 * 它本轮仍保留较多兼容细节，但 listener 本体只负责调用 binding，不再自己承载大段分支。
 */
export function createIcqqBinding() {
  return {
    detectEnv(client) {
      try {
        const p = client?.__xunlu_takeover_state?.protocol
        if (p === "onebotv11") return "OneBotv11"
        if (p === "milky") return "milky"
      } catch {}

      const botKeys = Object.keys(client || {})
      try {
        if (botKeys.includes("lain")) {
          return defaultNormalizeEnv(client?.[client?.botQQ]?.adapter?.name)
        }
        if (botKeys.includes("uin") && botKeys.includes("QQNT")) {
          return "icqq"
        }
        return defaultNormalizeEnv(client?.[client?.botQQ]?.adapter?.name)
      } catch {
        return "icqq"
      }
    },

    decorateRuntimeBot({ bot, envName, pluginLoader, fileManager, sendMessage } = {}) {
      if (!bot) return bot

      bot.sendMessage = sendMessage
      bot.makeGroupForwardMsg = async (msg, group_id) => {
        if (envName == "OneBotv11" && fileManager?.package?.name != "trss-yunzai") {
          let { OneBotV11Adapter } = await import("../../Bot/adapter/index.js")
          return new OneBotV11Adapter().makeForwardMsg(msg)
        } else if (fileManager?.package?.name == "trss-yunzai") {
          return { type: "node", data: msg }
        } else {
          return await bot.pickGroup(group_id).makeForwardMsg(msg)
        }
      }

      bot.renderImg = pluginLoader.renderImg.bind(pluginLoader)
      if (!bot.getGroupMemberList) {
        bot.getGroupMemberList = async group_id => {
          return await bot.pickGroup(Number(group_id)).getMemberMap()
        }
      }
      bot.getGroupChatHistory = pluginLoader.getGroupHistoryMsg
      return bot
    },

    async decorateBindEvent(e, { envName, client, pluginLoader, fileManager, sendMessage } = {}) {
      e.adapterType = "icqq"
      const targetE = e

      const protocol = envName === "OneBotv11" ? "onebotv11" : envName === "milky" ? "milky" : "icqq"
      const isTakeover = Boolean(client?.__xunlu_takeover_state?.protocol) && protocol !== "icqq"
      e.protocol = protocol
      e.__xunluTakeover = isTakeover
      if (isTakeover && e.__commandUsageSource === undefined) {
        e.__commandUsageSource = "yunzai-takeover"
      }

      if (!e.post_type && Array.isArray(e.message)) {
        e.post_type = "message"
        e.message_type = e.group_id ? "group" : "private"
        e.sub_type = e.sub_type || "normal"
      }

      if (envName === "OneBotv11") {
        e.adapterType = "OneBotV11"

        const getOneBotSendApi = () => {
          try {
            if (bot?.sendApi) return bot.sendApi.bind(bot)
          } catch {}
          try {
            const qq = bot?.botQQ
            const sub = qq ? bot?.[qq] : null
            if (sub?.sendApi) return sub.sendApi.bind(sub)
          } catch {}
          return null
        }
        const bot = globalThis.Bot
        const onebotSendApi = getOneBotSendApi()

        e.recallMessage = async ({ peer_id, message_seq, message_id, isGroup }) => {
          const mid = message_id ?? message_seq
          if (mid === undefined || mid === null) return false
          if (isGroup) return await bot.pickGroup(peer_id).recallMsg(mid)
          return await bot.pickFriend(peer_id).recallMsg(mid)
        }
        e.sendGroupMessageReaction = async ({ reaction, emoji_id } = {}) => {
          try {
            const rid = reaction ?? emoji_id
            if (rid === undefined || rid === null) return false
            if (!onebotSendApi) throw new Error("onebot sendApi not available")
            await onebotSendApi("set_msg_emoji_like", {
              message_id: targetE.message_id,
              emoji_id: Number(rid),
            })
            return true
          } catch (err) {
            console.warn("[sendGroupMessageReaction] icqq(onebotv11) failed:", err?.message || err)
            return false
          }
        }
        e.getMsg = async msg_id => {
          if (!onebotSendApi) throw new Error("onebot sendApi not available")
          return await onebotSendApi("get_msg", { message_id: msg_id })
        }
        e.getGroupMemberInfo = async (group_id, user_id) => {
          if (!onebotSendApi) throw new Error("onebot sendApi not available")
          return await onebotSendApi("get_group_member_info", { group_id, user_id })
        }
        e.getGroupMemberList = async group_id => {
          if (fileManager?.package?.name === "trss-yunzai") {
            return await bot.pickGroup(group_id).getMemberMap()
          }
          return await bot.getGroupMemberList(group_id)
        }
      } else if (envName === "icqq") {
        const bot = globalThis.Bot
        e.recallMessage = async ({ peer_id, message_seq, isGroup }) => {
          try {
            if (isGroup) return await bot.pickGroup(peer_id).recallMsg(message_seq)
            return await bot.pickFriend(peer_id).recallMsg(message_seq)
          } catch {
            return false
          }
        }
        e.sendGroupMessageReaction = async ({ group_id, message_seq, seq, reaction, emoji_id } = {}) => {
          try {
            const gid = Number(group_id ?? targetE.group_id)
            const messageSeq = Number(message_seq ?? seq ?? targetE.seq)
            const rid = reaction ?? emoji_id
            if (!gid || !messageSeq || rid === undefined || rid === null) return false
            const group = bot.pickGroup(gid)
            if (group?.setReaction) {
              await group.setReaction(messageSeq, Number(rid))
              return true
            }
            return false
          } catch (err) {
            console.warn("[sendGroupMessageReaction] icqq failed:", err?.message || err)
            return false
          }
        }
        e.getMsg = async msg_id => {
          const genGroupMessageId = (gid, uin, seq, rand, time, pktnum = 1) => {
            const buf = Buffer.allocUnsafe(21)
            buf.writeUInt32BE(gid)
            buf.writeUInt32BE(uin, 4)
            buf.writeInt32BE(seq & 0xffffffff, 8)
            buf.writeInt32BE(rand & 0xffffffff, 12)
            buf.writeUInt32BE(time, 16)
            buf.writeUInt8(pktnum > 1 ? pktnum : 1, 20)
            return buf.toString("base64")
          }
          let resolvedMsgId = msg_id
          if (!resolvedMsgId && e.source) {
            let { seq, time, rand } = e.source
            resolvedMsgId = genGroupMessageId(e.group_id, e.user_id, seq, rand, time)
          }
          return resolvedMsgId ? await bot.getMsg(resolvedMsgId) : null
        }
        e.getReplyMsg = async seq => {
          if (e.group_id) return await bot.pickGroup(e.group_id).getChatHistory(seq, 1)
          return await bot.pickFriend(e.user_id).getChatHistory(seq, 1)
        }
        e.getGroupMemberInfo = bot.getGroupMemberInfo.bind(bot)
        e.getGroupMemberList = bot.getGroupMemberList.bind(bot)
      } else if (envName === "milky") {
        e.adapterType = "milky"
        const bot = globalThis.Bot

        const getMilkySendApi = () => {
          try {
            if (bot?.sendApi) return bot.sendApi.bind(bot)
          } catch {}
          try {
            const qq = bot?.botQQ
            const sub = qq ? bot?.[qq] : null
            if (sub?.sendApi) return sub.sendApi.bind(sub)
          } catch {}
          return null
        }
        const milkySendApi = getMilkySendApi()

        e.recallMessage = async ({ peer_id, message_seq, message_id, isGroup }) => {
          try {
            const seq = Number(message_seq ?? message_id)
            if (!Number.isFinite(seq)) return false

            if (isGroup) {
              const gid = Number(peer_id ?? e.group_id)
              if (!gid) return false
              if (milkySendApi) {
                await milkySendApi("recall_group_message", { group_id: gid, message_seq: seq })
                return true
              }
              return await bot.pickGroup(gid).recallMsg(seq)
            }

            const uid = Number(peer_id ?? e.user_id)
            if (!uid) return false
            if (milkySendApi) {
              await milkySendApi("recall_private_message", { user_id: uid, message_seq: seq })
              return true
            }
            return await bot.pickFriend(uid).recallMsg(seq)
          } catch {
            return false
          }
        }

        e.getMsg = async message_seq => {
          const seq = Number(message_seq)
          if (!Number.isFinite(seq)) throw new Error("milky getMsg requires message_seq")

          const message_scene = e.group_id ? "group" : "friend"
          const peer_id = e.group_id ? Number(e.group_id) : Number(e.user_id)
          if (!peer_id) throw new Error("milky getMsg requires peer_id (group_id/user_id)")

          if (e.group_id) {
            const { default: MessageDB } = await import("../../db/MessageDB.js")
            const rec = await MessageDB.getMessageById(e.group_id, String(seq))
            if (rec) return rec
          }

          if (!milkySendApi) throw new Error("milky sendApi not available")
          const res = await milkySendApi("get_message", { message_scene, peer_id, message_seq: seq })

          const msgObj = res?.message ?? res?.data?.message ?? (res && typeof res === "object" ? res : null)
          const rawSegments = Array.isArray(msgObj?.segments) ? msgObj.segments : []
          try {
            const { UniversalMessage } = await import("../../Bot/message/universal-message.js")
            const universalMessage = UniversalMessage.from("milky", rawSegments)
            return {
              protocol: "milky",
              adapterType: "milky",
              ...(msgObj && typeof msgObj === "object" ? msgObj : {}),
              message_scene: msgObj?.message_scene ?? message_scene,
              peer_id: msgObj?.peer_id ?? peer_id,
              message_seq: msgObj?.message_seq ?? seq,
              seq: msgObj?.message_seq ?? seq,
              segments: rawSegments,
              universalMessage,
              message: universalMessage.segments,
            }
          } catch {
            return res
          }
        }

        e.getGroupMemberInfo = async (group_id, user_id) => {
          if (!milkySendApi) throw new Error("milky sendApi not available")
          return await milkySendApi("get_group_member_info", { group_id, user_id })
        }
        e.getGroupMemberList = async group_id => {
          if (!milkySendApi) throw new Error("milky sendApi not available")
          return await milkySendApi("get_group_member_list", { group_id })
        }
      }

      e.sendMessage = sendMessage
      e.makeGroupForwardMsg = pluginLoader.makeForwardMsg
      e.renderImg = pluginLoader.renderImg.bind(pluginLoader)
      delete e.client
      return e
    },
  }
}

export default createIcqqBinding
