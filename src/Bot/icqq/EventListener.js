import Filemage from "../../utils/Filemage.js"
import lodash from "lodash"
import pluginLoader from "./pluginLoader.js"
import MessageDB from "../../db/MessageDB.js"
import { UniversalMessage } from "../message/universal-message.js"
import { coerceToUniversalMessage } from "../message/context.js"
import { applyUniversalBotApi } from "../api/universal-bot-api.js"
import { rememberRuntimeLastGroupMessage } from "../runtime-last-message.js"
import { startControlServer } from "../../lib/controlServer.js"
import { startWebuiServer } from "../../lib/webuiServer.js"
import { simulateIncomingMessage } from "../message/cli-simulator.js"
let BotEnv

const OUTGOING_GROUP_SEND_MARK = Symbol.for("xunlu.outgoing.group.send.remembered")
const OUTGOING_GROUP_SEND_DEDUPE_TTL_MS = 5000

function toId(value) {
  if (value === undefined || value === null) return ""
  return String(value).trim()
}

function toFiniteId(value) {
  const text = toId(value)
  if (!text) return undefined
  const num = Number(text)
  return Number.isFinite(num) ? num : text
}

function getRuntimeBotSelfId(botLike) {
  return (
    botLike?.uin ??
    botLike?.self_id ??
    botLike?.user_id ??
    globalThis.Bot?.uin ??
    globalThis.Bot?.self_id ??
    globalThis.Bot?.user_id ??
    ""
  )
}

function getGroupIdFromSendTarget(target) {
  if (!target || typeof target !== "object") return undefined
  return target.group_id ?? target.groupId ?? target.gid ?? undefined
}

function getOutgoingGroupSendDedupeMap() {
  if (!(globalThis.__xunlu_outgoing_group_send_dedupe_map instanceof Map)) {
    globalThis.__xunlu_outgoing_group_send_dedupe_map = new Map()
  }
  return globalThis.__xunlu_outgoing_group_send_dedupe_map
}

function cleanupOutgoingGroupSendDedupe(now = Date.now()) {
  const map = getOutgoingGroupSendDedupeMap()
  for (const [key, ts] of map.entries()) {
    if (now - Number(ts || 0) > OUTGOING_GROUP_SEND_DEDUPE_TTL_MS) {
      map.delete(key)
    }
  }
  while (map.size > 1000) {
    const firstKey = map.keys().next()
    if (firstKey.done) break
    map.delete(firstKey.value)
  }
}

function getSendResultId(result) {
  const raw =
    result?.message_id ??
    result?.data?.message_id ??
    result?.seq ??
    result?.data?.seq ??
    result?.message_seq ??
    result?.data?.message_seq
  if (raw === undefined || raw === null) return ""
  if (Array.isArray(raw)) return raw.map(v => String(v)).join(",")
  return String(raw)
}

function rememberOutgoingGroupMessage({ bot, groupId, message, result } = {}) {
  const gid = toId(groupId)
  if (!gid) return false

  if (result && typeof result === "object" && result[OUTGOING_GROUP_SEND_MARK]) {
    return false
  }

  const now = Date.now()
  cleanupOutgoingGroupSendDedupe(now)

  const sendResultId = getSendResultId(result)
  const dedupeKey = sendResultId ? `${gid}:${sendResultId}` : ""
  const dedupeMap = getOutgoingGroupSendDedupeMap()
  if (dedupeKey && dedupeMap.has(dedupeKey)) {
    if (result && typeof result === "object") {
      try {
        result[OUTGOING_GROUP_SEND_MARK] = true
      } catch {}
    }
    return false
  }

  const selfId = getRuntimeBotSelfId(bot)
  const remembered = rememberRuntimeLastGroupMessage({
    group_id: gid,
    user_id: selfId,
    sender_id: selfId,
    self_id: selfId,
    message,
    isMaster: false,
    isBot: true,
    ts: now,
  })

  if (dedupeKey && remembered) dedupeMap.set(dedupeKey, now)
  if (result && typeof result === "object") {
    try {
      result[OUTGOING_GROUP_SEND_MARK] = true
    } catch {}
  }
  return remembered
}

function patchMethodOnce(target, methodName, patchKey, wrapFn) {
  if (!target || typeof target !== "object") return
  const current = target[methodName]
  if (typeof current !== "function") return
  if (current?.[patchKey]) return

  const raw = current
  const wrapped = wrapFn(raw)
  try {
    wrapped[patchKey] = true
    wrapped.__xunlu_raw = raw
  } catch {}
  target[methodName] = wrapped
}

function installIcqqRuntimeGroupSendHooks(bot) {
  if (!bot || typeof bot !== "object") return
  if (globalThis.__xunlu_icqq_runtime_group_send_hooks_installed) return

  const tryGetProto = fn => {
    try {
      const obj = fn()
      if (!obj) return null
      return Object.getPrototypeOf(obj)
    } catch {
      return null
    }
  }

  const patchGroupProto = proto => {
    patchMethodOnce(proto, "sendMsg", "__xunlu_runtime_group_send_hook", raw => {
      return async function patchedGroupSendMsg(content, ...args) {
        const res = await raw.call(this, content, ...args)
        rememberOutgoingGroupMessage({
          bot: this?.c || bot,
          groupId: this?.gid ?? this?.group_id,
          message: content,
          result: res,
        })
        return res
      }
    })
  }

  const patchBotMethods = targetBot => {
    if (!targetBot || typeof targetBot !== "object") return

    patchMethodOnce(targetBot, "sendGroupMsg", "__xunlu_runtime_send_group_msg_hook", raw => {
      return async function patchedSendGroupMsg(group_id, message, ...args) {
        const res = await raw.call(this, group_id, message, ...args)
        rememberOutgoingGroupMessage({
          bot: this || targetBot,
          groupId: group_id,
          message,
          result: res,
        })
        return res
      }
    })

    patchMethodOnce(targetBot, "sendMsg", "__xunlu_runtime_send_msg_hook", raw => {
      return async function patchedSendMsg(target, message, ...args) {
        const res = await raw.call(this, target, message, ...args)
        const groupId = getGroupIdFromSendTarget(target)
        if (groupId !== undefined && groupId !== null) {
          rememberOutgoingGroupMessage({
            bot: this || targetBot,
            groupId,
            message,
            result: res,
          })
        }
        return res
      }
    })
  }

  const mainBot = bot
  const subBot = bot?.botQQ ? bot?.[bot.botQQ] : null
  const seedId = toFiniteId(mainBot?.uin ?? subBot?.uin ?? 10000)

  patchGroupProto(tryGetProto(() => mainBot?.pickGroup?.(seedId)))
  patchBotMethods(mainBot)

  if (subBot && subBot !== mainBot) {
    patchGroupProto(tryGetProto(() => subBot?.pickGroup?.(seedId)))
    patchBotMethods(subBot)
  }

  globalThis.__xunlu_icqq_runtime_group_send_hooks_installed = true
}

const sendMessage = async (ctx, message) => {
  try {
    const protocol = BotEnv === "OneBotv11" ? "onebotv11" : BotEnv === "milky" ? "milky" : "icqq"

    const pickPrivate = userId => {
      const uid = Number(userId)
      if (!Number.isFinite(uid)) return null
      // 优先 pickFriend（多数云崽环境），否则回退 pickUser（部分环境仅提供 pickUser）
      if (typeof Bot?.pickFriend === "function") return Bot.pickFriend(uid)
      if (typeof Bot?.pickUser === "function") return Bot.pickUser(uid)
      return null
    }

    const rawList = Array.isArray(message) ? message : message ? [message] : []

    // onebot 转发（node）保持原样透传
    if (protocol === "onebotv11" && rawList.some(i => i?.type === "node")) {
      if (typeof ctx === "string" || typeof ctx === "number") {
        const target = pickPrivate(ctx)
        if (!target) throw new Error("invalid private target (pickFriend/pickUser not available)")
        return await target.sendMsg(rawList)
      }
      if (ctx?.group_id) {
        return await Bot.pickGroup(Number(ctx.group_id)).sendMsg(rawList)
      }
    }

    const universalMsg =
      message instanceof UniversalMessage ? message : coerceToUniversalMessage(message)

    // milky: adapter.sendMsg 支持直接接收 UniversalMessageSegment[]（更完整，且支持 forward 段）
    const outSegments = protocol === "milky" ? universalMsg.segments : universalMsg.convertTo(protocol)

    if (typeof ctx === "string" || typeof ctx === "number") {
      const target = pickPrivate(ctx)
      if (!target) throw new Error("invalid private target (pickFriend/pickUser not available)")
      return await target.sendMsg(outSegments)
    }

    if (ctx?.group_id) {
      return await Bot.pickGroup(Number(ctx.group_id)).sendMsg(outSegments)
    }

    if (ctx?.user_id) {
      const target = pickPrivate(ctx.user_id)
      if (!target) throw new Error("invalid private target (pickFriend/pickUser not available)")
      return await target.sendMsg(outSegments)
    }

    throw new Error("invalid send target")
  } catch (err) {
    console.error("[sendMessage] failed:", err)
    return null
  }
}
const filemag = new Filemage(process.cwd() + "/plugins/xunlu-core/src/Bot/icqq/Event")
export default class EventListener {
  /**
   * 事件监听
   * @param data.prefix 事件名称前缀
   * @param data.event 监听的事件
   * @param data.once 是否只监听一次
   */
  constructor(data) {
    this.prefix = data.prefix || ""
    this.event = data.event
    this.once = data.once || false
    this.plugins = pluginLoader
  }
}

/**
 * 加载监听事件
 */
class ListenerLoader {
  /**
   * 监听事件加载
   * @param client Bot示例
   */
  async load(client) {
    this.client = client
    pluginLoader.Bot = client

    let botenv = this.checkEnv()
    BotEnv = botenv
    if (botenv === "icqq") {
      installIcqqRuntimeGroupSendHooks(this.client)
    }

    // 先绑定事件能力，再加载插件（确保 register()/onMount/callFnc 可用）
    const bindEvent = { reply: pluginLoader.reply.bind(pluginLoader) }
    this.bindEvent(bindEvent, botenv)
    pluginLoader.bindEvent = bindEvent

    // 补齐：bindEvent/bot 全量通用 API
    const universalOverride = [
      "getLoginInfo",
      "getFriendList",
      "getFriendInfo",
      "getGroupList",
      "getGroupInfo",
      "setGroupName",
      "setGroupMemberCard",
      "setGroupMemberAdmin",
      "setGroupMemberSpecialTitle",
      "setGroupWholeMute",
      "kickGroupMember",
      "quitGroup",
      "acceptFriendRequest",
      "rejectFriendRequest",
      "sendGroupMessageReaction",
      "acceptGroupRequest",
      "rejectGroupRequest",
      "getUserInfo",
      "getGroupMemberList",
      "getGroupMemberInfo",
      "setGroupMemberMute",
      "pickUser",
    ]

    applyUniversalBotApi(bindEvent, { bot: pluginLoader, adapterHint: botenv, override: universalOverride })
    try {
      // eslint-disable-next-line no-undef
      applyUniversalBotApi(Bot, { bot: pluginLoader, adapterHint: botenv, override: universalOverride })
    } catch {}

    await pluginLoader.initBot()
    await pluginLoader.runMount()

    try {
      startControlServer({
        getStatus: () => ({
          protocol: botenv === "OneBotv11" ? "onebotv11" : "icqq",
          adapterType: botenv,
          pluginCount: Object.keys(pluginLoader.plugins || {}).length,
          plugins: Object.keys(pluginLoader.plugins || {}),
        }),
        reloadPlugins: async () => {
          return await pluginLoader.reloadBotPlugins({ cacheBust: true })
        },
        sendMessage: async payload => {
          const protocol = botenv === "OneBotv11" ? "onebotv11" : "icqq"
          return await simulateIncomingMessage({
            bot: pluginLoader,
            protocol,
            adapterType: botenv,
            payload,
            selfId: this.client?.uin,
          })
        },
      })
    } catch (err) {
      console.warn("[ListenerLoader] control server start failed:", err)
    }

    try {
      await startWebuiServer()
    } catch (err) {
      console.warn("[ListenerLoader] webui server start failed:", err)
    }

    Bot.sendMessage = sendMessage
    console.log("filepack:" + filemag.package.name)

    Bot.makeGroupForwardMsg = async (msg, group_id) => {
      if (botenv == "OneBotv11" && filemag.package.name != "trss-yunzai") {
        let { default: oneBotV11Adapter } = await import("../onebotV11/onebot.js")
        return new oneBotV11Adapter().makeForwardMsg(msg)
      } else if (filemag.package.name == "trss-yunzai") {
        return { type: "node", data: msg }
      } else {
        return await Bot.pickGroup(group_id).makeForwardMsg(msg)
      }
    }

    Bot.renderImg = pluginLoader.renderImg
    if (!Bot.getGroupMemberList) {
      Bot.getGroupMemberList = async group_id => {
        console.log(group_id)
        return await Bot.pickGroup(Number(group_id)).getMemberMap()
      }
    }

    Bot.getGroupChatHistory = pluginLoader.getGroupHistoryMsg

    const files = filemag.GetfileList().filter(file => file.endsWith(".js"))
    for (let File of files) {
      try {
        let listener = await import(`./Event/${File}`)

        /* eslint-disable new-cap */
        if (!listener.default) continue
        listener = new listener.default()
        listener.client = this.client
        const on = listener.once ? "once" : "on"

        if (lodash.isArray(listener.event)) {
          listener.event.forEach(type => {
            const e = listener[type] ? type : "execute"
            this.client[on](listener.prefix + type, event => {
              this.bindEvent(event, botenv)
              return listener[e](event)
            })
          })
        } else {
          const e = listener[listener.event] ? listener.event : "execute"
          this.client[on](listener.prefix + listener.event, event => {
            this.bindEvent(event, botenv)
            return listener[e](event)
          })
        }
      } catch (e) {
        logger.mark(`监听事件错误：${File}`)
        logger.error(e)
      }
    }
  }

  checkEnv() {
    // takeover 场景：优先读取 takeover 注入的协议类型（避免被 QQNT 误判为 icqq）
    try {
      const p = this.client?.__xunlu_takeover_state?.protocol
      if (p === "onebotv11") return "OneBotv11"
      if (p === "milky") return "milky"
    } catch {}

    const Botkeys = Object.keys(this.client)
    console.log(Object.keys(this.client))

    const normalizeEnv = raw => {
      const v = String(raw || "")
      const lower = v.toLowerCase()
      if (lower.includes("onebot")) return "OneBotv11"
      if (lower.includes("milky")) return "milky"
      if (lower.includes("icqq")) return "icqq"
      return "icqq"
    }

    try {
      if (Botkeys.includes("lain")) {
        this.bot = this.client[this.client.botQQ]
        return normalizeEnv(this.client[this.client.botQQ]?.adapter?.name)
      }

      if (Botkeys.includes("uin") && Botkeys.includes("QQNT")) {
        return "icqq"
      }

      return normalizeEnv(this.client[this.client.botQQ]?.adapter?.name)
    } catch {
      return "icqq"
    }
  }

  bindEvent(e, env) {
    e.adapterType = "icqq"
    const targetE = e

    const protocol = env === "OneBotv11" ? "onebotv11" : env === "milky" ? "milky" : "icqq"
    const isTakeover = Boolean(this.client?.__xunlu_takeover_state?.protocol) && protocol !== "icqq"
    e.protocol = protocol
    e.__xunluTakeover = isTakeover
    if (isTakeover && e.__commandUsageSource === undefined) {
      e.__commandUsageSource = "yunzai-takeover"
    }

    // 兜底补齐 BaseBot.filtEvent 依赖字段（仅在缺失时）
    if (!e.post_type && Array.isArray(e.message)) {
      e.post_type = "message"
      e.message_type = e.group_id ? "group" : "private"
      e.sub_type = e.sub_type || "normal"
    }
    if (env === "OneBotv11") {
      e.adapterType = "OneBotv11"

      const getOneBotSendApi = () => {
        try {
          if (Bot?.sendApi) return Bot.sendApi.bind(Bot)
        } catch {}
        try {
          const qq = Bot?.botQQ
          const sub = qq ? Bot?.[qq] : null
          if (sub?.sendApi) return sub.sendApi.bind(sub)
        } catch {}
        return null
      }
      const onebotSendApi = getOneBotSendApi()

      const recallMessage = async ({ peer_id, message_seq, message_id, isGroup }) => {
        console.log(peer_id)

        try {
          const mid = message_id ?? message_seq
          if (mid === undefined || mid === null) return false

          if (isGroup) {
            return await Bot.pickGroup(peer_id).recallMsg(mid)
          }
          return await Bot.pickFriend(peer_id).recallMsg(mid)
        } catch (error) {
          console.warn("[recallMessage] milky failed:", error?.message || error)
          throw error
        }
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

      e.recallMessage = recallMessage
      e.sendMessage = sendMessage
      e.renderImg = pluginLoader.renderImg
      e.getMsg = async msg_id => {
        if (!onebotSendApi) throw new Error("onebot sendApi not available")
        return await onebotSendApi("get_msg", {
          message_id: msg_id,
        })
      }
      e.getGroupMemberInfo = async (group_id, user_id) => {
        if (!onebotSendApi) throw new Error("onebot sendApi not available")
        return await onebotSendApi("get_group_member_info", {
          group_id,
          user_id,
        })
      }
      e.getGroupMemberList = async group_id => {
        let memberList
        if (filemag.package.name === "trss-yunzai") {
          memberList = await Bot.pickGroup(group_id).getMemberMap()
        } else {
          memberList = await Bot.getGroupMemberList(group_id)
        }

        console.log("memberList:", memberList)

        return memberList
      }
    } else if (env === "icqq") {
      const recallMessage = async ({ peer_id, message_seq, isGroup }) => {
        try {
          if (isGroup) {
            return await Bot.pickGroup(peer_id).recallMsg(message_seq)
          } else {
            return await Bot.pickFriend(peer_id).recallMsg(message_seq)
          }
        } catch (error) {
          console.log(error)
          return false
        }
      }
      e.sendGroupMessageReaction = async ({ group_id, message_seq, seq, reaction, emoji_id } = {}) => {
        try {
          const gid = Number(group_id ?? targetE.group_id)
          const messageSeq = Number(message_seq ?? seq ?? targetE.seq)
          const rid = reaction ?? emoji_id
          if (!gid || !messageSeq || rid === undefined || rid === null) return false
          const group = Bot.pickGroup(gid)
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
      e.recallMessage = recallMessage

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
        return resolvedMsgId ? await Bot.getMsg(resolvedMsgId) : null
      }
      e.getReplyMsg = async seq => {
        if (e.group_id) {
          return await Bot.pickGroup(e.group_id).getChatHistory(seq, 1)
        }
        return await Bot.pickFriend(e.user_id).getChatHistory(seq, 1)
      }
      e.getGroupMemberInfo = Bot.getGroupMemberInfo.bind(Bot)
      e.getGroupMemberList = Bot.getGroupMemberList.bind(Bot)
    } else if (env === "milky") {
      e.adapterType = "milky"

      const getMilkySendApi = () => {
        try {
          if (Bot?.sendApi) return Bot.sendApi.bind(Bot)
        } catch {}
        try {
          const qq = Bot?.botQQ
          const sub = qq ? Bot?.[qq] : null
          if (sub?.sendApi) return sub.sendApi.bind(sub)
        } catch {}
        return null
      }
      const milkySendApi = getMilkySendApi()

      const recallMessage = async ({ peer_id, message_seq, message_id, isGroup }) => {
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
            // fallback: let patched icqq entity handle it
            return await Bot.pickGroup(gid).recallMsg(seq)
          }

          const uid = Number(peer_id ?? e.user_id)
          if (!uid) return false
          if (milkySendApi) {
            await milkySendApi("recall_private_message", { user_id: uid, message_seq: seq })
            return true
          }
          return await Bot.pickFriend(uid).recallMsg(seq)
        } catch (error) {
          console.log(error)
          return false
        }
      }

      e.recallMessage = recallMessage

      // milky getMessage: 优先走本地消息库（更稳定），否则走 milky API
      e.getMsg = async message_seq => {
        const seq = Number(message_seq)
        if (!Number.isFinite(seq)) throw new Error("milky getMsg requires message_seq")

        const message_scene = e.group_id ? "group" : "friend"
        const peer_id = e.group_id ? Number(e.group_id) : Number(e.user_id)
        if (!peer_id) throw new Error("milky getMsg requires peer_id (group_id/user_id)")

        if (e.group_id) {
          const rec = await MessageDB.getMessageById(e.group_id, String(seq))
          if (rec) return rec
        }

        if (!milkySendApi) throw new Error("milky sendApi not available")
        const res = await milkySendApi("get_message", { message_scene, peer_id, message_seq: seq })

        const msgObj = res?.message ?? res?.data?.message ?? (res && typeof res === "object" ? res : null)
        const rawSegments = Array.isArray(msgObj?.segments) ? msgObj.segments : []
        try {
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
        return await milkySendApi("get_group_member_info", {
          group_id,
          user_id,
        })
      }

      e.getGroupMemberList = async group_id => {
        if (!milkySendApi) throw new Error("milky sendApi not available")
        return await milkySendApi("get_group_member_list", { group_id })
      }
    }
    e.sendMessage = sendMessage
    e.makeGroupForwardMsg = pluginLoader.makeForwardMsg
    e.renderImg = pluginLoader.renderImg
    delete e.client
  }
}

export { ListenerLoader }
