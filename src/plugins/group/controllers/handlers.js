import _ from "lodash"
import moment from "moment"
import { segment } from "../../../Bot/message/index.js"
import Filemage from "../../../utils/Filemage.js"
import cfg from "../../../lib/config.js"
import { applyRkeyToUrl, getSceneRkey } from "../../../utils/rkey.js"
import { setChuoEnabled } from "../../chuo/model/config.js"
import {
  getBotNoticeConfig,
  getGlobalNoticeConfig,
  getGroupNoticeConfig,
  getSystemNoticeConfig,
  setBotNoticeConfig,
  setGlobalNoticeConfig,
  setGroupNoticeConfig,
  setSystemNoticeConfig,
} from "../model/notice-store.js"
import {
  buildNoticeForwardMsgList,
  buildNoticeForwardRelayPayload,
  collectNoticeMessageSegmentCandidates,
  createMessageAwareNotice,
  createSummaryNotice,
  fetchRecalledMessageViaApi,
  findStandaloneForwardSegment,
  getForwardSegmentId,
  getRecalledMessageSafe,
  getTempGroupId,
  isDegradedForwardPlaceholderRecord,
  isNoticeForwardRelayPayload,
  isTempMessage,
  normalizeForwardApiMessages,
  normalizeNoticeMessageSegments,
  sendMasterPayload,
  sendToMasters,
  toForwardSafeSegments,
} from "./notice-helpers.js"
import {
  cleanupGroupScopedPluginData,
  reconcileGroupScopedPlugins,
} from "../services/group-scope-maintenance.js"
import { handleRecallCommand } from "../../shared/recall-command.js"
const filemage = new Filemage()
const groupPass = {}

function toInt(value) {
  if (value === undefined || value === null) return undefined
  const v = typeof value === "string" ? value.trim() : value
  if (v === "") return undefined
  const num = Number(v)
  return Number.isFinite(num) ? Math.floor(num) : undefined
}

function clampText(text, maxLen = 120) {
  const s = String(text || "").trim()
  if (!s) return ""
  if (s.length <= maxLen) return s
  return s.slice(0, maxLen - 1) + "…"
}


function randomWithDigits(digits) {
  if (!Number.isInteger(digits) || digits <= 0) {
    throw new Error("位数必须是正整数")
  }
  const min = Math.pow(10, digits - 1) // 最小值，例如 3 位数 -> 100
  const max = Math.pow(10, digits) - 1 // 最大值，例如 3 位数 -> 999
  return _.random(min, max)
}

function parseDurationSeconds(input) {
  const raw = String(input || "").trim()
  if (!raw) return 0

  const m = raw.match(/^(\d+)\s*(秒|s|分|分钟|m|小时|h|天|d)?$/i)
  if (!m) return 0

  const n = Math.floor(Number(m[1]))
  if (!Number.isFinite(n) || n <= 0) return 0

  const unit = String(m[2] || "秒").toLowerCase()
  if (unit === "秒" || unit === "s") return n
  if (unit === "分" || unit === "分钟" || unit === "m") return n * 60
  if (unit === "小时" || unit === "h") return n * 3600
  if (unit === "天" || unit === "d") return n * 86400
  return n
}

async function checkUserAdminOrMaster(ctx) {
  if (ctx?.isMaster) return true
  if (typeof ctx?.isGroupAdmin === "function") return await ctx.isGroupAdmin()
  return Boolean(ctx?.isOwner || ctx?.isAdmin)
}

async function checkBotAdmin(ctx) {
  if (typeof ctx?.isBotGroupAdmin === "function") return await ctx.isBotGroupAdmin()
  return Boolean(ctx?.botIsOwner || ctx?.botIsAdmin)
}

async function checkBotOwner(ctx) {
  if (typeof ctx?.isBotGroupOwner === "function") return await ctx.isBotGroupOwner()
  return Boolean(ctx?.botIsOwner)
}

function formatOnOff(enabled) {
  return enabled ? "开启" : "关闭"
}

function formatScopeLabel(scope) {
  if (scope === "group") return "群单独"
  if (scope === "bot") return "Bot 单独"
  if (scope === "global") return "全局"
  if (scope === "system") return "系统"
  return scope || ""
}

async function handleNoticeToggle(ctx, name, enable) {
  const n = String(name || "").trim()
  const on = Boolean(enable)

  const gid = toInt(ctx?.group_id)
  const sid = toInt(ctx?.self_id)

  const requireGroup = async () => {
    if (!gid) {
      await ctx.reply("请在群内使用该设置（需要群号）")
      return null
    }
    return gid
  }

  switch (n) {
    case "好友消息": {
      if (!sid) return await ctx.reply("无法识别 bot 账号（self_id 缺失）")
      const next = setBotNoticeConfig(sid, { friend_message: on })
      return await ctx.reply(
        `好友消息（${formatScopeLabel("bot")}）已${formatOnOff(next.friend_message)}`,
      )
    }
    case "群消息": {
      const groupId = await requireGroup()
      if (!groupId) return true
      const next = setGroupNoticeConfig(groupId, { group_message: on })
      return await ctx.reply(
        `群消息（${formatScopeLabel("group")}）已${formatOnOff(next.group_message)}（群:${groupId}）`,
      )
    }
    case "群临时消息": {
      const groupId = await requireGroup()
      if (!groupId) return true
      const next = setGroupNoticeConfig(groupId, { group_temp_message: on })
      return await ctx.reply(
        `群临时消息（${formatScopeLabel("group")}）已${formatOnOff(next.group_temp_message)}（群:${groupId}）`,
      )
    }
    case "群撤回": {
      const groupId = await requireGroup()
      if (!groupId) return true
      const next = setGroupNoticeConfig(groupId, { group_recall: on })
      return await ctx.reply(
        `群撤回（${formatScopeLabel("group")}）已${formatOnOff(next.group_recall)}（群:${groupId}）`,
      )
    }
    case "好友撤回": {
      if (!sid) return await ctx.reply("无法识别 bot 账号（self_id 缺失）")
      const next = setBotNoticeConfig(sid, { friend_recall: on })
      return await ctx.reply(
        `好友撤回（${formatScopeLabel("bot")}）已${formatOnOff(next.friend_recall)}`,
      )
    }
    case "好友申请": {
      if (!sid) return await ctx.reply("无法识别 bot 账号（self_id 缺失）")
      const next = setBotNoticeConfig(sid, { friend_request: on })
      return await ctx.reply(
        `好友申请（${formatScopeLabel("bot")}）已${formatOnOff(next.friend_request)}`,
      )
    }
    case "加群申请": {
      const groupId = await requireGroup()
      if (!groupId) return true
      const next = setGroupNoticeConfig(groupId, { group_join_request: on })
      return await ctx.reply(
        `加群申请（${formatScopeLabel("group")}）已${formatOnOff(next.group_join_request)}（群:${groupId}）`,
      )
    }
    case "群邀请":
    case "群聊邀请": {
      if (!sid) return await ctx.reply("无法识别 bot 账号（self_id 缺失）")
      const next = setBotNoticeConfig(sid, { group_invite: on })
      return await ctx.reply(
        `群邀请（${formatScopeLabel("bot")}）已${formatOnOff(next.group_invite)}`,
      )
    }
    case "好友列表变动": {
      const next = setGlobalNoticeConfig({ friend_list_change: on })
      return await ctx.reply(
        `好友列表变动（${formatScopeLabel("global")}）已${formatOnOff(next.friend_list_change)}（轮询未启用，暂不生效）`,
      )
    }
    case "群聊列表变动": {
      const groupId = await requireGroup()
      if (!groupId) return true
      const next = setGroupNoticeConfig(groupId, { group_list_change: on })
      return await ctx.reply(
        `群聊列表变动（${formatScopeLabel("group")}）已${formatOnOff(next.group_list_change)}（仅 bot 进/退群事件 best-effort）`,
      )
    }
    case "群成员变动": {
      const groupId = await requireGroup()
      if (!groupId) return true
      const next = setGroupNoticeConfig(groupId, { group_member_change: on })
      return await ctx.reply(
        `群成员变动（${formatScopeLabel("group")}）已${formatOnOff(next.group_member_change)}（群:${groupId}）`,
      )
    }
    case "群管理变动": {
      const groupId = await requireGroup()
      if (!groupId) return true
      const next = setGroupNoticeConfig(groupId, { group_admin_change: on })
      return await ctx.reply(
        `群管理变动（${formatScopeLabel("group")}）已${formatOnOff(next.group_admin_change)}（群:${groupId}）`,
      )
    }
    case "禁言": {
      const groupId = await requireGroup()
      if (!groupId) return true
      const next = setGroupNoticeConfig(groupId, { bot_muted: on })
      return await ctx.reply(
        `Bot 被禁言（${formatScopeLabel("group")}）已${formatOnOff(next.bot_muted)}（群:${groupId}）`,
      )
    }
    case "全部通知": {
      const next = setSystemNoticeConfig({ notify_all_masters: on })
      return await ctx.reply(
        `通知全部主人（${formatScopeLabel("system")}）已${formatOnOff(next.notify_all_masters)}`,
      )
    }
    default:
      return await ctx.reply("未知设置项，可用：#荨鹿通知设置 查看")
  }
}

export function register(bot) {
  if (!bot || !bot.registerCommand) return

  if (typeof bot.onMount === "function") {
    bot.onMount(async () => {
      const result = await reconcileGroupScopedPlugins(bot, {
        reason: "group-plugin-on-mount-reconcile",
      }).catch(err => {
        console.warn("[group] group scope reconcile failed:", err?.message || err)
        return null
      })

      if (result?.skippedDueToOwnerMismatch) {
        console.warn(
          `[group] skip startup group cleanup because bot owner changed: ${result.owner_self_id} -> ${result.current_self_id}`,
        )
        return
      }

      const cleanedCount =
        Number(result?.cleaned?.learningChat?.missingGroupIds?.length || 0) +
        Number(result?.cleaned?.groupNoticeRemoved?.length || 0) +
        Number(result?.cleaned?.bilibiliRemoved?.length || 0) +
        Number(result?.cleaned?.schedulerRemovedTaskIds?.length || 0)
      if (cleanedCount > 0) {
        console.warn(`[group] startup reconciled group-scoped plugin data, cleaned=${cleanedCount}`)
      }
    })
  }
  //第一个参数是数组第一个是命令，第二个是事件，第三个是优先级（第二个和第三个都可以省略）

  // ===================== 荨鹿通知设置（主人） =====================
  bot.registerCommand(
    ["^(|#)荨鹿通知设置$", { example: ["#荨鹿通知设置"], desc: "查看/提示荨鹿通知开关（主人）" }],
    async ctx => {
      if (!ctx.isMaster) return await ctx.reply("仅主人可用")

      const sys = getSystemNoticeConfig()
      const botCfg = getBotNoticeConfig(ctx.self_id)
      const globalCfg = getGlobalNoticeConfig()
      const groupId = toInt(ctx.group_id)
      const groupCfg = groupId ? getGroupNoticeConfig(groupId) : null

      const lines = []
      lines.push(`荨鹿通知设置（bot:${ctx.self_id || ""}${groupId ? ` 群:${groupId}` : ""}）`)
      lines.push("说明：群单独=当前群独立开关；Bot单独=当前bot独立开关")
      lines.push("")

      const row = (label, scope, enabled, cmdHint = "") => {
        const on = enabled ? "✅" : "❌"
        lines.push(`${on} ${label}（${formatScopeLabel(scope)}）${cmdHint ? `  ${cmdHint}` : ""}`)
      }

      row("好友消息", "bot", botCfg.friend_message, "指令：#荨鹿通知设置好友消息开启")
      row("好友撤回", "bot", botCfg.friend_recall, "指令：#荨鹿通知设置好友撤回开启")
      row("好友申请", "bot", botCfg.friend_request, "指令：#荨鹿通知设置好友申请开启")
      row("群邀请", "bot", botCfg.group_invite, "指令：#荨鹿通知设置群邀请开启")
      lines.push("")

      if (groupCfg) {
        row("群消息", "group", groupCfg.group_message, "指令：#荨鹿通知设置群消息开启")
        row("群临时消息", "group", groupCfg.group_temp_message, "指令：#荨鹿通知设置群临时消息开启")
        row("群撤回", "group", groupCfg.group_recall, "指令：#荨鹿通知设置群撤回开启")
        row("加群申请", "group", groupCfg.group_join_request, "指令：#荨鹿通知设置加群申请开启")
        row(
          "群成员变动",
          "group",
          groupCfg.group_member_change,
          "指令：#荨鹿通知设置群成员变动开启",
        )
        row("群管理变动", "group", groupCfg.group_admin_change, "指令：#荨鹿通知设置群管理变动开启")
        row("Bot 被禁言", "group", groupCfg.bot_muted, "指令：#荨鹿通知设置禁言开启")
        row(
          "群聊列表变动",
          "group",
          groupCfg.group_list_change,
          "仅 bot 进/退群事件 best-effort（无轮询）",
        )
      } else {
        lines.push("（群单独设置需在群内查看）")
      }
      lines.push("")

      row(
        "好友列表变动",
        "global",
        globalCfg.friend_list_change,
        "轮询未启用，暂不生效（指令：#荨鹿通知设置好友列表变动开启）",
      )
      lines.push("")

      row("通知全部主人", "system", sys.notify_all_masters, "指令：#荨鹿通知设置全部通知开启")
      lines.push(
        `删除缓存时间（系统）：${Math.max(1, Math.floor(Number(sys.cache_ttl_sec) || 60))} 秒`,
      )
      lines.push("指令：#荨鹿通知设置删除缓存时间 60 秒")

      return await ctx.reply(lines.join("\n").trim())
    },
  )

  bot.registerCommand(
    [
      "^(|#)荨鹿通知设置删除缓存时间\\s*(\\d+)\\s*(秒|s)?$",
      { example: ["#荨鹿通知设置删除缓存时间 60 秒"], desc: "设置通知去重缓存时间（秒）" },
    ],
    async ctx => {
      if (!ctx.isMaster) return await ctx.reply("仅主人可用")
      const m = String(ctx.msg || "").match(/删除缓存时间\s*(\d+)/)
      const sec = Math.max(1, Math.floor(Number(m?.[1] || 60)))
      const next = setSystemNoticeConfig({ cache_ttl_sec: sec })
      return await ctx.reply(
        `删除缓存时间已设置为 ${next.cache_ttl_sec} 秒（用于通知去重缓存 TTL）`,
      )
    },
  )

  bot.registerCommand(
    [
      "^(|#)荨鹿通知设置(.+?)(单独)?(开启|关闭)$",
      { example: ["#荨鹿通知设置群消息开启"], desc: "开启/关闭指定通知（主人）" },
    ],
    async ctx => {
      if (!ctx.isMaster) return await ctx.reply("仅主人可用")
      const m = String(ctx.msg || "").match(/^#?荨鹿通知设置(.+?)(?:单独)?(开启|关闭)$/)
      if (!m) return false
      const name = String(m[1] || "").trim()
      const enable = String(m[2] || "") === "开启"
      return await handleNoticeToggle(ctx, name, enable)
    },
  )

  // 戳一戳开关（主人）
  bot.registerCommand(
    ["^(|#)开启戳一戳$", { example: ["#开启戳一戳"], desc: "开启戳一戳回复（chuo 插件）" }],
    async ctx => {
      if (!ctx.isMaster) return await ctx.reply("仅主人可用")
      setChuoEnabled(true)
      return await ctx.reply("戳一戳已开启")
    },
  )
  bot.registerCommand(
    ["^(|#)关闭戳一戳$", { example: ["#关闭戳一戳"], desc: "关闭戳一戳回复（chuo 插件）" }],
    async ctx => {
      if (!ctx.isMaster) return await ctx.reply("仅主人可用")
      setChuoEnabled(false)
      return await ctx.reply("戳一戳已关闭")
    },
  )

  // ===================== 通知推送（事件型） =====================
  // 群消息（群单独）
  bot.registerCommand(["", "message.group.*", 100], async ctx => {
    try {
      const groupId = toInt(ctx.group_id)
      if (!groupId) return false

      const gcfg = getGroupNoticeConfig(groupId)
      if (!gcfg.group_message) return false

      const senderName = ctx?.sender?.card || ctx?.sender?.nickname || ""
      const groupName = ctx?.group_name ? String(ctx.group_name) : ""
      const key = `group_message:${groupId}:${ctx.message_id ?? ctx.seq ?? ctx.message_seq ?? ctx.time ?? ""}`
      const payload = await createMessageAwareNotice(ctx, {
        title: "[荨鹿通知][群消息]",
        groupId,
        groupName,
        users: [{ label: "用户", userId: ctx.user_id, preferredName: senderName }],
        message: ctx.message,
        time: ctx.time,
        forwardTitle: "[荨鹿通知][群消息详情]",
      })
      await sendToMasters(ctx, payload, { dedupeKey: key })
    } catch (err) {
      console.warn("[group] group message notify failed:", err?.message || err)
    }
    return false
  })

  // 私聊消息（好友/临时）
  bot.registerCommand(["", "message.private.*", 100], async ctx => {
    try {
      const sid = toInt(ctx.self_id)
      if (!sid) return false

      // 群临时消息（群单独）
      if (isTempMessage(ctx)) {
        const groupId = getTempGroupId(ctx)
        if (!groupId) return false
        const gcfg = getGroupNoticeConfig(groupId)
        if (!gcfg.group_temp_message) return false

        const senderName = ctx?.sender?.card || ctx?.sender?.nickname || ""
        const key = `group_temp_message:${groupId}:${ctx.message_id ?? ctx.seq ?? ctx.message_seq ?? ctx.time ?? ""}`
        const payload = await createMessageAwareNotice(ctx, {
          title: "[荨鹿通知][群临时消息]",
          groupId,
          users: [{ label: "用户", userId: ctx.user_id, preferredName: senderName }],
          message: ctx.message,
          time: ctx.time,
          forwardTitle: "[荨鹿通知][群临时消息详情]",
        })
        await sendToMasters(ctx, payload, { dedupeKey: key })
        return false
      }

      // 好友消息（Bot 单独）
      const bcfg = getBotNoticeConfig(sid)
      if (!bcfg.friend_message) return false

      const senderName = ctx?.sender?.card || ctx?.sender?.nickname || ""
      const key = `friend_message:${sid}:${ctx.user_id ?? ""}:${ctx.message_id ?? ctx.seq ?? ctx.message_seq ?? ctx.time ?? ""}`
      const payload = await createMessageAwareNotice(ctx, {
        title: "[荨鹿通知][好友消息]",
        users: [{ label: "用户", userId: ctx.user_id, preferredName: senderName }],
        message: ctx.message,
        time: ctx.time,
        forwardTitle: "[荨鹿通知][好友消息详情]",
      })
      await sendToMasters(ctx, payload, { dedupeKey: key })
    } catch (err) {
      console.warn("[group] private message notify failed:", err?.message || err)
    }
    return false
  })

  // 群撤回（群单独）
  bot.registerCommand(["", "notice.group.recall", 100], async ctx => {
    try {
      const groupId = toInt(ctx.group_id)
      if (!groupId) return false

      const gcfg = getGroupNoticeConfig(groupId)
      if (!gcfg.group_recall) return false

      const groupName = ctx?.group_name ? String(ctx.group_name) : ""
      const operatorId = ctx.operator_id ?? ctx?.operatorId ?? ""
      const senderId = ctx.user_id ?? ctx.sender_id ?? ""
      const msgId = ctx.message_id ?? ""
      const seq = ctx.message_seq ?? ctx.seq ?? ""
      const recalled = await getRecalledMessageSafe(ctx)

      const key = `group_recall:${groupId}:${msgId || seq || ctx.time || ""}`
      const payload = await createMessageAwareNotice(ctx, {
        title: "[荨鹿通知][群撤回]",
        groupId,
        groupName,
        users: [
          {
            label: "发送者",
            userId: senderId,
            preferredName: recalled?.sender?.card || recalled?.sender?.nickname || "",
          },
          operatorId ? { label: "操作者", userId: operatorId } : null,
        ].filter(Boolean),
        lines: [
          msgId ? `message_id：${msgId}` : "",
          seq ? `message_seq：${seq}` : "",
          ctx.display_suffix ? `提示：${ctx.display_suffix}` : "",
        ],
        message: recalled,
        time: recalled?.time ?? ctx.time,
        missingLine: "内容：未找到已撤回原消息",
        forwardTitle: "[荨鹿通知][群撤回消息]",
      })
      await sendToMasters(ctx, payload, { dedupeKey: key })
    } catch (err) {
      console.warn("[group] group recall notify failed:", err?.message || err)
    }
    return false
  })

  // 好友撤回（Bot 单独）
  bot.registerCommand(["", "notice.private.recall", 100], async ctx => {
    try {
      const proto = String(ctx?.protocol || "").toLowerCase()
      if (proto === "milky" && String(ctx?.message_scene || "") !== "friend") return false

      const sid = toInt(ctx.self_id)
      if (!sid) return false
      const bcfg = getBotNoticeConfig(sid)
      if (!bcfg.friend_recall) return false

      const operatorId = ctx.operator_id ?? ctx?.operatorId ?? ""
      const senderId = ctx.user_id ?? ctx.sender_id ?? ""
      const msgId = ctx.message_id ?? ""
      const seq = ctx.message_seq ?? ctx.seq ?? ""
      const recalled = await getRecalledMessageSafe(ctx)

      const key = `friend_recall:${sid}:${senderId}:${msgId || seq || ctx.time || ""}`
      const payload = await createMessageAwareNotice(ctx, {
        title: "[荨鹿通知][好友撤回]",
        users: [
          {
            label: "用户",
            userId: senderId,
            preferredName: recalled?.sender?.card || recalled?.sender?.nickname || "",
          },
          operatorId ? { label: "操作者", userId: operatorId } : null,
        ].filter(Boolean),
        lines: [
          msgId ? `message_id：${msgId}` : "",
          seq ? `message_seq：${seq}` : "",
          ctx.display_suffix ? `提示：${ctx.display_suffix}` : "",
        ],
        message: recalled,
        time: recalled?.time ?? ctx.time,
        missingLine: "内容：未找到已撤回原消息",
        forwardTitle: "[荨鹿通知][好友撤回消息]",
      })
      await sendToMasters(ctx, payload, { dedupeKey: key })
    } catch (err) {
      console.warn("[group] friend recall notify failed:", err?.message || err)
    }
    return false
  })

  // 好友申请（Bot 单独）
  bot.registerCommand(["", "request.private.friend", 100], async ctx => {
    try {
      const sid = toInt(ctx.self_id)
      if (!sid) return false
      const bcfg = getBotNoticeConfig(sid)
      if (!bcfg.friend_request) return false

      const userId = ctx.user_id ?? ctx.initiator_id ?? ctx.initiatorId ?? ""
      const comment = ctx.comment ?? ""
      const via = ctx.via ?? ""
      const flag = ctx.flag ?? ctx.notification_seq ?? ""
      const key = `friend_request:${sid}:${userId}:${flag || ctx.time || ""}`
      const payload = await createSummaryNotice(ctx, {
        title: "[荨鹿通知][好友申请]",
        users: [{ label: "用户", userId }],
        lines: [
          flag ? `flag：${flag}` : "",
          via ? `来源：${via}` : "",
          comment ? `附言：${clampText(comment, 120)}` : "",
        ],
      })
      await sendToMasters(ctx, payload, { dedupeKey: key })
    } catch (err) {
      console.warn("[group] friend request notify failed:", err?.message || err)
    }
    return false
  })

  // 加群申请（群单独）
  bot.registerCommand(["", "request.group.add", 100], async ctx => {
    try {
      const groupId = toInt(ctx.group_id)
      if (!groupId) return false
      const gcfg = getGroupNoticeConfig(groupId)
      if (!gcfg.group_join_request) return false

      const userId = ctx.user_id ?? ctx.initiator_id ?? ""
      const comment = ctx.comment ?? ""
      const flag = ctx.flag ?? ctx.notification_seq ?? ""
      const key = `group_join_request:${groupId}:${userId}:${flag || ctx.time || ""}`
      const payload = await createSummaryNotice(ctx, {
        title: "[荨鹿通知][加群申请]",
        groupId,
        users: [{ label: "用户", userId }],
        lines: [flag ? `flag：${flag}` : "", comment ? `附言：${clampText(comment, 120)}` : ""],
      })
      await sendToMasters(ctx, payload, { dedupeKey: key })
    } catch (err) {
      console.warn("[group] group join request notify failed:", err?.message || err)
    }
    return false
  })

  // request.group.invite：milky=邀请入群审核（群单独）；onebot=bot 被邀请入群（Bot 单独）
  bot.registerCommand(["", "request.group.invite", 100], async ctx => {
    try {
      const proto = String(ctx?.protocol || "").toLowerCase()

      if (proto === "milky") {
        const groupId = toInt(ctx.group_id)
        if (!groupId) return false
        const gcfg = getGroupNoticeConfig(groupId)
        if (!gcfg.group_join_request) return false

        const inviter = ctx.initiator_id ?? ""
        const target = ctx.target_user_id ?? ""
        const flag = ctx.flag ?? ctx.notification_seq ?? ""
        const key = `group_invited_join_request:${groupId}:${inviter}:${target}:${flag || ctx.time || ""}`
        const payload = await createSummaryNotice(ctx, {
          title: "[荨鹿通知][加群申请-邀请入群审核]",
          groupId,
          users: [
            target ? { label: "被邀请者", userId: target } : null,
            inviter ? { label: "邀请者", userId: inviter } : null,
          ].filter(Boolean),
          lines: [flag ? `flag：${flag}` : ""],
        })
        await sendToMasters(ctx, payload, { dedupeKey: key })
        return false
      }

      const sid = toInt(ctx.self_id)
      if (!sid) return false
      const bcfg = getBotNoticeConfig(sid)
      if (!bcfg.group_invite) return false

      const groupId = toInt(ctx.group_id)
      const inviter = ctx.user_id ?? ""
      const flag = ctx.flag ?? ""
      const key = `group_invite:${sid}:${groupId || ""}:${inviter}:${flag || ctx.time || ""}`
      const payload = await createSummaryNotice(ctx, {
        title: "[荨鹿通知][群邀请]",
        groupId,
        users: [inviter ? { label: "邀请者", userId: inviter } : null].filter(Boolean),
        lines: [flag ? `flag：${flag}` : ""],
      })
      await sendToMasters(ctx, payload, { dedupeKey: key })
    } catch (err) {
      console.warn("[group] group invite notify failed:", err?.message || err)
    }
    return false
  })

  // milky: bot 被邀请入群事件
  bot.registerCommand(["", "notice.group.invited", 100], async ctx => {
    try {
      const sid = toInt(ctx.self_id)
      if (!sid) return false
      const bcfg = getBotNoticeConfig(sid)
      if (!bcfg.group_invite) return false

      const groupId = toInt(ctx.group_id)
      const inviter = ctx.initiator_id ?? ""
      const seq = ctx.invitation_seq ?? ""
      const key = `group_invite:${sid}:${groupId || ""}:${inviter}:${seq || ctx.time || ""}`
      const payload = await createSummaryNotice(ctx, {
        title: "[荨鹿通知][群邀请]",
        groupId,
        users: [inviter ? { label: "邀请者", userId: inviter } : null].filter(Boolean),
        lines: [seq ? `invitation_seq：${seq}` : ""],
      })
      await sendToMasters(ctx, payload, { dedupeKey: key })
    } catch (err) {
      console.warn("[group] milky group invited notify failed:", err?.message || err)
    }
    return false
  })

  // 群成员变动（群单独） + 群聊列表变动（仅 bot 自己进/退群）
  bot.registerCommand(["", "notice.group.increase", 100], async ctx => {
    try {
      const groupId = toInt(ctx.group_id)
      if (!groupId) return false

      const gcfg = getGroupNoticeConfig(groupId)
      const uid = toInt(ctx.user_id)
      const sid = toInt(ctx.self_id)

      if (uid && sid && uid === sid) {
        if (!gcfg.group_list_change) return false
        const key = `group_list_change:join:${sid}:${groupId}:${ctx.time || ""}`
        const payload = await createSummaryNotice(ctx, {
          title: "[荨鹿通知][群聊列表变动]",
          groupId,
          users: [{ label: "Bot", userId: sid, preferredName: "Bot" }],
          lines: [`Bot 已加入群：${groupId}`],
        })
        await sendToMasters(ctx, payload, { dedupeKey: key })
        return false
      }

      if (!gcfg.group_member_change) return false

      const operator = ctx.operator_id ?? ""
      const invitor = ctx.invitor_id ?? ""
      const key = `group_member_increase:${groupId}:${uid || ""}:${ctx.time || ""}`
      const payload = await createSummaryNotice(ctx, {
        title: "[荨鹿通知][群成员增加]",
        groupId,
        users: [
          uid ? { label: "用户", userId: uid } : null,
          operator ? { label: "管理员", userId: operator } : null,
          invitor ? { label: "邀请者", userId: invitor } : null,
        ].filter(Boolean),
      })
      await sendToMasters(ctx, payload, { dedupeKey: key })
    } catch (err) {
      console.warn("[group] group increase notify failed:", err?.message || err)
    }
    return false
  })

  bot.registerCommand(["", "notice.group.decrease", 100], async ctx => {
    try {
      const groupId = toInt(ctx.group_id)
      if (!groupId) return false

      const gcfg = getGroupNoticeConfig(groupId)
      const uid = toInt(ctx.user_id)
      const sid = toInt(ctx.self_id)

      if (uid && sid && uid === sid) {
        await cleanupGroupScopedPluginData(groupId, {
          reason: "notice-group-decrease-self",
        }).catch(err => {
          console.warn("[group] group-scope cleanup failed after self decrease:", err?.message || err)
        })

        if (!gcfg.group_list_change) return false
        const key = `group_list_change:leave:${sid}:${groupId}:${ctx.time || ""}`
        const payload = await createSummaryNotice(ctx, {
          title: "[荨鹿通知][群聊列表变动]",
          groupId,
          users: [{ label: "Bot", userId: sid, preferredName: "Bot" }],
          lines: [`Bot 已退出/被移出群：${groupId}`],
        })
        await sendToMasters(ctx, payload, { dedupeKey: key })
        return false
      }

      if (!gcfg.group_member_change) return false

      const operator = ctx.operator_id ?? ""
      const key = `group_member_decrease:${groupId}:${uid || ""}:${ctx.time || ""}`
      const payload = await createSummaryNotice(ctx, {
        title: "[荨鹿通知][群成员减少]",
        groupId,
        users: [
          uid ? { label: "用户", userId: uid } : null,
          operator ? { label: "操作者", userId: operator } : null,
        ].filter(Boolean),
      })
      await sendToMasters(ctx, payload, { dedupeKey: key })
    } catch (err) {
      console.warn("[group] group decrease notify failed:", err?.message || err)
    }
    return false
  })

  // 群管理变动（群单独）
  bot.registerCommand(["", "notice.group.admin", 100], async ctx => {
    try {
      const groupId = toInt(ctx.group_id)
      if (!groupId) return false
      const gcfg = getGroupNoticeConfig(groupId)
      if (!gcfg.group_admin_change) return false

      const uid = ctx.user_id ?? ""
      const operator = ctx.operator_id ?? ""
      const isSet = ctx.is_set
      const key = `group_admin_change:${groupId}:${uid}:${ctx.time || ""}`
      const payload = await createSummaryNotice(ctx, {
        title: "[荨鹿通知][群管理变动]",
        groupId,
        users: [
          uid ? { label: "用户", userId: uid } : null,
          operator ? { label: "操作者", userId: operator } : null,
        ].filter(Boolean),
        lines: [isSet === true ? "变更：设置为管理员" : isSet === false ? "变更：取消管理员" : ""],
      })
      await sendToMasters(ctx, payload, { dedupeKey: key })
    } catch (err) {
      console.warn("[group] group admin notify failed:", err?.message || err)
    }
    return false
  })

  // Bot 被禁言（群单独）
  bot.registerCommand(["", "notice.group.ban", 100], async ctx => {
    try {
      const groupId = toInt(ctx.group_id)
      if (!groupId) return false

      const uid = toInt(ctx.user_id)
      const sid = toInt(ctx.self_id)
      if (!uid || !sid || uid !== sid) return false

      const gcfg = getGroupNoticeConfig(groupId)
      if (!gcfg.bot_muted) return false

      const operator = ctx.operator_id ?? ""
      const dur = ctx.duration ?? ""
      const key = `bot_muted:${groupId}:${sid}:${ctx.time || ""}`
      const payload = await createSummaryNotice(ctx, {
        title: "[荨鹿通知][Bot 被禁言]",
        groupId,
        users: [
          { label: "Bot", userId: sid, preferredName: "Bot" },
          operator ? { label: "操作者", userId: operator } : null,
        ].filter(Boolean),
        lines: [dur !== "" ? `时长：${dur} 秒` : ""],
      })
      await sendToMasters(ctx, payload, { dedupeKey: key })
    } catch (err) {
      console.warn("[group] bot muted notify failed:", err?.message || err)
    }
    return false
  })

  bot.registerCommand(["", "notice.group.allban", 100], async ctx => {
    try {
      const groupId = toInt(ctx.group_id)
      if (!groupId) return false

      const gcfg = getGroupNoticeConfig(groupId)
      if (!gcfg.bot_muted) return false

      const operator = ctx.operator_id ?? ""
      const enable = ctx.enable ?? ctx.is_mute
      const key = `group_allban:${groupId}:${String(enable)}:${ctx.time || ""}`
      const payload = await createSummaryNotice(ctx, {
        title: "[荨鹿通知][群全员禁言]",
        groupId,
        users: [operator ? { label: "操作者", userId: operator } : null].filter(Boolean),
        lines: [enable !== undefined ? `状态：${enable ? "开启" : "关闭"}` : ""],
      })
      await sendToMasters(ctx, payload, { dedupeKey: key })
    } catch (err) {
      console.warn("[group] allban notify failed:", err?.message || err)
    }
    return false
  })

  // ===================== 基础助手（主人） =====================
  bot.registerCommand(
    [
      "^(|#)发好友\\s+([1-9]\\d{3,12})\\s+(.+)$",
      { example: ["#发好友 10001 你好"], desc: "向指定好友发送消息（主人）" },
    ],
    async ctx => {
      if (!ctx.isMaster) return await ctx.reply("仅主人可用")
      const m = String(ctx.msg || "").match(/^(?:#)?发好友\s+([1-9]\d{3,12})\s+([\s\S]+)$/)
      if (!m) return false
      const user_id = toInt(m[1])
      const msg = String(m[2] || "").trim()
      if (!user_id || !msg) return await ctx.reply("用法：#发好友 QQ号 消息")
      if (typeof ctx.sendMessage === "function") await ctx.sendMessage(String(user_id), msg)
      else if (typeof ctx.pickUser === "function") await ctx.pickUser(user_id).sendMsg(msg)
      else throw new Error("send API not available")
      return await ctx.reply(`已发送：${user_id}`)
    },
  )

  bot.registerCommand(
    [
      "^(|#)发群聊\\s+(\\d+)\\s+(.+)$",
      { example: ["#发群聊 123 你好"], desc: "向指定群聊发送消息（主人）" },
    ],
    async ctx => {
      if (!ctx.isMaster) return await ctx.reply("仅主人可用")
      const m = String(ctx.msg || "").match(/^(?:#)?发群聊\s+(\d+)\s+([\s\S]+)$/)
      if (!m) return false
      const group_id = toInt(m[1])
      const msg = String(m[2] || "").trim()
      if (!group_id || !msg) return await ctx.reply("用法：#发群聊 群号 消息")
      await ctx.sendMessage({ group_id }, msg)
      return await ctx.reply(`已发送：${group_id}`)
    },
  )

  bot.registerCommand(
    [
      "^(|#)发群列表\\s+([0-9,，]+)\\s+(.+)$",
      { example: ["#发群列表 1,2,3 你好"], desc: "向多个群发送消息（主人）" },
    ],
    async ctx => {
      if (!ctx.isMaster) return await ctx.reply("仅主人可用")
      const m = String(ctx.msg || "").match(/^(?:#)?发群列表\s+([0-9,，]+)\s+([\s\S]+)$/)
      if (!m) return false
      const listRaw = String(m[1] || "").replace(/，/g, ",")
      const msg = String(m[2] || "").trim()
      const ids = listRaw
        .split(",")
        .map(s => toInt(s))
        .filter(Boolean)
      const uniq = Array.from(new Set(ids))
      if (!uniq.length || !msg) return await ctx.reply("用法：#发群列表 1,2,3 消息")

      const results = []
      for (const group_id of uniq) {
        try {
          await ctx.sendMessage({ group_id }, msg)
          results.push({ group_id, ok: true })
        } catch (err) {
          results.push({ group_id, ok: false, error: err?.message || String(err) })
        }
      }

      const okCount = results.filter(r => r.ok).length
      const fail = results.find(r => !r.ok)
      const failText = fail ? `，失败：${fail.group_id}（${fail.error || "未知错误"}）` : ""
      return await ctx.reply(`群发完成：成功 ${okCount}/${results.length}${failText}`)
    },
  )

  bot.registerCommand(
    ["^(|#)获取好友列表$", { example: ["#获取好友列表"], desc: "获取好友列表（主人）" }],
    async ctx => {
      if (!ctx.isMaster) return await ctx.reply("仅主人可用")
      const res = await ctx.getFriendList()
      const list = res instanceof Map ? Array.from(res.values()) : Array.isArray(res) ? res : []
      const shown = list.slice(0, 20)
      const lines = ["好友列表："]
      for (const f of shown) {
        const uid = f?.user_id ?? f?.id ?? ""
        const nick = f?.nickname ?? f?.remark ?? ""
        lines.push(`- ${nick || uid}(${uid})`)
      }
      if (list.length > shown.length) lines.push(`- ...(共 ${list.length} 个，已省略)`)
      return await ctx.reply(lines.join("\n").trim())
    },
  )

  bot.registerCommand(
    ["^(|#)获取群列表$", { example: ["#获取群列表"], desc: "获取群列表（主人）" }],
    async ctx => {
      if (!ctx.isMaster) return await ctx.reply("仅主人可用")
      const res = await ctx.getGroupList()
      const list = res instanceof Map ? Array.from(res.values()) : Array.isArray(res) ? res : []
      const shown = list.slice(0, 20)
      const lines = ["群列表："]
      for (const g of shown) {
        const gid = g?.group_id ?? g?.id ?? ""
        const name = g?.group_name ?? g?.name ?? ""
        lines.push(`- ${name || gid}(${gid})`)
      }
      if (list.length > shown.length) lines.push(`- ...(共 ${list.length} 个，已省略)`)
      return await ctx.reply(lines.join("\n").trim())
    },
  )

  bot.registerCommand(
    ["^(|#)退群\\s+(\\d+)$", { example: ["#退群 123"], desc: "让 Bot 退出群聊（主人）" }],
    async ctx => {
      if (!ctx.isMaster) return await ctx.reply("仅主人可用")
      const m = String(ctx.msg || "").match(/^(?:#)?退群\s+(\d+)$/)
      if (!m) return false
      const group_id = toInt(m[1])
      if (!group_id) return await ctx.reply("用法：#退群 群号")
      await ctx.quitGroup({ group_id })
      await cleanupGroupScopedPluginData(group_id, {
        reason: "quit-group-command",
      }).catch(err => {
        console.warn("[group] group-scope cleanup failed after quitGroup:", err?.message || err)
      })
      return await ctx.reply(`已尝试退群：${group_id}`)
    },
  )

  bot.registerCommand(
    [
      "^(|#)撤回$",
      { example: ["#撤回"], desc: "回复消息后撤回：主人可撤回他人；其他人仅可撤回 bot 消息" },
    ],
    async ctx => await handleRecallCommand(ctx, { missingReplyText: "请先回复需要撤回的消息，再发送：撤回" }),
  )

  bot.registerCommand(
    [
      "^(|#)设置日志等级\\s+(trace|debug|info|warn|fatal|mark|error|off)$",
      { example: ["#设置日志等级 debug"], desc: "设置 xunlu-core 日志等级（主人，重启生效）" },
    ],
    async ctx => {
      if (!ctx.isMaster) return await ctx.reply("仅主人可用")
      const m = String(ctx.msg || "").match(
        /设置日志等级\s+(trace|debug|info|warn|fatal|mark|error|off)/i,
      )
      const level = String(m?.[1] || "").toLowerCase()
      if (!level) return false
      cfg.setConfigValue("bot", "log_level", level)
      return await ctx.reply(`日志等级已设置为：${level}（重启生效）`)
    },
  )

  bot.registerCommand(
    [
      "^(|#)(查看头像|看头像)\\s+([1-9]\\d{3,12})$",
      { example: ["#查看头像 10001"], desc: "查看 QQ 头像（主人）" },
    ],
    async ctx => {
      if (!ctx.isMaster) return await ctx.reply("仅主人可用")
      const m = String(ctx.msg || "").match(/(查看头像|看头像)\s+([1-9]\d{3,12})/)
      const uid = toInt(m?.[2])
      if (!uid) return false
      const url = `https://q1.qlogo.cn/g?b=qq&nk=${uid}&s=100`
      return await ctx.reply({ type: "image", data: { url } })
    },
  )

  bot.registerCommand(
    [
      "^(|#)(查看群头像|看群头像)\\s+(\\d+)$",
      { example: ["#查看群头像 123"], desc: "查看群头像（主人）" },
    ],
    async ctx => {
      if (!ctx.isMaster) return await ctx.reply("仅主人可用")
      const m = String(ctx.msg || "").match(/(查看群头像|看群头像)\s+(\d+)/)
      const gid = toInt(m?.[2])
      if (!gid) return false
      const url = `https://p.qlogo.cn/gh/${gid}/${gid}/100`
      return await ctx.reply({ type: "image", data: { url } })
    },
  )

  // ===================== 群管（管理员/主人） =====================
  bot.registerCommand(
    ["^(|#)禁言\\s*.*$", { example: ["#禁言 @用户 60秒", "#禁言60秒"], desc: "禁言群成员（管理员/主人）" }],
    async ctx => {
      if (!ctx.group_id) return await ctx.reply("请在群内使用")
      if (!(await checkUserAdminOrMaster(ctx))) return await ctx.reply("需要管理员权限")
      if (!(await checkBotAdmin(ctx))) return await ctx.reply("Bot 需要管理员权限")

      const raw = String(ctx.msg || "")
        .replace(/^(#)?禁言/, "")
        .trim()
      const parts = raw.split(/\s+/).filter(Boolean)
      const target = toInt(ctx.at) ?? toInt(parts[0])
      const durText = ctx.at ? parts[0] || "" : parts[1] || ""
      const duration = parseDurationSeconds(durText)

      if (!target) return await ctx.reply("用法：#禁言 @用户 60秒")
      if (duration <= 0) return await ctx.reply("用法：#禁言 @用户 60秒（支持 秒/分/小时/天）")

      try {
        // 优先使用 ctx.setGroupMemberMute，如果不存在则使用 bot.setGroupMemberMute
        const muteFn = typeof ctx.setGroupMemberMute === "function"
          ? ctx.setGroupMemberMute.bind(ctx)
          : typeof bot.setGroupMemberMute === "function"
            ? bot.setGroupMemberMute.bind(bot)
            : null
        if (!muteFn) throw new Error("setGroupMemberMute API not available")
        await muteFn({ group_id: ctx.group_id, user_id: target, duration })
        return await ctx.reply(`已禁言：${target}（${duration} 秒）`)
      } catch (err) {
        console.error("[group] setGroupMemberMute failed:", err?.message || err)
        return await ctx.reply(`禁言失败：${err?.message || "未知错误"}`)
      }
    },
  )

  bot.registerCommand(
    ["^(|#)解禁\\s*.*$", { example: ["#解禁 @用户"], desc: "解除禁言（管理员/主人）" }],
    async ctx => {
      if (!ctx.group_id) return await ctx.reply("请在群内使用")
      if (!(await checkUserAdminOrMaster(ctx))) return await ctx.reply("需要管理员权限")
      if (!(await checkBotAdmin(ctx))) return await ctx.reply("Bot 需要管理员权限")

      const raw = String(ctx.msg || "")
        .replace(/^(#)?解禁/, "")
        .trim()
      const parts = raw.split(/\s+/).filter(Boolean)
      const target = toInt(ctx.at) ?? toInt(parts[0])
      if (!target) return await ctx.reply("用法：#解禁 @用户")

      try {
        // 优先使用 ctx.setGroupMemberMute，如果不存在则使用 bot.setGroupMemberMute
        const muteFn = typeof ctx.setGroupMemberMute === "function"
          ? ctx.setGroupMemberMute.bind(ctx)
          : typeof bot.setGroupMemberMute === "function"
            ? bot.setGroupMemberMute.bind(bot)
            : null
        if (!muteFn) throw new Error("setGroupMemberMute API not available")
        await muteFn({ group_id: ctx.group_id, user_id: target, duration: 0 })
        return await ctx.reply(`已解禁：${target}`)
      } catch (err) {
        console.error("[group] setGroupMemberMute (unmute) failed:", err?.message || err)
        return await ctx.reply(`解禁失败：${err?.message || "未知错误"}`)
      }
    },
  )

  bot.registerCommand(
    ["^(|#)全体禁言$", { example: ["#全体禁言"], desc: "全体禁言（管理员/主人）" }],
    async ctx => {
      if (!ctx.group_id) return await ctx.reply("请在群内使用")
      if (!(await checkUserAdminOrMaster(ctx))) return await ctx.reply("需要管理员权限")
      if (!(await checkBotAdmin(ctx))) return await ctx.reply("Bot 需要管理员权限")
      try {
        // 优先使用 ctx.setGroupWholeMute，如果不存在则使用 bot.setGroupWholeMute
        const muteAllFn = typeof ctx.setGroupWholeMute === "function"
          ? ctx.setGroupWholeMute.bind(ctx)
          : typeof bot.setGroupWholeMute === "function"
            ? bot.setGroupWholeMute.bind(bot)
            : null
        if (!muteAllFn) throw new Error("setGroupWholeMute API not available")
        await muteAllFn({ group_id: ctx.group_id, enable: true })
        return await ctx.reply("已尝试开启全体禁言")
      } catch (err) {
        console.error("[group] setGroupWholeMute (enable) failed:", err?.message || err)
        return await ctx.reply(`全体禁言失败：${err?.message || "未知错误"}`)
      }
    },
  )

  bot.registerCommand(
    ["^(|#)全体解禁$", { example: ["#全体解禁"], desc: "解除全体禁言（管理员/主人）" }],
    async ctx => {
      if (!ctx.group_id) return await ctx.reply("请在群内使用")
      if (!(await checkUserAdminOrMaster(ctx))) return await ctx.reply("需要管理员权限")
      if (!(await checkBotAdmin(ctx))) return await ctx.reply("Bot 需要管理员权限")
      try {
        // 优先使用 ctx.setGroupWholeMute，如果不存在则使用 bot.setGroupWholeMute
        const muteAllFn = typeof ctx.setGroupWholeMute === "function"
          ? ctx.setGroupWholeMute.bind(ctx)
          : typeof bot.setGroupWholeMute === "function"
            ? bot.setGroupWholeMute.bind(bot)
            : null
        if (!muteAllFn) throw new Error("setGroupWholeMute API not available")
        await muteAllFn({ group_id: ctx.group_id, enable: false })
        return await ctx.reply("已尝试解除全体禁言")
      } catch (err) {
        console.error("[group] setGroupWholeMute (disable) failed:", err?.message || err)
        return await ctx.reply(`解除全体禁言失败：${err?.message || "未知错误"}`)
      }
    },
  )

  bot.registerCommand(
    ["^(|#)踢黑\\s*.*$", { example: ["#踢黑 @用户"], desc: "踢出并拉黑（管理员/主人）" }],
    async ctx => {
      if (!ctx.group_id) return await ctx.reply("请在群内使用")
      if (!(await checkUserAdminOrMaster(ctx))) return await ctx.reply("需要管理员权限")
      if (!(await checkBotAdmin(ctx))) return await ctx.reply("Bot 需要管理员权限")

      const raw = String(ctx.msg || "")
        .replace(/^(#)?踢黑/, "")
        .trim()
      const parts = raw.split(/\s+/).filter(Boolean)
      const target = toInt(ctx.at) ?? toInt(parts[0])
      if (!target) return await ctx.reply("用法：#踢黑 @用户")

      try {
        // 优先使用 ctx.kickGroupMember，如果不存在则使用 bot.kickGroupMember
        const kickFn = typeof ctx.kickGroupMember === "function"
          ? ctx.kickGroupMember.bind(ctx)
          : typeof bot.kickGroupMember === "function"
            ? bot.kickGroupMember.bind(bot)
            : null
        if (!kickFn) throw new Error("kickGroupMember API not available")
        await kickFn({
          group_id: ctx.group_id,
          user_id: target,
          reject_add_request: true,
        })
        return await ctx.reply(`已尝试踢黑：${target}`)
      } catch (err) {
        console.error("[group] kickGroupMember (ban) failed:", err?.message || err)
        return await ctx.reply(`踢黑失败：${err?.message || "未知错误"}`)
      }
    },
  )

  bot.registerCommand(
    ["^(|#)踢\\s*.*$", { example: ["#踢 @用户"], desc: "踢出群成员（管理员/主人）" }],
    async ctx => {
      if (!ctx.group_id) return await ctx.reply("请在群内使用")
      if (!(await checkUserAdminOrMaster(ctx))) return await ctx.reply("需要管理员权限")
      if (!(await checkBotAdmin(ctx))) return await ctx.reply("Bot 需要管理员权限")

      const raw = String(ctx.msg || "")
        .replace(/^(#)?踢/, "")
        .trim()
      const parts = raw.split(/\s+/).filter(Boolean)
      const target = toInt(ctx.at) ?? toInt(parts[0])
      if (!target) return await ctx.reply("用法：#踢 @用户")

      try {
        // 优先使用 ctx.kickGroupMember，如果不存在则使用 bot.kickGroupMember
        const kickFn = typeof ctx.kickGroupMember === "function"
          ? ctx.kickGroupMember.bind(ctx)
          : typeof bot.kickGroupMember === "function"
            ? bot.kickGroupMember.bind(bot)
            : null
        if (!kickFn) throw new Error("kickGroupMember API not available")
        await kickFn({
          group_id: ctx.group_id,
          user_id: target,
          reject_add_request: false,
        })
        return await ctx.reply(`已尝试踢出：${target}`)
      } catch (err) {
        console.error("[group] kickGroupMember failed:", err?.message || err)
        return await ctx.reply(`踢出失败：${err?.message || "未知错误"}`)
      }
    },
  )

  bot.registerCommand(
    [
      "^(|#)设置管理\\s+.*$",
      { example: ["#设置管理 @用户"], desc: "设置群管理员（主人，Bot需群主）" },
    ],
    async ctx => {
      if (!ctx.isMaster) return await ctx.reply("仅主人可用")
      if (!ctx.group_id) return await ctx.reply("请在群内使用")
      if (!(await checkBotOwner(ctx))) return await ctx.reply("Bot 需要是群主才能设置管理")

      const raw = String(ctx.msg || "")
        .replace(/^(#)?设置管理/, "")
        .trim()
      const parts = raw.split(/\s+/).filter(Boolean)
      const target = toInt(ctx.at) ?? toInt(parts[0])
      if (!target) return await ctx.reply("用法：#设置管理 @用户")

      await ctx.setGroupMemberAdmin({ group_id: ctx.group_id, user_id: target, enable: true })
      return await ctx.reply(`已尝试设置管理：${target}`)
    },
  )

  bot.registerCommand(
    [
      "^(|#)取消管理\\s+.*$",
      { example: ["#取消管理 @用户"], desc: "取消群管理员（主人，Bot需群主）" },
    ],
    async ctx => {
      if (!ctx.isMaster) return await ctx.reply("仅主人可用")
      if (!ctx.group_id) return await ctx.reply("请在群内使用")
      if (!(await checkBotOwner(ctx))) return await ctx.reply("Bot 需要是群主才能取消管理")

      const raw = String(ctx.msg || "")
        .replace(/^(#)?取消管理/, "")
        .trim()
      const parts = raw.split(/\s+/).filter(Boolean)
      const target = toInt(ctx.at) ?? toInt(parts[0])
      if (!target) return await ctx.reply("用法：#取消管理 @用户")

      await ctx.setGroupMemberAdmin({ group_id: ctx.group_id, user_id: target, enable: false })
      return await ctx.reply(`已尝试取消管理：${target}`)
    },
  )

  bot.registerCommand(
    [
      "^(|#)修改头衔\\s+.*$",
      { example: ["#修改头衔 @用户 头衔"], desc: "修改群头衔（主人，Bot需群主）" },
    ],
    async ctx => {
      //if (!ctx.isMaster) return await ctx.reply("仅主人可用")
      if (!ctx.group_id) return await ctx.reply("请在群内使用")
      if (!(await checkBotOwner(ctx))) return await ctx.reply("Bot 需要是群主才能修改头衔")

      const raw = String(ctx.msg || "")
        .replace(/^(#)?修改头衔/, "")
        .trim()
      const parts = raw.split(/\s+/).filter(Boolean)
      let user_id = ctx.user_id
      let special_title = raw
      if (!ctx.isMaster && ctx.at) {
        if (ctx.at !== user_id) return await ctx.reply("非主人只能修改自己的头衔！")
      } else if (ctx.isMaster && ctx.at) {
        user_id = toInt(ctx.at) ?? toInt(parts[0])
        special_title = String(ctx.at ? raw : parts.slice(1).join(" ") || "").trim()

        if (!special_title) return await ctx.reply("用法：#修改头衔 @用户 头衔")
      }

      await ctx.setGroupMemberSpecialTitle({
        group_id: ctx.group_id,
        user_id,
        special_title,
      })
      return await ctx.reply(`已尝试修改头衔：${user_id}`)
    },
  )

  bot.registerCommand(
    ["^(|#)获取禁言列表$", { example: ["#获取禁言列表"], desc: "查看当前禁言成员（管理员/主人）" }],
    async ctx => {
      if (!ctx.group_id) return await ctx.reply("请在群内使用")
      if (!(await checkUserAdminOrMaster(ctx))) return await ctx.reply("需要管理员权限")

      const groupId = toInt(ctx.group_id)
      const nowSec = Math.floor(Date.now() / 1000)
      const res = await ctx.getGroupMemberList(groupId)
      const list = res instanceof Map ? Array.from(res.values()) : []

      const muted = []
      for (const m of list) {
        const end =
          toInt(m?.shut_up_end_time) ?? toInt(m?.shut_up_timestamp) ?? toInt(m?.shutup_time) ?? 0
        if (!end || end <= nowSec) continue
        muted.push({
          user_id: m?.user_id,
          nickname: m?.card || m?.nickname || "",
          end,
        })
      }

      if (!muted.length) return await ctx.reply("本群暂无禁言成员")

      muted.sort((a, b) => a.end - b.end)
      const shown = muted.slice(0, 20)
      const lines = ["禁言列表："]
      for (const m of shown) {
        const left = Math.max(0, m.end - nowSec)
        lines.push(`- ${m.nickname || m.user_id}(${m.user_id}) 剩余 ${left} 秒`)
      }
      if (muted.length > shown.length) lines.push(`- ...(共 ${muted.length} 个，已省略)`)
      return await ctx.reply(lines.join("\n").trim())
    },
  )

  bot.registerCommand(["", "request.group.add"], async ctx => {
    console.log("触发群申请可", ctx)

    const user_id = ctx.user_id
    let userInfo = await ctx.getUserInfo({ user_id })
    let passID = randomWithDigits(10)
    groupPass[passID] = {
      flag: ctx.flag,
      type: "join_request",
      group_id: ctx.group_id,
    }
    await ctx.reply([
      {
        type: "text",
        data: {
          text: `这个吊毛要进来了\n${userInfo.nickname}（${user_id}）\n临时通行证ID:${passID}`,
        },
      },
      {
        type: "image",
        data: {
          uri: `https://q1.qlogo.cn/g?b=qq&nk=${user_id}&s=100`,
        },
      },
      {
        type: "text",
        data: {
          text: ctx.comment,
        },
      },
    ])
  })
  bot.registerCommand(["(开门|关门)"], async ctx => {
    if (!ctx.group_id) return ctx.reply("请在群内使用")
    if (!(await checkUserAdminOrMaster(ctx))) return ctx.reply("需要管理员权限")

    const replied = await ctx.getReplyMessage?.()
    if (!replied) return ctx.reply("未获取到申请信息")

    const text = (replied.message || [])
      .filter(seg => seg?.type === "text")
      .map(seg => seg?.data?.content || seg?.data?.text || "")
      .join("")
    const rawText = `${text}\n${String(replied?.raw_message || replied?.data?.raw_message || "")}`.trim()
    const passID = rawText.match(/临时通行证ID[:：]\s*(\d{6,})/)?.[1]?.trim()
    if (!passID || !groupPass[passID]) return ctx.reply("未获取到申请信息")

    if (String(ctx.msg || "").trim() === "开门") {
      await ctx.acceptGroupRequest(groupPass[passID])
      delete groupPass[passID]
      return ctx.reply("已开门！")
    }

    await ctx.rejectGroupRequest(groupPass[passID])
    delete groupPass[passID]
    return ctx.reply("已经把这个家伙拒之门外了！")
  })
  bot.registerCommand(["", "notice.group.increase"], async ctx => {
    let userInfo = await ctx.getUserInfo({ user_id: ctx.user_id })
    void bot
      .callFnc("tts-plugin-1", {
        ...ctx,
        msg: `可莉说欢迎${userInfo.nickname || "不知名的家伙"}入群,要好好和大家相处哦！`,
      })
      .catch(err => console.warn("[group] callFnc tts failed:", err?.message || err))
  })
  bot.registerCommand(["", "notice.group.decrease"], async ctx => {
    if (toInt(ctx?.user_id) === toInt(ctx?.self_id)) {
      await cleanupGroupScopedPluginData(ctx?.group_id, {
        reason: "notice-group-decrease-self",
      }).catch(err => {
        console.warn("[group] cleanup failed after bot removed from group:", err?.message || err)
      })
      return false
    }
    console.log("减员的ctx", ctx)
    let userInfo = await ctx.getUserInfo({ user_id: ctx.user_id })
    ctx.reply(`把${userInfo.nickname || "不知名的家伙"}丢出群了！`)
  })
  bot.registerCommand(["保存群员信息"], async ctx => {
    const member_list = await ctx.getGroupMemberList(ctx.group_id)
    console.log(member_list)
    let msglist = []
    for (let [key, value] of member_list) {
      msglist.push([
        segment.image(`https://q1.qlogo.cn/g?b=qq&nk=${value.user_id}&s=100`),
        `昵称：${value.nickname}\n群名片：${value.card}\nQQ号：${value.user_id}\n等级：${value.level}\n加入时间:${moment(value.join_time * 1000).format("YYYY-MM-DD HH:mm:ss")}`,
      ])
    }
    let file = filemage.writeFileJsonData(`data/${ctx.group_id}.json`, msglist)

    await ctx.reply(segment.file(filemage.RootPath + `data/${ctx.group_id}.json`))
    return await ctx.reply(await ctx.makeGroupForwardMsg(ctx, msglist))
  })

  bot.registerCommand(["^今日发言记录$"], async ctx => {
    const targetUserId = ctx.at || ctx.user_id
    console.log(ctx)

    const rkeySuffix = String((await getSceneRkey("group"))?.value || "").trim()
    console.log("rkeysuffix:", rkeySuffix)

    let msgChat = await Bot.getGroupChatHistory(ctx.group_id)
    let msgList = msgChat
      .filter(item => item.user_id == targetUserId)
      .map(item => ({
        content: toForwardSafeSegments(item.message, { rkeySuffix }),
        time: item.time,
      }))
    console.log(msgList)
    if (msgList.length == 0) return ctx.reply(`今天${ctx.at ? "他" : "你"}还没有发言记录喽！`)

    await ctx.reply(await ctx.makeGroupForwardMsgByUser(targetUserId, msgList, "今日发言记录"))
  })

  bot.registerCommand(["^今日表情包$"], async ctx => {
    const targetUserId = ctx.at || ctx.user_id
    let msgChat = await Bot.getGroupChatHistory(ctx.group_id)
    const rkey = String((await getSceneRkey("group"))?.value || "").trim()
    const dealQQImgUrl = url => {
      if (!url) return ""
      return applyRkeyToUrl(url, rkey)
    }
    let msgList = msgChat
      .filter(item => item.user_id == targetUserId)
      .filter(item =>
        item.message.find(
          m => (m.type == "image" && m?.data?.summary != "[图片]") || m?.summary == "[图片]",
        ),
      )
      .map(item => ({
        content: item.message.map(m => ({
          ...m,
          file: dealQQImgUrl(m?.file || m?.data?.uri || m?.data?.temp_url),
        })),
        time: item.time,
      }))

    console.log(msgList)
    if (msgList.length == 0) return ctx.reply(`今天还没有人发过表情包哦！`)

    await ctx.reply(await ctx.makeGroupForwardMsgByUser(targetUserId, msgList, "今日发言记录"))
  })

  // bot.callFnc("test", { group_id: 434343, user_id: 232332 });
}

export function onBotEvent(event) {
  console.log("[example-plugin] received bot event:", event)
}

export const __test = {
  collectNoticeMessageSegmentCandidates,
  normalizeNoticeMessageSegments,
  normalizeForwardApiMessages,
  getForwardSegmentId,
  findStandaloneForwardSegment,
  buildNoticeForwardRelayPayload,
  isNoticeForwardRelayPayload,
  isDegradedForwardPlaceholderRecord,
  async buildNoticeForwardMsgList(ctx, payload) {
    return await buildNoticeForwardMsgList(ctx, payload)
  },
  async sendMasterPayload(ctx, uid, payload) {
    return await sendMasterPayload(ctx, uid, payload)
  },
  async getRecalledMessageSafe(ctx) {
    return await getRecalledMessageSafe(ctx)
  },
  async fetchRecalledMessageViaApi(ctx, ref) {
    return await fetchRecalledMessageViaApi(ctx, ref)
  },
  setGroupPass(id, value) {
    groupPass[String(id)] = value
  },
  clearGroupPass(id) {
    delete groupPass[String(id)]
  },
}




