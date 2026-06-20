import { normalizeProtocolName } from "../../Bot/runtime/shared.js"

function defaultNormalizeEnv(raw) {
  const v = String(raw || "")
  const lower = v.toLowerCase()
  if (lower.includes("onebot")) return "OneBotv11"
  if (lower.includes("milky")) return "milky"
  if (lower.includes("icqq")) return "icqq"
  return "icqq"
}

function getExplicitAdapterEnv(client) {
  if (!client || typeof client !== "object") return ""

  const botQQ = client?.botQQ
  const subBot = botQQ !== undefined && botQQ !== null ? client?.[botQQ] : null
  const raw =
    subBot?.adapter?.name ??
    subBot?.adapterType ??
    subBot?.adapter_name ??
    client?.adapter?.name ??
    client?.adapterType ??
    client?.adapter_name

  if (!raw) return ""
  return defaultNormalizeEnv(raw)
}

function resolveBindingEnvName({ envName, client, event } = {}) {
  const explicitEventEnv = getExplicitAdapterEnv(event?.bot)
  if (explicitEventEnv) return explicitEventEnv

  const explicitClientEnv = getExplicitAdapterEnv(client)
  if (explicitClientEnv) return explicitClientEnv

  return defaultNormalizeEnv(envName)
}

function getNonUniversalBoundMethod(target, methodName) {
  if (!target || (typeof target !== "object" && typeof target !== "function")) return null

  const rawKey = `__xunlu_raw_${methodName}`
  if (typeof target?.[rawKey] === "function") return target[rawKey].bind(target)

  const method = target?.[methodName]
  if (typeof method === "function" && !method?.__xunlu_universal) {
    return method.bind(target)
  }

  return null
}

function getOnebotApiCaller(target) {
  if (!target || typeof target !== "object") return null

  const direct =
    getNonUniversalBoundMethod(target, "sendApi") || getNonUniversalBoundMethod(target, "callApi")
  if (direct) return direct

  const botQQ = target?.botQQ
  const subBot = botQQ !== undefined && botQQ !== null ? target?.[botQQ] : null
  return (
    getNonUniversalBoundMethod(subBot, "sendApi") || getNonUniversalBoundMethod(subBot, "callApi")
  )
}

function getForwardDebugLogger() {
  const l = globalThis.logger
  if (l && typeof l.info === "function") return l
  return console
}

function summarizeForwardInput(messages = []) {
  const list = Array.isArray(messages) ? messages : messages ? [messages] : []
  return list.slice(0, 3).map(item => ({
    user_id: item?.user_id ?? item?.uin ?? item?.id ?? null,
    nickname: item?.nickname ?? item?.sender_name ?? item?.name ?? null,
    contentTypes: (Array.isArray(item?.message) ? item.message : item?.message ? [item.message] : [])
      .slice(0, 5)
      .map(seg => (seg && typeof seg === "object" ? seg.type || typeof seg : typeof seg)),
  }))
}

function summarizeForwardOutput(payload) {
  if (Array.isArray(payload)) {
    return {
      shape: "array",
      length: payload.length,
      itemTypes: payload
        .slice(0, 5)
        .map(item => (item && typeof item === "object" ? item.type || typeof item : typeof item)),
    }
  }

  if (payload && typeof payload === "object") {
    return {
      shape: "object",
      type: payload.type || "",
      keys: Object.keys(payload).slice(0, 8),
      dataShape: Array.isArray(payload.data) ? "array" : typeof payload.data,
    }
  }

  return { shape: typeof payload, preview: String(payload || "") }
}

function logForwardDebug(stage, detail = {}) {
  getForwardDebugLogger().info?.(`[xunlu-core][forward-debug] ${stage}`, detail)
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

      const explicitAdapterEnv = getExplicitAdapterEnv(client)
      if (explicitAdapterEnv && explicitAdapterEnv !== "icqq") {
        return explicitAdapterEnv
      }

      const botKeys = Object.keys(client || {})
      try {
        if (botKeys.includes("lain")) {
          return explicitAdapterEnv || "icqq"
        }
        if (botKeys.includes("uin") && botKeys.includes("QQNT")) {
          return explicitAdapterEnv || "icqq"
        }
        return explicitAdapterEnv || "icqq"
      } catch {
        return explicitAdapterEnv || "icqq"
      }
    },

    decorateRuntimeBot({ bot, envName, pluginLoader, fileManager, sendMessage } = {}) {
      if (!bot) return bot

      bot.sendMessage = sendMessage
      bot.makeGroupForwardMsg = async (msg, group_id) => {
        const detail = {
          envName,
          group_id: group_id ?? null,
          packageName: fileManager?.package?.name || "",
          input: summarizeForwardInput(msg),
        }
        if (envName == "OneBotv11" && fileManager?.package?.name != "trss-yunzai") {
          let { OneBotV11Adapter } = await import("../../Bot/adapter/index.js")
          logForwardDebug("runtimeBot.makeGroupForwardMsg:route", {
            ...detail,
            route: "OneBotV11Adapter.makeForwardMsg",
          })
          const result = new OneBotV11Adapter().makeForwardMsg(msg)
          logForwardDebug("runtimeBot.makeGroupForwardMsg:result", {
            ...detail,
            route: "OneBotV11Adapter.makeForwardMsg",
            output: summarizeForwardOutput(result),
          })
          return result
        } else if (fileManager?.package?.name == "trss-yunzai") {
          logForwardDebug("runtimeBot.makeGroupForwardMsg:route", {
            ...detail,
            route: "trss-yunzai.node-wrapper",
          })
          const result = { type: "node", data: msg }
          logForwardDebug("runtimeBot.makeGroupForwardMsg:result", {
            ...detail,
            route: "trss-yunzai.node-wrapper",
            output: summarizeForwardOutput(result),
          })
          return result
        } else {
          logForwardDebug("runtimeBot.makeGroupForwardMsg:route", {
            ...detail,
            route: "bot.pickGroup(...).makeForwardMsg",
          })
          const result = await bot.pickGroup(group_id).makeForwardMsg(msg)
          logForwardDebug("runtimeBot.makeGroupForwardMsg:result", {
            ...detail,
            route: "bot.pickGroup(...).makeForwardMsg",
            output: summarizeForwardOutput(result),
          })
          return result
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
      const actualEnvName = resolveBindingEnvName({ envName, client, event: e })
      e.adapterType = actualEnvName === "OneBotv11" ? "OneBotV11" : actualEnvName

      const protocol =
        actualEnvName === "OneBotv11" ? "onebotv11" : actualEnvName === "milky" ? "milky" : "icqq"
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

      if (actualEnvName === "OneBotv11") {
        e.adapterType = "OneBotV11"
        const onebotApi =
          getOnebotApiCaller(e?.bot) || getOnebotApiCaller(client) || getOnebotApiCaller(globalThis.Bot)
        e.getMsg = async msg_id => {
          if (!onebotApi) throw new Error("onebot api not available")
          return await onebotApi("get_msg", { message_id: msg_id })
        }
      } else if (actualEnvName === "icqq") {
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
          return resolvedMsgId ? await globalThis.Bot.getMsg(resolvedMsgId) : null
        }
        e.getReplyMsg = async seq => {
          if (e.group_id) return await globalThis.Bot.pickGroup(e.group_id).getChatHistory(seq, 1)
          return await globalThis.Bot.pickFriend(e.user_id).getChatHistory(seq, 1)
        }
      } else if (actualEnvName === "milky") {
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
            const { UniversalMessage } = await import("../../Bot/message/index.js")
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
