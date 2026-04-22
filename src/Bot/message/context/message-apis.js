import { UniversalMessage } from "../universal-message.js"
import { getMessageRefFromCtx, getReplyRefFromSegments } from "./derived-fields.js"

function toSafeNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : undefined
}

function attachStandardMessageApis(ctx) {
  if (!ctx || typeof ctx !== "object") return ctx
  if (typeof ctx.protocol !== "string") return ctx

  if (!ctx.messageRef) {
    ctx.messageRef = getMessageRefFromCtx(ctx)
  }

  if (typeof ctx.getMessage !== "function") {
    ctx.getMessage = async ref => {
      const msgId = ref?.msgId ?? ref?.message_id ?? ref?.id
      const seq = ref?.seq ?? ref?.message_seq ?? ref?.messageSeq

      if (ctx.protocol === "milky") {
        const messageSeq = toSafeNumber(seq) ?? toSafeNumber(msgId)
        if (messageSeq === undefined) {
          throw new Error("[ctx.getMessage] milky 需要 seq/message_seq")
        }
        if (typeof ctx.getMsg !== "function") {
          throw new Error("[ctx.getMessage] milky 未绑定 getMsg")
        }
        return await ctx.getMsg(messageSeq)
      }

      if (ctx.protocol === "onebotv11") {
        const messageId = msgId !== undefined ? String(msgId) : seq !== undefined ? String(seq) : ""
        if (!messageId) throw new Error("[ctx.getMessage] onebotv11 需要 msgId/message_id")
        if (typeof ctx.getMsg !== "function") {
          throw new Error("[ctx.getMessage] onebotv11 未绑定 getMsg")
        }

        const res = await ctx.getMsg(messageId)
        const rawSegments =
          res?.message?.message ??
          res?.message ??
          res?.segments ??
          res?.data?.message ??
          res?.data?.segments

        if (Array.isArray(rawSegments)) {
          const universalMessage = UniversalMessage.from("onebotv11", rawSegments)
          return {
            ...(res && typeof res === "object" ? res : {}),
            protocol: "onebotv11",
            universalMessage,
            message: universalMessage.segments,
          }
        }

        return res
      }

      if (ctx.protocol === "icqq") {
        const messageSeq = toSafeNumber(seq) ?? toSafeNumber(msgId)
        if (messageSeq !== undefined && typeof ctx.getReplyMsg === "function") {
          const res = await ctx.getReplyMsg(messageSeq)
          const rawMsg = Array.isArray(res) ? res[0] : res?.message ?? res
          const rawSegments =
            rawMsg?.message?.message ?? rawMsg?.message ?? rawMsg?.segments ?? rawMsg?.message_chain

          if (Array.isArray(rawSegments)) {
            const universalMessage = UniversalMessage.from("icqq", rawSegments)
            return {
              ...(rawMsg && typeof rawMsg === "object" ? rawMsg : {}),
              protocol: "icqq",
              universalMessage,
              message: universalMessage.segments,
            }
          }

          return res
        }
        if (msgId !== undefined && typeof ctx.getMsg === "function") {
          const res = await ctx.getMsg(String(msgId))
          const rawSegments = res?.message?.message ?? res?.message ?? res?.segments
          if (Array.isArray(rawSegments)) {
            const universalMessage = UniversalMessage.from("icqq", rawSegments)
            return {
              ...(res && typeof res === "object" ? res : {}),
              protocol: "icqq",
              universalMessage,
              message: universalMessage.segments,
            }
          }
          return res
        }
        throw new Error("[ctx.getMessage] icqq 需要 seq 或绑定 getReplyMsg/getMsg")
      }

      throw new Error(`[ctx.getMessage] 不支持的 protocol=${ctx.protocol}`)
    }
  }

  if (typeof ctx.getReplyMessage !== "function") {
    ctx.getReplyMessage = async () => {
      const ref = getReplyRefFromSegments(ctx.message)
      if (!ref) return null
      return await ctx.getMessage(ref)
    }
  }

  return ctx
}

export { attachStandardMessageApis }
