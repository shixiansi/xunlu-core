import cfg from "../../lib/config.js"
import getImageDisplay from "../../utils/imgdisplay.js"
import { parseTextWithFaces, coerceToUniversalMessage, getMessageRefFromCtx } from "../message/context.js"
import { UniversalMessage, UniversalMessageSegment, UniversalSegmentType } from "../message/universal-message.js"
import { rememberRuntimeLastGroupMessage } from "../state/last-group-message-store.js"

/**
 * ReplyService 负责给上下文挂上统一的 `ctx.reply()`。
 *
 * 这样协议差异、引用回复、图片 summary 和定时撤回都聚合在一个地方，
 * 插件层看到的仍然是稳定的 `ctx.reply()` 语义。
 */
export class ReplyService {
  constructor(baseBot) {
    this.baseBot = baseBot
  }

  attachReply(e) {
    const reply = async (msg = "", quote = false, data = {}) => {
      let msgRes
      let { recallMsg = 0, at = "" } = data
      if (!msg) return false

      const rawList = Array.isArray(msg) ? msg : msg ? [msg] : []
      const hasRawNode = rawList.some(i => i?.type === "node" || i?.type === "forward")

      if (!hasRawNode) {
        if (typeof msg === "string") {
          msg = this.applySuffix(msg)
        } else if (msg instanceof UniversalMessage) {
          msg = msg.segments
        } else {
          msg = coerceToUniversalMessage(msg).segments
        }

        if (at) {
          msg = [UniversalMessageSegment.mention(at), ...msg]
        }

        if (quote) {
          const ref = e.messageRef || getMessageRefFromCtx(e)
          try {
            msg = [UniversalMessageSegment.reply({ msgId: ref.msgId, seq: ref.seq }), ...msg]
          } catch {}
        }

        if (
          Array.isArray(msg) &&
          msg.some(seg => seg?.type === UniversalSegmentType.IMAGE && !seg?.data?.summary)
        ) {
          const imgdisplay = await getImageDisplay().catch(() => "")
          msg = msg.map(seg => {
            if (seg?.type === UniversalSegmentType.IMAGE && seg?.data && !seg.data.summary) {
              seg.data.summary = imgdisplay || ""
            }
            return seg
          })
        }
      }

      if (e.group_id) {
        msgRes = await e.sendMessage(e, msg).catch(err => {
          logger.error(err)
        })
      } else {
        const privateTarget = e?.peer_id ?? e?.user_id
        msgRes = await e.sendMessage(`${privateTarget}`, msg).catch(err => {
          logger.warn(err)
        })
      }

      if (e.group_id && Array.isArray(msg) && msgRes) {
        rememberRuntimeLastGroupMessage({
          group_id: e.group_id,
          user_id: e.self_id,
          sender_id: e.self_id,
          self_id: e.self_id,
          message: msg,
          isMaster: false,
        })
      }

      if (!e.isGuild && recallMsg > 0 && (msgRes?.seq || msgRes?.message_id)) {
        this.baseBot.timers.setTimeout(() => {
          void Promise.resolve()
            .then(() =>
              e.recallMessage?.({
                peer_id: e?.peer_id || e.group_id,
                message_seq: msgRes.seq,
                message_id: msgRes?.message_id || msgRes?.data?.message_id,
                isGroup: e.group_id || e.message_scene == "group",
              }),
            )
            .catch(err => logger.warn(err))
        }, recallMsg * 1000)
      }

      return msgRes
    }

    if (e.reply) e.replyNew = e.reply
    e.reply = reply
  }

  applySuffix(msg) {
    if (typeof msg !== "string") return msg
    const suffixText = cfg.getConfig("bot")?.suffix_text || ""
    return parseTextWithFaces(msg + suffixText)
  }
}

export default ReplyService
