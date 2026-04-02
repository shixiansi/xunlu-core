import { coerceToUniversalMessage } from "../Bot/message/context.js"
import { UniversalMessage } from "../Bot/message/universal-message.js"

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value)
}

function isInt(value) {
  return isFiniteNumber(value) && Number.isInteger(value)
}

function isBoolean(value) {
  return typeof value === "boolean"
}

function isString(value) {
  return typeof value === "string"
}

function isNullableString(value) {
  return value === null || isString(value)
}

function isStringOrNumber(value) {
  return typeof value === "string" || typeof value === "number"
}

function normalizeMilkyMethod(name) {
  if (name === undefined || name === null) return ""
  let out = String(name).trim()
  while (out.startsWith("/")) out = out.slice(1)
  if (out.startsWith("api/")) out = out.slice("api/".length)
  return out
}

function normalizeOnebotAction(action) {
  if (action === undefined || action === null) return ""
  let out = String(action).trim()
  while (out.startsWith("/")) out = out.slice(1)
  return out
}

function makeMockError(protocol, action, message) {
  return new Error(`[mock:${protocol}] ${action}: ${message}`)
}

function warnExtraKeys({ warnings, protocol, action, params, allowedKeys }) {
  if (!isPlainObject(params)) return
  for (const key of Object.keys(params)) {
    if (!allowedKeys.has(key)) {
      warnings.push(`[mock:${protocol}] ${action}: extra field "${key}"`)
    }
  }
}

function validateFields({ protocol, action, params, required = {}, optional = {}, warnings }) {
  const p = params === undefined || params === null ? {} : params
  if (!isPlainObject(p)) {
    throw makeMockError(protocol, action, "params must be an object")
  }

  const allowedKeys = new Set([...Object.keys(required), ...Object.keys(optional)])
  warnExtraKeys({ warnings, protocol, action, params: p, allowedKeys })

  for (const [key, rule] of Object.entries(required)) {
    const value = p[key]
    if (value === undefined || value === null) {
      throw makeMockError(protocol, action, `missing required field \"${key}\"`)
    }
    if (!rule.check(value)) {
      throw makeMockError(protocol, action, `field \"${key}\" must be ${rule.type}`)
    }
  }

  for (const [key, rule] of Object.entries(optional)) {
    const value = p[key]
    if (value === undefined || value === null) continue
    if (!rule.check(value)) {
      throw makeMockError(protocol, action, `field \"${key}\" must be ${rule.type}`)
    }
  }

  return p
}

function validateMilkyOutgoingSegments({ protocol, action, segments, warnings, path = "message" }) {
  if (!Array.isArray(segments)) {
    throw makeMockError(protocol, action, `${path} must be an array`)
  }

  const validateOne = (seg, segPath) => {
    if (!isPlainObject(seg)) throw makeMockError(protocol, action, `${segPath} must be object`)
    if (!isString(seg.type) || !seg.type.trim()) {
      throw makeMockError(protocol, action, `${segPath}.type must be string`)
    }
    const data = seg.data === undefined ? {} : seg.data
    if (!isPlainObject(data)) throw makeMockError(protocol, action, `${segPath}.data must be object`)

    switch (seg.type) {
      case "text":
        if (!isString(data.text)) throw makeMockError(protocol, action, `${segPath}.data.text must be string`)
        return
      case "mention":
        if (!isInt(data.user_id)) throw makeMockError(protocol, action, `${segPath}.data.user_id must be number`)
        return
      case "mention_all":
        return
      case "face":
        if (!isString(data.face_id)) throw makeMockError(protocol, action, `${segPath}.data.face_id must be string`)
        if (data.is_large !== undefined && data.is_large !== null && !isBoolean(data.is_large)) {
          throw makeMockError(protocol, action, `${segPath}.data.is_large must be boolean`)
        }
        return
      case "reply":
        if (!isInt(data.message_seq)) throw makeMockError(protocol, action, `${segPath}.data.message_seq must be number`)
        return
      case "image":
        if (!isString(data.uri) || !data.uri) throw makeMockError(protocol, action, `${segPath}.data.uri must be string`)
        if (data.sub_type !== undefined && data.sub_type !== null && !isString(data.sub_type)) {
          throw makeMockError(protocol, action, `${segPath}.data.sub_type must be string`)
        }
        if (data.summary !== undefined && data.summary !== null && !isNullableString(data.summary)) {
          throw makeMockError(protocol, action, `${segPath}.data.summary must be string|null`)
        }
        return
      case "record":
      case "video":
        if (!isString(data.uri) || !data.uri) throw makeMockError(protocol, action, `${segPath}.data.uri must be string`)
        if (seg.type === "video" && data.thumb_uri !== undefined && data.thumb_uri !== null && !isNullableString(data.thumb_uri)) {
          throw makeMockError(protocol, action, `${segPath}.data.thumb_uri must be string|null`)
        }
        return
      case "file":
        if (!isString(data.uri) || !data.uri) throw makeMockError(protocol, action, `${segPath}.data.uri must be string`)
        if (data.name !== undefined && data.name !== null && !isString(data.name)) {
          throw makeMockError(protocol, action, `${segPath}.data.name must be string`)
        }
        if (data.size !== undefined && data.size !== null && !isFiniteNumber(data.size)) {
          throw makeMockError(protocol, action, `${segPath}.data.size must be number`)
        }
        return
      case "forward": {
        if (!Array.isArray(data.messages)) {
          throw makeMockError(protocol, action, `${segPath}.data.messages must be array`)
        }
        data.messages.forEach((m, idx) => {
          const mp = `${segPath}.data.messages[${idx}]`
          if (!isPlainObject(m)) throw makeMockError(protocol, action, `${mp} must be object`)
          if (!isInt(m.user_id)) throw makeMockError(protocol, action, `${mp}.user_id must be number`)
          if (!isString(m.sender_name)) throw makeMockError(protocol, action, `${mp}.sender_name must be string`)
          validateMilkyOutgoingSegments({ protocol, action, segments: m.segments, warnings, path: `${mp}.segments` })
        })
        return
      }
      default:
        warnings.push(`[mock:${protocol}] ${action}: unsupported segment type \"${seg.type}\"`)
        throw makeMockError(protocol, action, `${segPath}.type \"${seg.type}\" not supported`)
    }
  }

  segments.forEach((seg, idx) => validateOne(seg, `${path}[${idx}]`))
}

function validateOnebotMessage({ protocol, action, message, warnings, path = "message" }) {
  if (isString(message)) return

  if (!Array.isArray(message)) {
    throw makeMockError(protocol, action, `${path} must be string or array`)
  }

  const validateSeg = (seg, segPath) => {
    if (!isPlainObject(seg)) throw makeMockError(protocol, action, `${segPath} must be object`)
    if (!isString(seg.type) || !seg.type.trim()) {
      throw makeMockError(protocol, action, `${segPath}.type must be string`)
    }
    const data = seg.data === undefined ? {} : seg.data
    if (!isPlainObject(data)) throw makeMockError(protocol, action, `${segPath}.data must be object`)

    switch (seg.type) {
      case "text":
        if (!isString(data.text)) throw makeMockError(protocol, action, `${segPath}.data.text must be string`)
        return
      case "at":
        if (!isStringOrNumber(data.qq)) throw makeMockError(protocol, action, `${segPath}.data.qq must be string|number`)
        return
      case "face":
        if (!isStringOrNumber(data.id)) throw makeMockError(protocol, action, `${segPath}.data.id must be string|number`)
        return
      case "reply":
        if (!isStringOrNumber(data.id)) throw makeMockError(protocol, action, `${segPath}.data.id must be string|number`)
        return
      case "image":
      case "record":
      case "video":
        if (!isString(data.file) || !data.file) throw makeMockError(protocol, action, `${segPath}.data.file must be string`)
        return
      case "file":
        if (!isString(data.file) || !data.file) throw makeMockError(protocol, action, `${segPath}.data.file must be string`)
        if (data.name !== undefined && data.name !== null && !isString(data.name)) {
          throw makeMockError(protocol, action, `${segPath}.data.name must be string`)
        }
        if (data.size !== undefined && data.size !== null && !isFiniteNumber(data.size)) {
          throw makeMockError(protocol, action, `${segPath}.data.size must be number`)
        }
        return
      case "node": {
        if (!isStringOrNumber(data.uin)) throw makeMockError(protocol, action, `${segPath}.data.uin must be string|number`)
        if (!isString(data.name)) throw makeMockError(protocol, action, `${segPath}.data.name must be string`)
        if (data.content !== undefined && data.content !== null) {
          const c = data.content
          if (!isString(c) && !Array.isArray(c)) throw makeMockError(protocol, action, `${segPath}.data.content must be string|array`)
          if (Array.isArray(c)) validateOnebotMessage({ protocol, action, message: c, warnings, path: `${segPath}.data.content` })
        }
        return
      }
      default:
        warnings.push(`[mock:${protocol}] ${action}: unsupported segment type \"${seg.type}\"`)
        throw makeMockError(protocol, action, `${segPath}.type \"${seg.type}\" not supported`)
    }
  }

  message.forEach((seg, idx) => validateSeg(seg, `${path}[${idx}]`))
}

function snapshotCallValue(value) {
  try {
    return structuredClone(value)
  } catch {
    try {
      return JSON.parse(JSON.stringify(value))
    } catch {
      return value
    }
  }
}

function pushRecordedCall(calls, protocol, kind, name, { params, target } = {}) {
  calls.push({
    protocol,
    kind,
    name,
    ...(target === undefined ? {} : { target: snapshotCallValue(target) }),
    ...(params === undefined ? {} : { params: snapshotCallValue(params) }),
  })
}

/**
 * createProtocolMock({ protocol, selfId })
 *
 * - protocol: "milky" | "onebotv11" | "icqq"
 * - selfId: number (optional)
 *
 * Returns:
 * - bot: object (assignable to globalThis.Bot)
 * - warnings: string[]
 * - errors: string[]
 * - calls: Array<{ protocol, kind, name, params?, target? }>
 */
export function createProtocolMock({ protocol, selfId = 10000 } = {}) {
  const p = String(protocol || "").toLowerCase()
  const protocolName = p.includes("onebot") ? "onebotv11" : p.includes("icqq") ? "icqq" : "milky"
  const warnings = []
  const errors = []
  const calls = []

  const uin = Number(selfId)
  const botUin = Number.isFinite(uin) && uin > 0 ? Math.floor(uin) : 10000
  const nickname = `Mock-${protocolName}`

  let nextMessageSeq = 100000
  let nextMessageId = 100000

  const nowSec = () => Math.floor(Date.now() / 1000)

  const makeFriend = user_id => ({
    user_id,
    nickname: `Friend-${user_id}`,
    sex: "unknown",
    qid: "",
    remark: "",
    category: { category_id: 0, category_name: "default" },
  })

  const makeGroup = group_id => ({
    group_id,
    group_name: `Group-${group_id}`,
    member_count: 3,
    max_member_count: 200,
  })

  const makeGroupMember = (group_id, user_id) => {
    const uid = Number(user_id)
    const isBotSelf = Number.isFinite(uid) && uid === botUin
    return {
      group_id,
      user_id,
      nickname: isBotSelf ? nickname : `Member-${user_id}`,
      sex: "unknown",
      card: isBotSelf ? nickname : `Member-${user_id}`,
      title: "",
      level: 1,
      role: isBotSelf ? "owner" : "member",
      join_time: nowSec() - 86400,
      last_sent_time: nowSec() - 60,
      shut_up_end_time: null,
    }
  }

  const enumRule = (type, allowed) => ({
    type,
    check: v => allowed.includes(v),
  })

  const milkySpecs = {
    get_login_info: {
      required: {},
      optional: {},
      result: () => ({ uin: botUin, nickname }),
    },
    get_impl_info: {
      required: {},
      optional: {},
      result: () => ({
        impl_name: "mock",
        impl_version: "0.0.0",
        qq_protocol_version: "mock",
        qq_protocol_type: "windows",
        milky_version: "mock",
      }),
    },
    get_user_profile: {
      required: { user_id: { type: "number", check: isInt } },
      optional: {},
      result: ({ user_id }) => ({
        nickname: `User-${user_id}`,
        qid: "",
        age: 0,
        sex: "unknown",
        remark: "",
        bio: "",
        level: 1,
        country: "",
        city: "",
        school: "",
      }),
    },
    get_friend_list: {
      required: {},
      optional: { no_cache: { type: "boolean", check: isBoolean } },
      result: () => ({ friends: [makeFriend(10001)] }),
    },
    get_friend_info: {
      required: { user_id: { type: "number", check: isInt } },
      optional: { no_cache: { type: "boolean", check: isBoolean } },
      result: ({ user_id }) => ({ friend: makeFriend(user_id) }),
    },
    send_profile_like: {
      required: { user_id: { type: "number", check: isInt } },
      optional: { times: { type: "number", check: isInt }, count: { type: "number", check: isInt } },
      result: () => ({}),
    },
    get_group_list: {
      required: {},
      optional: { no_cache: { type: "boolean", check: isBoolean } },
      result: () => ({ groups: [makeGroup(123)] }),
    },
    get_group_info: {
      required: { group_id: { type: "number", check: isInt } },
      optional: { no_cache: { type: "boolean", check: isBoolean } },
      result: ({ group_id }) => ({ group: makeGroup(group_id) }),
    },
    get_group_member_list: {
      required: { group_id: { type: "number", check: isInt } },
      optional: { no_cache: { type: "boolean", check: isBoolean } },
      result: ({ group_id }) => ({
        members: [makeGroupMember(group_id, 10001), makeGroupMember(group_id, 10002)],
      }),
    },
    get_group_member_info: {
      required: {
        group_id: { type: "number", check: isInt },
        user_id: { type: "number", check: isInt },
      },
      optional: { no_cache: { type: "boolean", check: isBoolean } },
      result: ({ group_id, user_id }) => ({ member: makeGroupMember(group_id, user_id) }),
    },
    send_private_message: {
      required: {
        user_id: { type: "number", check: isInt },
        message: { type: "array", check: Array.isArray },
      },
      optional: {},
      validate: ({ message }, meta) =>
        validateMilkyOutgoingSegments({ ...meta, segments: message, path: "message" }),
      result: () => ({ message_seq: ++nextMessageSeq, time: nowSec() }),
    },
    send_group_message: {
      required: {
        group_id: { type: "number", check: isInt },
        message: { type: "array", check: Array.isArray },
      },
      optional: {},
      validate: ({ message }, meta) =>
        validateMilkyOutgoingSegments({ ...meta, segments: message, path: "message" }),
      result: () => ({ message_seq: ++nextMessageSeq, time: nowSec() }),
    },
    recall_private_message: {
      required: {
        user_id: { type: "number", check: isInt },
        message_seq: { type: "number", check: isInt },
      },
      optional: {},
      result: () => ({}),
    },
    recall_group_message: {
      required: {
        group_id: { type: "number", check: isInt },
        message_seq: { type: "number", check: isInt },
      },
      optional: {},
      result: () => ({}),
    },
    mark_message_as_read: {
      required: {
        message_scene: enumRule('"friend"|"group"|"temp"', ["friend", "group", "temp"]),
        peer_id: { type: "number", check: isInt },
        message_seq: { type: "number", check: isInt },
      },
      optional: {},
      result: () => ({}),
    },
    get_message: {
      required: {
        message_scene: enumRule('"friend"|"group"|"temp"', ["friend", "group", "temp"]),
        peer_id: { type: "number", check: isInt },
        message_seq: { type: "number", check: isInt },
      },
      optional: {},
      result: ({ message_scene, peer_id, message_seq }) => ({
        message: {
          message_scene,
          peer_id,
          message_seq,
          sender_id: 10001,
          time: nowSec(),
          segments: [{ type: "text", data: { text: "[mock message]" } }],
          ...(message_scene === "group"
            ? { group: makeGroup(peer_id), group_member: makeGroupMember(peer_id, 10001) }
            : { friend: makeFriend(peer_id) }),
        },
      }),
    },
    get_history_messages: {
      required: {
        message_scene: enumRule('"friend"|"group"|"temp"', ["friend", "group", "temp"]),
        peer_id: { type: "number", check: isInt },
      },
      optional: {
        start_message_seq: { type: "number", check: isInt },
        limit: { type: "number", check: isInt },
      },
      result: ({ message_scene, peer_id }) => ({
        messages: [
          {
            message_scene,
            peer_id,
            message_seq: ++nextMessageSeq,
            sender_id: 10001,
            time: nowSec(),
            segments: [{ type: "text", data: { text: "[mock history]" } }],
            ...(message_scene === "group"
              ? { group: makeGroup(peer_id), group_member: makeGroupMember(peer_id, 10001) }
              : { friend: makeFriend(peer_id) }),
          },
        ],
      }),
    },
    get_forwarded_messages: {
      required: { forward_id: { type: "string", check: isString } },
      optional: {},
      result: () => ({
        messages: [
          {
            sender_name: "mock",
            avatar_url: "",
            time: nowSec(),
            segments: [{ type: "text", data: { text: "[mock forward]" } }],
          },
        ],
      }),
    },
    send_group_message_reaction: {
      required: {
        group_id: { type: "number", check: isInt },
        message_seq: { type: "number", check: isInt },
        reaction: { type: "string", check: isString },
      },
      optional: { is_add: { type: "boolean", check: isBoolean } },
      result: () => ({}),
    },
    accept_friend_request: {
      required: { initiator_uid: { type: "string", check: isString } },
      optional: {
        is_filtered: { type: "boolean", check: isBoolean },
        reason: { type: "string", check: isString },
      },
      result: () => ({}),
    },
    reject_friend_request: {
      required: { initiator_uid: { type: "string", check: isString } },
      optional: {
        is_filtered: { type: "boolean", check: isBoolean },
        reason: { type: "string", check: isString },
      },
      result: () => ({}),
    },
    get_group_notifications: {
      required: {},
      optional: {
        start_notification_seq: { type: "number", check: isInt },
        is_filtered: { type: "boolean", check: isBoolean },
        limit: { type: "number", check: isInt },
      },
      result: () => ({ notifications: [] }),
    },
    accept_group_request: {
      required: {
        notification_seq: { type: "number", check: isInt },
        notification_type: enumRule('"join_request"|"invited_join_request"', [
          "join_request",
          "invited_join_request",
        ]),
        group_id: { type: "number", check: isInt },
      },
      optional: { is_filtered: { type: "boolean", check: isBoolean } },
      result: () => ({}),
    },
    reject_group_request: {
      required: {
        notification_seq: { type: "number", check: isInt },
        notification_type: enumRule('"join_request"|"invited_join_request"', [
          "join_request",
          "invited_join_request",
        ]),
        group_id: { type: "number", check: isInt },
      },
      optional: {
        is_filtered: { type: "boolean", check: isBoolean },
        reason: { type: "string|null", check: isNullableString },
      },
      result: () => ({}),
    },
    accept_group_invitation: {
      required: { group_id: { type: "number", check: isInt }, invitation_seq: { type: "number", check: isInt } },
      optional: {},
      result: () => ({}),
    },
    reject_group_invitation: {
      required: { group_id: { type: "number", check: isInt }, invitation_seq: { type: "number", check: isInt } },
      optional: {},
      result: () => ({}),
    },
    set_group_name: {
      required: { group_id: { type: "number", check: isInt }, new_group_name: { type: "string", check: isString } },
      optional: {},
      result: () => ({}),
    },
    set_group_member_card: {
      required: { group_id: { type: "number", check: isInt }, user_id: { type: "number", check: isInt }, card: { type: "string", check: isString } },
      optional: {},
      result: () => ({}),
    },
    set_group_member_admin: {
      required: { group_id: { type: "number", check: isInt }, user_id: { type: "number", check: isInt }, is_set: { type: "boolean", check: isBoolean } },
      optional: {},
      result: () => ({}),
    },
    set_group_member_special_title: {
      required: { group_id: { type: "number", check: isInt }, user_id: { type: "number", check: isInt }, special_title: { type: "string", check: isString } },
      optional: {},
      result: () => ({}),
    },
    set_group_member_mute: {
      required: { group_id: { type: "number", check: isInt }, user_id: { type: "number", check: isInt }, duration: { type: "number", check: isInt } },
      optional: {},
      result: () => ({}),
    },
    set_group_whole_mute: {
      required: { group_id: { type: "number", check: isInt }, is_mute: { type: "boolean", check: isBoolean } },
      optional: {},
      result: () => ({}),
    },
    kick_group_member: {
      required: { group_id: { type: "number", check: isInt }, user_id: { type: "number", check: isInt } },
      optional: { reject_add_request: { type: "boolean", check: isBoolean } },
      result: () => ({}),
    },
    quit_group: {
      required: { group_id: { type: "number", check: isInt } },
      optional: {},
      result: () => ({}),
    },
  }

  const onebotSpecs = {
    get_login_info: { required: {}, optional: {}, result: () => ({ user_id: botUin, nickname }) },
    get_status: { required: {}, optional: {}, result: () => ({ online: true, good: true }) },
    get_version_info: {
      required: {},
      optional: {},
      result: () => ({ app_name: "mock", app_version: "0.0.0", protocol_version: "v11" }),
    },
    get_friend_list: {
      required: {},
      optional: {},
      result: () => [{ user_id: 10001, nickname: "Friend-10001", remark: "" }],
    },
    get_stranger_info: {
      required: { user_id: { type: "number", check: isInt } },
      optional: { no_cache: { type: "boolean", check: isBoolean } },
      result: ({ user_id }) => ({ user_id, nickname: `User-${user_id}`, sex: "unknown", age: 0 }),
    },
    send_like: {
      required: { user_id: { type: "number", check: isInt } },
      optional: { times: { type: "number", check: isInt } },
      result: () => ({}),
    },
    get_group_list: {
      required: {},
      optional: {},
      result: () => [makeGroup(123)],
    },
    get_group_info: {
      required: { group_id: { type: "number", check: isInt } },
      optional: { no_cache: { type: "boolean", check: isBoolean } },
      result: ({ group_id }) => makeGroup(group_id),
    },
    get_group_member_list: {
      required: { group_id: { type: "number", check: isInt } },
      optional: { no_cache: { type: "boolean", check: isBoolean } },
      result: ({ group_id }) => [makeGroupMember(group_id, 10001)],
    },
    get_group_member_info: {
      required: { group_id: { type: "number", check: isInt }, user_id: { type: "number", check: isInt } },
      optional: { no_cache: { type: "boolean", check: isBoolean } },
      result: ({ group_id, user_id }) => makeGroupMember(group_id, user_id),
    },
    send_private_msg: {
      required: { user_id: { type: "number", check: isInt }, message: { type: "string|array", check: v => isString(v) || Array.isArray(v) } },
      optional: {},
      validate: ({ message }, meta) => validateOnebotMessage({ ...meta, message, path: "message" }),
      result: () => ({ message_id: ++nextMessageId }),
    },
    send_group_msg: {
      required: { group_id: { type: "number", check: isInt }, message: { type: "string|array", check: v => isString(v) || Array.isArray(v) } },
      optional: {},
      validate: ({ message }, meta) => validateOnebotMessage({ ...meta, message, path: "message" }),
      result: () => ({ message_id: ++nextMessageId }),
    },
    send_msg: {
      required: {
        message_type: enumRule('"private"|"group"', ["private", "group"]),
        message: { type: "string|array", check: v => isString(v) || Array.isArray(v) },
      },
      optional: { user_id: { type: "number", check: isInt }, group_id: { type: "number", check: isInt } },
      validate: ({ message }, meta) => validateOnebotMessage({ ...meta, message, path: "message" }),
      result: () => ({ message_id: ++nextMessageId }),
    },
    send_private_forward_msg: {
      required: { user_id: { type: "number", check: isInt }, messages: { type: "array", check: Array.isArray } },
      optional: {},
      validate: ({ messages }, meta) => validateOnebotMessage({ ...meta, message: messages, warnings, path: "messages" }),
      result: () => ({ message_id: ++nextMessageId }),
    },
    send_group_forward_msg: {
      required: { group_id: { type: "number", check: isInt }, messages: { type: "array", check: Array.isArray } },
      optional: {},
      validate: ({ messages }, meta) => validateOnebotMessage({ ...meta, message: messages, warnings, path: "messages" }),
      result: () => ({ message_id: ++nextMessageId }),
    },
    delete_msg: {
      required: { message_id: { type: "string|number", check: isStringOrNumber } },
      optional: {},
      result: () => ({}),
    },
    get_msg: {
      required: { message_id: { type: "string|number", check: isStringOrNumber } },
      optional: {},
      result: ({ message_id }) => ({
        message_id: message_id,
        message: [{ type: "text", data: { text: "[mock msg]" } }],
        raw_message: "[mock msg]",
        sender: { user_id: 10001, nickname: "mock" },
      }),
    },
    get_forward_msg: {
      required: { message_id: { type: "string|number", check: isStringOrNumber } },
      optional: {},
      result: () => ({
        messages: [
          {
            type: "node",
            data: { uin: botUin, name: nickname, content: [{ type: "text", data: { text: "[mock forward]" } }] },
          },
        ],
      }),
    },
    mark_msg_as_read: {
      required: { message_id: { type: "string|number", check: isStringOrNumber } },
      optional: {},
      result: () => ({}),
    },
    set_friend_add_request: {
      required: { flag: { type: "string", check: isString }, approve: { type: "boolean", check: isBoolean } },
      optional: { remark: { type: "string", check: isString } },
      result: () => ({}),
    },
    set_group_add_request: {
      required: {
        flag: { type: "string", check: isString },
        sub_type: enumRule('"add"|"invite"', ["add", "invite"]),
        approve: { type: "boolean", check: isBoolean },
      },
      optional: { reason: { type: "string", check: isString } },
      result: () => ({}),
    },
    set_group_name: {
      required: { group_id: { type: "number", check: isInt }, group_name: { type: "string", check: isString } },
      optional: {},
      result: () => ({}),
    },
    set_group_card: {
      required: { group_id: { type: "number", check: isInt }, user_id: { type: "number", check: isInt }, card: { type: "string", check: isString } },
      optional: {},
      result: () => ({}),
    },
    set_group_admin: {
      required: { group_id: { type: "number", check: isInt }, user_id: { type: "number", check: isInt }, enable: { type: "boolean", check: isBoolean } },
      optional: {},
      result: () => ({}),
    },
    set_group_special_title: {
      required: { group_id: { type: "number", check: isInt }, user_id: { type: "number", check: isInt }, special_title: { type: "string", check: isString } },
      optional: { duration: { type: "number", check: isInt } },
      result: () => ({}),
    },
    set_group_ban: {
      required: { group_id: { type: "number", check: isInt }, user_id: { type: "number", check: isInt }, duration: { type: "number", check: isInt } },
      optional: {},
      result: () => ({}),
    },
    set_group_whole_ban: {
      required: { group_id: { type: "number", check: isInt }, enable: { type: "boolean", check: isBoolean } },
      optional: {},
      result: () => ({}),
    },
    set_group_kick: {
      required: { group_id: { type: "number", check: isInt }, user_id: { type: "number", check: isInt } },
      optional: { reject_add_request: { type: "boolean", check: isBoolean } },
      result: () => ({}),
    },
    set_group_leave: {
      required: { group_id: { type: "number", check: isInt } },
      optional: { is_dismiss: { type: "boolean", check: isBoolean } },
      result: () => ({}),
    },
    set_msg_emoji_like: {
      required: { message_id: { type: "string|number", check: isStringOrNumber }, emoji_id: { type: "number", check: isInt } },
      optional: {},
      result: () => ({}),
    },
  }

  const adapterType =
    protocolName === "milky" ? "milky" : protocolName === "onebotv11" ? "onebot-v11" : "icqq"

  function rememberError(err) {
    const e = err instanceof Error ? err : new Error(String(err))
    if (errors[errors.length - 1] !== e.message) errors.push(e.message)
    return e
  }

  function requireInt(action, field, value) {
    const num = typeof value === "string" || typeof value === "number" ? Number(value) : value
    if (!isInt(num)) throw makeMockError(protocolName, action, `field "${field}" must be number`)
    return num
  }

  function requireString(action, field, value) {
    if (!isString(value) || !value.trim()) {
      throw makeMockError(protocolName, action, `field "${field}" must be string`)
    }
    return String(value)
  }

  function makeReceipt() {
    const seq = ++nextMessageSeq
    return { seq, message_seq: seq, time: nowSec(), message_id: String(++nextMessageId) }
  }

  function recordCall(kind, name, details = {}) {
    pushRecordedCall(calls, protocolName, kind, name, details)
  }

  function convertIcqqMessage(message) {
    const rawList = Array.isArray(message) ? message : message ? [message] : []
    const hasRawPassthrough = rawList.some(
      item => item && typeof item === "object" && (item.type === "node" || item.type === "forward"),
    )
    if (hasRawPassthrough) return rawList
    return coerceToUniversalMessage(message).convertTo("icqq")
  }

  function normalizeForwardEntries(messages = []) {
    const list = Array.isArray(messages) ? messages : [messages]
    return list
      .filter(Boolean)
      .map(item => {
        const source = isPlainObject(item) ? item : { message: item }
        const rawUserId = source.user_id ?? source.uin ?? source.id ?? botUin
        const userId = (() => {
          const value =
            typeof rawUserId === "string" || typeof rawUserId === "number" ? Number(rawUserId) : rawUserId
          return isInt(value) ? value : botUin
        })()
        const rawSenderName = source.sender_name ?? source.nickname ?? source.name
        const senderName = String(rawSenderName ?? "").trim() || `Mock-${userId}`
        return {
          user_id: userId,
          sender_name: senderName,
          time: isInt(source.time) ? source.time : nowSec(),
          content: source.message ?? source.content ?? item,
        }
      })
  }

  function buildMilkyForwardMessage(messages = []) {
    return [
      {
        type: "forward",
        data: {
          messages: normalizeForwardEntries(messages).map(item => ({
            user_id: item.user_id,
            sender_name: item.sender_name,
            time: item.time,
            segments: coerceToUniversalMessage(item.content).convertTo("milky"),
          })),
        },
      },
    ]
  }

  function buildNodeForwardMessage(messages = [], protocol = "onebotv11") {
    return normalizeForwardEntries(messages).map(item => ({
      type: "node",
      data: {
        uin: item.user_id,
        name: item.sender_name,
        content:
          protocol === "icqq"
            ? convertIcqqMessage(item.content)
            : coerceToUniversalMessage(item.content).convertTo("onebotv11"),
      },
    }))
  }

  const handleApi = async (action, params = {}, { kind = "callApi" } = {}) => {
    const normalized =
      protocolName === "milky" ? normalizeMilkyMethod(action) : normalizeOnebotAction(action)
    if (!normalized) throw makeMockError(protocolName, String(action), "missing action/method")

    const specs = protocolName === "milky" ? milkySpecs : onebotSpecs
    const spec = specs[normalized]
    if (!spec) throw makeMockError(protocolName, normalized, "api not supported by mock")

    const validated = validateFields({
      protocol: protocolName,
      action: normalized,
      params,
      required: spec.required || {},
      optional: spec.optional || {},
      warnings,
    })

    if (typeof spec.validate === "function") {
      spec.validate(validated, { protocol: protocolName, action: normalized, warnings })
    }

    recordCall(kind, normalized, { params: validated })
    return typeof spec.result === "function" ? spec.result(validated) : {}
  }

  function makeIcqqPeer(kind, id) {
    const actionBase =
      kind === "group" ? "pickGroup" : kind === "friend" ? "pickFriend" : "pickUser"
    const target = kind === "group" ? { group_id: id } : { user_id: id }

    return {
      ...(kind === "group" ? { group_id: id } : { user_id: id }),

      async sendMsg(message) {
        recordCall("native", `${actionBase}.sendMsg`, {
          params: { message: convertIcqqMessage(message) },
          target,
        })
        return makeReceipt()
      },

      async makeForwardMsg(messages = []) {
        recordCall("native", `${actionBase}.makeForwardMsg`, {
          params: { messages: snapshotCallValue(messages) },
          target,
        })
        return buildNodeForwardMessage(messages, "icqq")
      },

      async recallMsg(seq) {
        const value = requireInt(`${actionBase}.recallMsg`, "seq", seq)
        recordCall("native", `${actionBase}.recallMsg`, { params: { seq: value }, target })
        return true
      },

      async thumbUp(times = 1) {
        if (kind === "group") {
          throw makeMockError(protocolName, `${actionBase}.thumbUp`, "group does not support thumbUp")
        }
        const count = Math.max(1, requireInt(`${actionBase}.thumbUp`, "times", times))
        recordCall("native", `${actionBase}.thumbUp`, { params: { times: count }, target })
        return {}
      },

      async setReaction(seq, emoji_id, type) {
        if (kind !== "group") {
          throw makeMockError(protocolName, `${actionBase}.setReaction`, "only group supports setReaction")
        }
        const message_seq = requireInt(`${actionBase}.setReaction`, "seq", seq)
        const reaction = requireInt(`${actionBase}.setReaction`, "emoji_id", emoji_id)
        recordCall("native", `${actionBase}.setReaction`, {
          params: {
            message_seq,
            emoji_id: reaction,
            ...(type === undefined ? {} : { type }),
          },
          target,
        })
        return {}
      },

      async muteMember(user_id, duration) {
        if (kind !== "group") {
          throw makeMockError(protocolName, `${actionBase}.muteMember`, "only group supports muteMember")
        }
        const memberId = requireInt(`${actionBase}.muteMember`, "user_id", user_id)
        const seconds = Math.max(0, requireInt(`${actionBase}.muteMember`, "duration", duration))
        recordCall("native", `${actionBase}.muteMember`, {
          params: { user_id: memberId, duration: seconds },
          target,
        })
        return true
      },

      async mute(user_id, duration) {
        return await this.muteMember(user_id, duration)
      },

      async setMute(user_id, duration) {
        return await this.muteMember(user_id, duration)
      },

      async getMemberMap() {
        if (kind !== "group") {
          throw makeMockError(protocolName, `${actionBase}.getMemberMap`, "only group supports getMemberMap")
        }
        recordCall("native", `${actionBase}.getMemberMap`, { target })
        return new Map([
          [10001, makeGroupMember(id, 10001)],
          [10002, makeGroupMember(id, 10002)],
          [botUin, makeGroupMember(id, botUin)],
        ])
      },
    }
  }

  const bot = {
    uin: botUin,
    user_id: botUin,
    self_id: botUin,
    nickname,
    adapterType,
    warnings,
    errors,
    calls,

    async callApi(action, params = {}) {
      try {
        return await handleApi(action, params, { kind: "callApi" })
      } catch (err) {
        throw rememberError(err)
      }
    },

    async sendApi(action, params = {}) {
      try {
        return await handleApi(action, params, { kind: "sendApi" })
      } catch (err) {
        throw rememberError(err)
      }
    },

    async sendMsg(target, message) {
      try {
        const rawList = Array.isArray(message) ? message : message ? [message] : []

        if (protocolName === "onebotv11") {
          const hasNode = rawList.some(i => i && typeof i === "object" && i.type === "node")
          const isPrivate = typeof target === "string" || typeof target === "number"
          const gid = !isPrivate && target && typeof target === "object" ? target.group_id : undefined
          if (hasNode) {
            if (isPrivate) {
              return await bot.callApi("send_private_forward_msg", {
                user_id: Number(target),
                messages: rawList,
              })
            }
            return await bot.callApi("send_group_forward_msg", { group_id: Number(gid), messages: rawList })
          }
        }

        if (protocolName === "milky") {
          const hasForward = rawList.some(i => i && typeof i === "object" && i.type === "forward")
          const segments = hasForward ? rawList : coerceToUniversalMessage(message).convertTo("milky")
          const isPrivate = typeof target === "string" || typeof target === "number"
          if (isPrivate) {
            const res = await bot.callApi("send_private_message", {
              user_id: Number(target),
              message: segments,
            })
            return { seq: res.message_seq, message_seq: res.message_seq, time: res.time }
          }

          const group_id = Number(target?.group_id ?? target?.groupId)
          const res = await bot.callApi("send_group_message", { group_id, message: segments })
          return { seq: res.message_seq, message_seq: res.message_seq, time: res.time }
        }

        if (protocolName === "onebotv11") {
          const segments = coerceToUniversalMessage(message).convertTo("onebotv11")
          const isPrivate = typeof target === "string" || typeof target === "number"
          if (isPrivate) {
            return await bot.callApi("send_private_msg", { user_id: Number(target), message: segments })
          }
          const group_id = Number(target?.group_id ?? target?.groupId)
          return await bot.callApi("send_group_msg", { group_id, message: segments })
        }

        const payload = { message: convertIcqqMessage(message) }
        if (typeof target === "string" || typeof target === "number") {
          const user_id = requireInt("sendMsg", "user_id", target)
          recordCall("native", "sendMsg", { params: payload, target: { user_id } })
          return makeReceipt()
        }

        const group_id = requireInt("sendMsg", "group_id", target?.group_id ?? target?.groupId)
        recordCall("native", "sendMsg", { params: payload, target: { group_id } })
        return makeReceipt()
      } catch (err) {
        throw rememberError(err)
      }
    },

    async sendMessage(target, message) {
      return await bot.sendMsg(target, message)
    },

    pickUser(user_id) {
      const uid = requireInt("pickUser", "user_id", user_id)
      if (protocolName === "icqq") return makeIcqqPeer("user", uid)
      return {
        sendMsg: async message => await bot.sendMsg(String(uid), message),
        makeForwardMsg: async messages => await bot.makePrivateForwardMsg(messages, uid),
      }
    },

    pickFriend(user_id) {
      const uid = requireInt("pickFriend", "user_id", user_id)
      if (protocolName === "icqq") return makeIcqqPeer("friend", uid)
      return {
        sendMsg: async message => await bot.sendMsg(String(uid), message),
        makeForwardMsg: async messages => await bot.makePrivateForwardMsg(messages, uid),
      }
    },

    pickGroup(group_id) {
      const gid = requireInt("pickGroup", "group_id", group_id)
      if (protocolName === "icqq") return makeIcqqPeer("group", gid)
      return {
        sendMsg: async message => await bot.sendMsg({ group_id: gid }, message),
        makeForwardMsg: async messages => await bot.makeGroupForwardMsg(messages, gid),
      }
    },

    async makeGroupForwardMsg(messages = [], group_id) {
      const target =
        group_id === undefined || group_id === null
          ? undefined
          : { group_id: requireInt("makeGroupForwardMsg", "group_id", group_id) }
      recordCall("native", "makeGroupForwardMsg", {
        params: { messages: snapshotCallValue(messages) },
        ...(target ? { target } : {}),
      })
      return protocolName === "milky"
        ? buildMilkyForwardMessage(messages)
        : buildNodeForwardMessage(messages, protocolName === "icqq" ? "icqq" : "onebotv11")
    },

    async makePrivateForwardMsg(messages = [], user_id) {
      const target =
        user_id === undefined || user_id === null
          ? undefined
          : { user_id: requireInt("makePrivateForwardMsg", "user_id", user_id) }
      recordCall("native", "makePrivateForwardMsg", {
        params: { messages: snapshotCallValue(messages) },
        ...(target ? { target } : {}),
      })
      return protocolName === "milky"
        ? buildMilkyForwardMessage(messages)
        : buildNodeForwardMessage(messages, protocolName === "icqq" ? "icqq" : "onebotv11")
    },

    async sendLike(user_id, times = 1) {
      if (protocolName !== "icqq") {
        throw makeMockError(protocolName, "sendLike", "only supported in icqq mock")
      }
      const uid = requireInt("sendLike", "user_id", user_id)
      const count = Math.max(1, requireInt("sendLike", "times", times))
      recordCall("native", "sendLike", { params: { user_id: uid, times: count } })
      return {}
    },

    async setFriendAddRequest(flag, approve, remark, block) {
      if (protocolName !== "icqq") {
        throw makeMockError(protocolName, "setFriendAddRequest", "only supported in icqq mock")
      }
      const flagText = requireString("setFriendAddRequest", "flag", flag)
      recordCall("native", "setFriendAddRequest", {
        params: {
          flag: flagText,
          approve: approve === undefined ? true : Boolean(approve),
          ...(remark === undefined ? {} : { remark: String(remark) }),
          ...(block === undefined ? {} : { block: Boolean(block) }),
        },
      })
      return {}
    },

    async setGroupAddRequest(flag, approve, reason, block) {
      if (protocolName !== "icqq") {
        throw makeMockError(protocolName, "setGroupAddRequest", "only supported in icqq mock")
      }
      const flagText = requireString("setGroupAddRequest", "flag", flag)
      recordCall("native", "setGroupAddRequest", {
        params: {
          flag: flagText,
          approve: approve === undefined ? true : Boolean(approve),
          ...(reason === undefined ? {} : { reason: String(reason) }),
          ...(block === undefined ? {} : { block: Boolean(block) }),
        },
      })
      return {}
    },

    async getLoginInfo() {
      return await bot.callApi("get_login_info", {})
    },

    async getImplInfo() {
      if (protocolName !== "milky") {
        throw makeMockError(protocolName, "get_impl_info", "only supported in milky mock")
      }
      return await bot.callApi("get_impl_info", {})
    },

    async getStatus() {
      if (protocolName !== "onebotv11") {
        throw makeMockError(protocolName, "get_status", "only supported in onebotv11 mock")
      }
      return await bot.callApi("get_status", {})
    },

    async getVersionInfo() {
      if (protocolName !== "onebotv11") {
        throw makeMockError(protocolName, "get_version_info", "only supported in onebotv11 mock")
      }
      return await bot.callApi("get_version_info", {})
    },

    async getFriendList(input = {}) {
      if (protocolName === "icqq") {
        void input
        recordCall("native", "getFriendList", { params: {} })
        return new Map([[10001, makeFriend(10001)]])
      }
      return await bot.callApi("get_friend_list", input)
    },

    async getFriendInfo(input = {}, no_cache = false) {
      if (protocolName === "milky") return await bot.callApi("get_friend_info", input)
      if (protocolName === "onebotv11") return await bot.callApi("get_stranger_info", input)

      const user_id = requireInt(
        "getFriendInfo",
        "user_id",
        isPlainObject(input) ? input.user_id ?? input.userId : input,
      )
      recordCall("native", "getFriendInfo", {
        params: { user_id, no_cache: Boolean(isPlainObject(input) ? input.no_cache : no_cache) },
      })
      return makeFriend(user_id)
    },

    async getGroupList(input = {}) {
      if (protocolName === "icqq") {
        void input
        recordCall("native", "getGroupList", { params: {} })
        return new Map([[123, makeGroup(123)]])
      }
      return await bot.callApi("get_group_list", input)
    },

    async getGroupInfo(input = {}, no_cache = false) {
      if (protocolName === "icqq") {
        const group_id = requireInt(
          "getGroupInfo",
          "group_id",
          isPlainObject(input) ? input.group_id ?? input.groupId : input,
        )
        recordCall("native", "getGroupInfo", {
          params: { group_id, no_cache: Boolean(isPlainObject(input) ? input.no_cache : no_cache) },
        })
        return makeGroup(group_id)
      }
      return await bot.callApi("get_group_info", input)
    },

    async getGroupMemberList(input = {}, no_cache = false) {
      if (protocolName === "icqq") {
        const group_id = requireInt(
          "getGroupMemberList",
          "group_id",
          isPlainObject(input) ? input.group_id ?? input.groupId : input,
        )
        recordCall("native", "getGroupMemberList", {
          params: { group_id, no_cache: Boolean(isPlainObject(input) ? input.no_cache : no_cache) },
        })
        return new Map([
          [10001, makeGroupMember(group_id, 10001)],
          [10002, makeGroupMember(group_id, 10002)],
          [botUin, makeGroupMember(group_id, botUin)],
        ])
      }
      return await bot.callApi("get_group_member_list", input)
    },

    async getGroupMemberInfo(input = {}, maybeUserId, no_cache = false) {
      if (protocolName === "icqq") {
        const group_id = requireInt(
          "getGroupMemberInfo",
          "group_id",
          isPlainObject(input) ? input.group_id ?? input.groupId : input,
        )
        const user_id = requireInt(
          "getGroupMemberInfo",
          "user_id",
          isPlainObject(input) ? input.user_id ?? input.userId : maybeUserId,
        )
        recordCall("native", "getGroupMemberInfo", {
          params: {
            group_id,
            user_id,
            no_cache: Boolean(isPlainObject(input) ? input.no_cache : no_cache),
          },
        })
        return makeGroupMember(group_id, user_id)
      }
      return await bot.callApi("get_group_member_info", input)
    },

    async getUserProfile(input = {}) {
      if (protocolName !== "milky") {
        throw makeMockError(protocolName, "get_user_profile", "only supported in milky mock")
      }
      return await bot.callApi("get_user_profile", input)
    },

    async getUserInfo(input = {}) {
      if (protocolName === "milky") return await bot.getUserProfile(input)
      return await bot.getFriendInfo(input)
    },

    async getStrangerInfo(input = {}, no_cache = false) {
      if (protocolName === "onebotv11") return await bot.callApi("get_stranger_info", input)
      if (protocolName !== "icqq") {
        throw makeMockError(protocolName, "get_stranger_info", "only supported in onebotv11/icqq mock")
      }
      const user_id = requireInt(
        "getStrangerInfo",
        "user_id",
        isPlainObject(input) ? input.user_id ?? input.userId : input,
      )
      recordCall("native", "getStrangerInfo", {
        params: { user_id, no_cache: Boolean(isPlainObject(input) ? input.no_cache : no_cache) },
      })
      return { user_id, nickname: `User-${user_id}`, sex: "unknown", age: 0 }
    },

    async setGroupName(input = {}, maybeName) {
      if (protocolName === "icqq") {
        const group_id = requireInt(
          "setGroupName",
          "group_id",
          isPlainObject(input) ? input.group_id ?? input.groupId : input,
        )
        const group_name = requireString(
          "setGroupName",
          "group_name",
          isPlainObject(input) ? input.group_name ?? input.groupName : maybeName,
        )
        recordCall("native", "setGroupName", { params: { group_id, group_name } })
        return {}
      }
      return await bot.callApi("set_group_name", input)
    },

    async setGroupMemberCard(input = {}) {
      if (protocolName === "milky") return await bot.callApi("set_group_member_card", input)
      if (protocolName === "icqq") {
        const group_id = requireInt("setGroupCard", "group_id", input.group_id ?? input.groupId)
        const user_id = requireInt("setGroupCard", "user_id", input.user_id ?? input.userId)
        const card = requireString("setGroupCard", "card", input.card)
        recordCall("native", "setGroupCard", { params: { group_id, user_id, card } })
        return {}
      }
      return await bot.callApi("set_group_card", input)
    },

    async setGroupMemberAdmin(input = {}) {
      if (protocolName === "milky") return await bot.callApi("set_group_member_admin", input)
      if (protocolName === "icqq") {
        const group_id = requireInt("setGroupAdmin", "group_id", input.group_id ?? input.groupId)
        const user_id = requireInt("setGroupAdmin", "user_id", input.user_id ?? input.userId)
        recordCall("native", "setGroupAdmin", {
          params: { group_id, user_id, enable: Boolean(input.enable) },
        })
        return {}
      }
      return await bot.callApi("set_group_admin", input)
    },

    async setGroupMemberSpecialTitle(input = {}) {
      if (protocolName === "milky") return await bot.callApi("set_group_member_special_title", input)
      if (protocolName === "icqq") {
        const group_id = requireInt(
          "setGroupSpecialTitle",
          "group_id",
          input.group_id ?? input.groupId,
        )
        const user_id = requireInt(
          "setGroupSpecialTitle",
          "user_id",
          input.user_id ?? input.userId,
        )
        const special_title = requireString(
          "setGroupSpecialTitle",
          "special_title",
          input.special_title ?? input.specialTitle,
        )
        recordCall("native", "setGroupSpecialTitle", {
          params: {
            group_id,
            user_id,
            special_title,
            ...(input.duration === undefined ? {} : { duration: Number(input.duration) }),
          },
        })
        return {}
      }
      return await bot.callApi("set_group_special_title", input)
    },

    async setGroupMemberMute(input = {}) {
      if (protocolName === "milky") return await bot.callApi("set_group_member_mute", input)
      if (protocolName === "icqq") {
        const group_id = requireInt(
          "setGroupMemberMute",
          "group_id",
          input.group_id ?? input.groupId,
        )
        const user_id = requireInt("setGroupMemberMute", "user_id", input.user_id ?? input.userId)
        const duration = Math.max(
          0,
          requireInt("setGroupMemberMute", "duration", input.duration ?? input.durationSeconds ?? 0),
        )
        return await bot.pickGroup(group_id).muteMember(user_id, duration)
      }
      return await bot.callApi("set_group_ban", input)
    },

    async setGroupWholeMute(input = {}) {
      if (protocolName === "milky") return await bot.callApi("set_group_whole_mute", input)
      if (protocolName === "icqq") {
        const group_id = requireInt("setGroupWholeBan", "group_id", input.group_id ?? input.groupId)
        recordCall("native", "setGroupWholeBan", {
          params: { group_id, enable: Boolean(input.enable) },
        })
        return {}
      }
      return await bot.callApi("set_group_whole_ban", input)
    },

    async kickGroupMember(input = {}) {
      if (protocolName === "milky") return await bot.callApi("kick_group_member", input)
      if (protocolName === "icqq") {
        const group_id = requireInt("setGroupKick", "group_id", input.group_id ?? input.groupId)
        const user_id = requireInt("setGroupKick", "user_id", input.user_id ?? input.userId)
        recordCall("native", "setGroupKick", {
          params: {
            group_id,
            user_id,
            reject_add_request: Boolean(input.reject_add_request),
            ...(input.message === undefined ? {} : { message: String(input.message) }),
          },
        })
        return {}
      }
      return await bot.callApi("set_group_kick", input)
    },

    async quitGroup(input = {}) {
      if (protocolName === "milky") return await bot.callApi("quit_group", input)
      if (protocolName === "icqq") {
        const group_id = requireInt("setGroupLeave", "group_id", input.group_id ?? input.groupId)
        recordCall("native", "setGroupLeave", { params: { group_id } })
        return {}
      }
      return await bot.callApi("set_group_leave", input)
    },

    async sendGroupMessageReaction(input = {}) {
      if (protocolName === "milky") {
        const group_id = requireInt(
          "sendGroupMessageReaction",
          "group_id",
          input.group_id ?? input.peer_id ?? input.groupId ?? input.peerId,
        )
        const message_seq = requireInt(
          "sendGroupMessageReaction",
          "message_seq",
          input.message_seq ?? input.seq ?? input.messageSeq,
        )
        const reactionRaw = input.reaction ?? input.emoji_id ?? input.emojiId ?? input.id
        if (reactionRaw === undefined || reactionRaw === null || String(reactionRaw).trim() === "") {
          throw makeMockError(protocolName, "sendGroupMessageReaction", 'field "reaction" must be string')
        }
        const reaction = String(reactionRaw)
        return await bot.callApi("send_group_message_reaction", {
          ...input,
          group_id,
          message_seq,
          reaction,
        })
      }
      if (protocolName === "icqq") {
        const group_id = requireInt(
          "sendGroupMessageReaction",
          "group_id",
          input.group_id ?? input.peer_id ?? input.groupId ?? input.peerId,
        )
        const message_seq = requireInt(
          "sendGroupMessageReaction",
          "message_seq",
          input.message_seq ?? input.seq ?? input.messageSeq,
        )
        const reaction = requireInt(
          "sendGroupMessageReaction",
          "reaction",
          input.reaction ?? input.emoji_id ?? input.emojiId ?? input.id,
        )
        return await bot.pickGroup(group_id).setReaction(message_seq, reaction, input.type)
      }
      const message_id = requireInt(
        "sendGroupMessageReaction",
        "message_id",
        input.message_id ?? input.messageId ?? input.message_seq ?? input.seq ?? input.messageSeq,
      )
      const emoji_id = requireInt(
        "sendGroupMessageReaction",
        "emoji_id",
        input.reaction ?? input.emoji_id ?? input.emojiId ?? input.id,
      )
      return await bot.callApi("set_msg_emoji_like", {
        ...input,
        message_id,
        emoji_id,
      })
    },

    async recallMessage(input = {}) {
      if (protocolName === "milky") {
        const seqRaw =
          input.message_seq ?? input.messageSeq ?? input.seq ?? input.message_id ?? input.messageId ?? input.id
        const message_seq = typeof seqRaw === "string" || typeof seqRaw === "number" ? Number(seqRaw) : seqRaw
        const isGroup = Boolean(
          input.isGroup ?? input.group_id ?? input.groupId ?? this?.group_id ?? (this?.message_scene === "group"),
        )
        const peerId = isGroup
          ? input.group_id ?? input.peer_id ?? this?.group_id ?? this?.peer_id
          : input.user_id ?? input.peer_id ?? this?.user_id ?? this?.peer_id

        if (isGroup) return await bot.callApi("recall_group_message", { group_id: Number(peerId), message_seq })
        return await bot.callApi("recall_private_message", { user_id: Number(peerId), message_seq })
      }

      if (protocolName === "icqq") {
        const seq = requireInt(
          "recallMessage",
          "message_seq",
          input.message_seq ?? input.messageSeq ?? input.seq,
        )
        const isGroup = Boolean(
          input.isGroup ?? input.group_id ?? input.groupId ?? this?.group_id ?? (this?.message_scene === "group"),
        )
        const peerId = isGroup
          ? requireInt("recallMessage", "group_id", input.group_id ?? input.peer_id ?? this?.group_id)
          : requireInt("recallMessage", "user_id", input.user_id ?? input.peer_id ?? this?.user_id)
        return isGroup
          ? await bot.pickGroup(peerId).recallMsg(seq)
          : await bot.pickUser(peerId).recallMsg(seq)
      }

      const message_id =
        input.message_id ?? input.messageId ?? input.id ?? input.message_seq ?? input.messageSeq ?? input.seq
      return await bot.callApi("delete_msg", { message_id })
    },

    // used by universal-bot-api.recallMessage
    async recallPrivateMessage(input = {}) {
      return await bot.callApi("recall_private_message", input)
    },

    async recallGroupMessage(input = {}) {
      return await bot.callApi("recall_group_message", input)
    },

    async deleteMessage(input = {}) {
      return await bot.callApi("delete_msg", input)
    },

    // optional helper used by attachStandardMessageApis (milky ctx.getMessage)
    async getMessage(input = {}) {
      return await bot.callApi("get_message", input)
    },

    async getMsg(idOrSeq) {
      if (protocolName === "milky") {
        const message_seq = typeof idOrSeq === "string" || typeof idOrSeq === "number" ? Number(idOrSeq) : idOrSeq
        const message_scene = String(
          this?.message_scene ?? this?.messageScene ?? (this?.group_id ? "group" : "friend"),
        ).toLowerCase()
        const peer_id =
          this?.peer_id ?? (message_scene === "group" ? this?.group_id : this?.user_id) ?? this?.peerId

        const res = await bot.callApi("get_message", {
          message_scene,
          peer_id: typeof peer_id === "string" || typeof peer_id === "number" ? Number(peer_id) : peer_id,
          message_seq,
        })

        const msgObj = res?.message && typeof res.message === "object" ? res.message : null
        const rawSegments = Array.isArray(msgObj?.segments) ? msgObj.segments : []

        let universalMessage
        try {
          universalMessage = UniversalMessage.from("milky", rawSegments)
        } catch {}

        return {
          protocol: "milky",
          adapterType: "Mock",
          ...(msgObj && typeof msgObj === "object" ? msgObj : {}),
          message_scene: msgObj?.message_scene ?? message_scene,
          peer_id: msgObj?.peer_id ?? peer_id,
          message_seq: msgObj?.message_seq ?? message_seq,
          seq: msgObj?.message_seq ?? message_seq,
          segments: rawSegments,
          ...(universalMessage ? { universalMessage, message: universalMessage.segments } : {}),
        }
      }

      if (protocolName === "icqq") {
        const seq =
          typeof idOrSeq === "string" || typeof idOrSeq === "number" ? Number(idOrSeq) : idOrSeq
        recordCall("native", "getMsg", { params: { idOrSeq: seq } })
        const rawSegments = [{ type: "text", data: { text: "[mock msg]" } }]

        let universalMessage
        try {
          universalMessage = UniversalMessage.from("icqq", rawSegments)
        } catch {}

        return {
          protocol: "icqq",
          adapterType: "Mock",
          seq,
          message_seq: seq,
          segments: rawSegments,
          rawSegments,
          ...(universalMessage ? { universalMessage, message: universalMessage.segments } : {}),
        }
      }

      const res = await bot.callApi("get_msg", { message_id: idOrSeq })
      const rawSegments =
        res?.message?.message ?? res?.message ?? res?.segments ?? res?.data?.message ?? res?.data?.segments
      const list = Array.isArray(rawSegments) ? rawSegments : rawSegments ? [rawSegments] : []

      let universalMessage
      try {
        universalMessage = UniversalMessage.from("onebotv11", list)
      } catch {}

      return {
        protocol: "onebotv11",
        adapterType: "Mock",
        ...(res && typeof res === "object" ? res : {}),
        segments: list,
        rawSegments: list,
        ...(universalMessage ? { universalMessage, message: universalMessage.segments } : {}),
      }
    },

    async acceptFriendRequest(input = {}) {
      if (protocolName === "milky") return await bot.callApi("accept_friend_request", input)
      if (protocolName === "icqq") {
        return await bot.setFriendAddRequest(input.flag, true, input.remark ?? input.reason, input.block)
      }
      const flag = input.flag
      const remark = input.remark ?? input.reason
      return await bot.callApi("set_friend_add_request", { flag, approve: true, ...(remark !== undefined ? { remark } : {}) })
    },

    async rejectFriendRequest(input = {}) {
      if (protocolName === "milky") return await bot.callApi("reject_friend_request", input)
      if (protocolName === "icqq") {
        return await bot.setFriendAddRequest(input.flag, false, input.remark ?? input.reason, input.block)
      }
      const flag = input.flag
      const remark = input.remark ?? input.reason
      return await bot.callApi("set_friend_add_request", { flag, approve: false, ...(remark !== undefined ? { remark } : {}) })
    },

    async acceptGroupRequest(input = {}) {
      if (protocolName === "milky") return await bot.callApi("accept_group_request", input)
      if (protocolName === "icqq") {
        return await bot.setGroupAddRequest(input.flag, true, input.reason, input.block)
      }
      const flag = input.flag
      const sub_type = input.sub_type ?? input.subType
      const reason = input.reason
      return await bot.callApi("set_group_add_request", { flag, sub_type, approve: true, ...(reason !== undefined ? { reason } : {}) })
    },

    async rejectGroupRequest(input = {}) {
      if (protocolName === "milky") return await bot.callApi("reject_group_request", input)
      if (protocolName === "icqq") {
        return await bot.setGroupAddRequest(input.flag, false, input.reason, input.block)
      }
      const flag = input.flag
      const sub_type = input.sub_type ?? input.subType
      const reason = input.reason
      return await bot.callApi("set_group_add_request", { flag, sub_type, approve: false, ...(reason !== undefined ? { reason } : {}) })
    },

    async sendProfileLike(input = {}) {
      if (protocolName === "milky") return await bot.callApi("send_profile_like", input)
      if (protocolName === "onebotv11") return await bot.callApi("send_like", input)
      const user_id = requireInt("sendProfileLike", "user_id", input.user_id)
      const times = Math.max(1, requireInt("sendProfileLike", "times", input.times ?? input.count ?? 1))
      return await bot.sendLike(user_id, times)
    },
  }

  return { bot, warnings, errors, calls }
}
