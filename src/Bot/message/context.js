import { UniversalMessage, UniversalMessageSegment, UniversalSegmentType } from "./universal-message.js"

const URL_REGEXP =
  /(https?|http|ftp|file):\/\/[-A-Za-z0-9+&@#/%?=~_|!:,.;]+[-A-Za-z0-9+&@#/%=~_|]/g

function toSafeNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : undefined
}

function isUniversalType(type) {
  return Object.values(UniversalSegmentType).includes(type)
}

function looksLikeUniversalSegment(type, data = {}) {
  if (!data || typeof data !== "object") return false

  switch (type) {
    case UniversalSegmentType.TEXT:
      return data.content !== undefined && data.content !== null
    case UniversalSegmentType.MENTION:
      return data.target !== undefined && data.target !== null && String(data.target) !== ""
    case UniversalSegmentType.MENTION_ALL:
      return true
    case UniversalSegmentType.REPLY:
      return data.msgId !== undefined || data.seq !== undefined
    case UniversalSegmentType.IMAGE:
    case UniversalSegmentType.VOICE:
    case UniversalSegmentType.VIDEO:
    case UniversalSegmentType.FILE:
      return Boolean(data.url || data.fileId || data.path)
    case UniversalSegmentType.EMOJI:
      // 兼容：只有提供 id 才当作通用段，否则可能是 milky 的 face_id 等字段
      return data.id !== undefined && data.id !== null
    case UniversalSegmentType.FORWARD:
      return true
    default:
      return false
  }
}

function coerceFileLikeToBase64(value) {
  if (value === undefined || value === null) return value

  if (Buffer.isBuffer(value)) {
    return `base64://${value.toString("base64")}`
  }

  if (value instanceof ArrayBuffer) {
    return `base64://${Buffer.from(value).toString("base64")}`
  }

  // Uint8Array / TypedArray
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    try {
      const buf = Buffer.from(value.buffer, value.byteOffset, value.byteLength)
      return `base64://${buf.toString("base64")}`
    } catch {
      return value
    }
  }

  return value
}

function normalizeMediaReferenceValue(value) {
  const coerced = coerceFileLikeToBase64(value)
  if (coerced === undefined || coerced === null) return ""
  return String(coerced).trim()
}

export function classifyMediaReference(value) {
  const raw = normalizeMediaReferenceValue(value)
  if (!raw) return { kind: "empty", value: "" }
  if (/^base64:\/\//i.test(raw)) return { kind: "base64", value: raw }
  if (/^data:[^,]+,/i.test(raw)) return { kind: "dataUri", value: raw }
  if (/^(https?|ftp):\/\//i.test(raw)) return { kind: "url", value: raw }
  if (/^file:\/\//i.test(raw)) return { kind: "fileUri", value: raw }
  if (/^[a-zA-Z]:[\\/]/.test(raw) || raw.startsWith("\\\\") || raw.startsWith("/")) {
    return { kind: "absolutePath", value: raw }
  }
  if (/^[.]{1,2}([\\/]|$)/.test(raw) || /[\\/]/.test(raw)) {
    return { kind: "relativePath", value: raw }
  }
  if (/^[^\\/:*?"<>|\r\n]+\.[A-Za-z0-9]{1,12}$/.test(raw)) {
    return { kind: "basename", value: raw }
  }
  return { kind: "opaqueId", value: raw }
}

export function resolveMediaReferenceFields(entries = []) {
  const out = {
    url: undefined,
    path: undefined,
    fileId: undefined,
  }

  const assign = (value, preferred = "auto") => {
    const ref = classifyMediaReference(value)
    if (!ref.value) return

    if (["url", "fileUri", "base64", "dataUri"].includes(ref.kind)) {
      if (!out.url) out.url = ref.value
      return
    }

    if (["absolutePath", "relativePath", "basename"].includes(ref.kind)) {
      if (preferred === "fileId" && ref.kind === "basename") {
        if (!out.fileId) out.fileId = ref.value
        return
      }
      if (!out.path) out.path = ref.value
      return
    }

    if (preferred === "url") {
      if (!out.url) out.url = ref.value
      return
    }
    if (preferred === "path") {
      if (!out.path) out.path = ref.value
      return
    }
    if (!out.fileId) out.fileId = ref.value
  }

  for (const entry of Array.isArray(entries) ? entries : []) {
    if (
      entry &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      Object.prototype.hasOwnProperty.call(entry, "value")
    ) {
      assign(entry.value, entry.preferred)
      continue
    }
    assign(entry)
  }

  return out
}

export function parseTextWithFaces(text) {
  if (text === undefined || text === null) return []
  const str = String(text)
  const facePattern = /\[face:(\d+)\]/g

  const segments = []
  let lastIndex = 0
  let match

  while ((match = facePattern.exec(str)) !== null) {
    const [fullMatch, faceId] = match
    const matchStart = match.index

    if (matchStart > lastIndex) {
      segments.push(UniversalMessageSegment.text(str.slice(lastIndex, matchStart)))
    }

    segments.push(UniversalMessageSegment.face(Number(faceId)))
    lastIndex = matchStart + fullMatch.length
  }

  if (lastIndex < str.length) {
    segments.push(UniversalMessageSegment.text(str.slice(lastIndex)))
  }

  return segments
}

export function toUniversalMessage(protocol, rawSegments) {
  return UniversalMessage.from(protocol, rawSegments)
}

export function getReplyRefFromSegments(segments) {
  if (!Array.isArray(segments)) return null
  const replySeg = segments.find(seg => seg?.type === UniversalSegmentType.REPLY)
  if (!replySeg) return null

  const msgId = replySeg?.data?.msgId ? String(replySeg.data.msgId) : undefined
  const seq = replySeg?.data?.seq !== undefined ? toSafeNumber(replySeg.data.seq) : undefined

  if (!msgId && seq === undefined) return null
  return { msgId, seq }
}

export function getMessageRefFromCtx(ctx) {
  if (!ctx || typeof ctx !== "object") return { msgId: undefined, seq: undefined }

  const msgId =
    ctx.message_id !== undefined && ctx.message_id !== null ? String(ctx.message_id) : undefined

  const seq =
    toSafeNumber(ctx.seq) ??
    toSafeNumber(ctx.message_seq) ??
    // 有些实现把 message_id 当作 seq 使用（milky）
    (msgId !== undefined ? toSafeNumber(msgId) : undefined)

  return { msgId, seq }
}

export function applyDerivedFieldsFromUniversalSegments(ctx) {
  if (!ctx || typeof ctx !== "object") return ctx
  if (!Array.isArray(ctx.message)) return ctx

  const text = ctx.message
    .filter(seg => seg?.type === UniversalSegmentType.TEXT)
    .map(seg => seg?.data?.content ?? "")
    .join("")

  // 兼容：把全角＃替换为#
  ctx.msg = String(text).replace(/＃/g, "#").trim()

  const url = ctx.msg.match(URL_REGEXP)?.[0] || ""
  ctx.url = url

  ctx.img = ctx.message
    .filter(seg => seg?.type === UniversalSegmentType.IMAGE)
    .map(seg => seg?.data?.url)
    .filter(Boolean)

  const selfId = ctx.self_id !== undefined && ctx.self_id !== null ? String(ctx.self_id) : ""

  ctx.atBot = false
  ctx.at = ""
  ctx.atAll = false

  for (const seg of ctx.message) {
    if (seg?.type === UniversalSegmentType.MENTION_ALL) {
      ctx.atAll = true
      continue
    }
    if (seg?.type !== UniversalSegmentType.MENTION) continue
    const target = seg?.data?.target !== undefined ? String(seg.data.target) : ""
    if (!target) continue
    if (selfId && target === selfId) ctx.atBot = true
    else ctx.at = target
  }

  return ctx
}

function coerceOneInputToUniversalSegments(input) {
  if (input === undefined || input === null) return []
  if (input instanceof UniversalMessage) return input.segments || []
  if (input instanceof UniversalMessageSegment) return [input]

  if (typeof input === "string" || typeof input === "number") {
    return parseTextWithFaces(String(input))
  }

  // 兼容：传入形如 {type,data} 的段结构（onebot/milky/icqq）
  if (typeof input === "object" && typeof input.type === "string") {
    const { type, data = {} } = input

    if (isUniversalType(type) && looksLikeUniversalSegment(type, data)) {
      return [new UniversalMessageSegment(type, data)]
    }

    switch (type) {
      case "text":
        return [UniversalMessageSegment.text(data.content ?? data.text ?? input.text ?? input.content ?? "")]
      case "face":
        return [UniversalMessageSegment.face(data.id ?? data.face_id ?? input.id)]
      case "at":
        return [
          data.qq === "all"
            ? UniversalMessageSegment.mentionAll()
            : UniversalMessageSegment.mention(data.target ?? data.qq ?? data.user_id ?? input.qq ?? input.user_id),
        ]
      case "atAll":
        return [UniversalMessageSegment.mentionAll()]
      case "mention":
        return [UniversalMessageSegment.mention(data.user_id)]
      case "mentionAll":
        return [UniversalMessageSegment.mentionAll()]
      case "reply":
        {
          const msgId = data.msgId ?? data.id ?? input.id
          const seq = data.seq ?? data.message_seq ?? input.message_seq ?? input.seq
          if (msgId === undefined && seq === undefined) return []
          return [UniversalMessageSegment.reply({ msgId, seq })]
        }
      case "image":
        {
          const refs = resolveMediaReferenceFields([
            { value: data.url, preferred: "url" },
            { value: input.url, preferred: "url" },
            { value: data.uri, preferred: "url" },
            { value: input.uri, preferred: "url" },
            { value: data.temp_url, preferred: "url" },
            { value: input.temp_url, preferred: "url" },
            { value: data.path, preferred: "path" },
            { value: input.path, preferred: "path" },
            { value: data.file, preferred: "auto" },
            { value: input.file, preferred: "auto" },
            { value: data.fileId, preferred: "fileId" },
            { value: input.fileId, preferred: "fileId" },
            { value: data.resource_id, preferred: "fileId" },
            { value: input.fid, preferred: "fileId" },
          ])
          const segData = {
            url: refs.url,
            fileId: refs.fileId,
            path: refs.path,
            name: data.name ?? input.name,
            width: data.width,
            height: data.height,
            summary: data.summary ?? input.summary,
          }
          if (!segData.url && !segData.fileId && !segData.path) return []
          return [UniversalMessageSegment.image(segData)]
        }
      case "record":
        {
          const refs = resolveMediaReferenceFields([
            { value: data.url, preferred: "url" },
            { value: data.uri, preferred: "url" },
            { value: input.uri, preferred: "url" },
            { value: data.path, preferred: "path" },
            { value: input.path, preferred: "path" },
            { value: data.file, preferred: "auto" },
            { value: input.file, preferred: "auto" },
            { value: data.fileId, preferred: "fileId" },
            { value: input.fileId, preferred: "fileId" },
            { value: data.resource_id, preferred: "fileId" },
          ])
          const segData = {
            url: refs.url,
            fileId: refs.fileId,
            path: refs.path,
            duration: data.duration ?? input.seconds ?? 0,
          }
          if (!segData.url && !segData.fileId && !segData.path) return []
          return [UniversalMessageSegment.record(segData)]
        }
      case "video":
        {
          const refs = resolveMediaReferenceFields([
            { value: data.url, preferred: "url" },
            { value: data.uri, preferred: "url" },
            { value: input.uri, preferred: "url" },
            { value: data.path, preferred: "path" },
            { value: input.path, preferred: "path" },
            { value: data.file, preferred: "auto" },
            { value: input.file, preferred: "auto" },
            { value: data.fileId, preferred: "fileId" },
            { value: input.fileId, preferred: "fileId" },
            { value: data.resource_id, preferred: "fileId" },
            { value: input.fid, preferred: "fileId" },
          ])
          const segData = {
            url: refs.url,
            fileId: refs.fileId,
            path: refs.path,
            duration: data.duration ?? input.seconds ?? 0,
            width: data.width ?? input.width ?? 0,
            height: data.height ?? input.height ?? 0,
          }
          if (!segData.url && !segData.fileId && !segData.path) return []
          return [UniversalMessageSegment.video(segData)]
        }
      case "file":
        {
          const refs = resolveMediaReferenceFields([
            { value: data.url, preferred: "url" },
            { value: data.uri, preferred: "url" },
            { value: input.uri, preferred: "url" },
            { value: data.path ?? data.file_hash, preferred: "path" },
            { value: input.path, preferred: "path" },
            { value: data.file, preferred: "auto" },
            { value: input.file, preferred: "auto" },
            { value: data.fileId, preferred: "fileId" },
            { value: input.fileId, preferred: "fileId" },
            { value: data.file_id, preferred: "fileId" },
            { value: input.fid, preferred: "fileId" },
          ])
          const segData = {
            url: refs.url,
            fileId: refs.fileId,
            path: refs.path,
            name: data.name ?? data.file_name ?? input.name,
            size: data.size ?? data.file_size ?? input.size,
          }
          if (!segData.url && !segData.fileId && !segData.path) return []
          return [UniversalMessageSegment.file(segData)]
        }
      case "forward":
        return [UniversalMessageSegment.forward(data)]
      default:
        return [UniversalMessageSegment.text(JSON.stringify(input))]
    }
  }

  return [UniversalMessageSegment.text(JSON.stringify(input))]
}

export function coerceToUniversalMessage(input, { suffixText = "" } = {}) {
  const msg = new UniversalMessage()

  const segments = []
  if (Array.isArray(input)) {
    for (const item of input) segments.push(...coerceOneInputToUniversalSegments(item))
  } else {
    segments.push(...coerceOneInputToUniversalSegments(input))
  }

  // 追加 suffixText（支持 [face:xxx]）
  if (suffixText) {
    segments.push(...parseTextWithFaces(suffixText))
  }

  msg.addSegments(segments)
  return msg
}

export function attachStandardMessageApis(ctx) {
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
        if (typeof ctx.getMsg !== "function") throw new Error("[ctx.getMessage] onebotv11 未绑定 getMsg")

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

          // 常见返回结构兼容：[{ message: [...] }] / { message: { message: [...] } }
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
