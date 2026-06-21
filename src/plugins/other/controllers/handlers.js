import lodash from "lodash"
import { segment } from "../../../Bot/message/index.js"
import cfg from "../../../lib/config.js"
import {
  disableUserReaction,
  getUserReactionConfig,
  setUserReactionConfig,
} from "../model/reaction-store.js"
import { handleRecallCommand } from "../../shared/recall-command.js"

// 记录各协议是否支持 reaction，避免“API not available”刷屏
const reactionApiSupport = new Map()

function toInt(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.floor(n) : undefined
}

function findFaceIdsFromCtx(ctx) {
  const segments = Array.isArray(ctx?.message) ? ctx.message : []
  const ids = []
  for (const seg of segments) {
    if (!seg || typeof seg !== "object") continue
    const type = String(seg.type || "")
    if (type !== "face") continue

    const data = seg.data && typeof seg.data === "object" ? seg.data : {}
    const faceId = toInt(data.id ?? data.face_id ?? data.faceId ?? seg.id)
    if (faceId !== undefined) ids.push(faceId)
  }
  return ids
}

function parseFaceIdsFromText(text) {
  const s = String(text || "")
  const out = []
  const re = /(\d{1,6})/g
  let m
  while ((m = re.exec(s)) !== null) {
    const id = toInt(m[1])
    if (id !== undefined) out.push(id)
  }
  return out
}

function parseEmojiIdsFromText(text) {
  const s = String(text || "").trim()
  if (!s) return []

  const out = []
  try {
    // 提取全部 emoji（常用表情如 😭😂👍 等均可匹配）
    const re = /\p{Extended_Pictographic}/gu
    const list = s.match(re) || []
    for (const ch of list) {
      const cp = ch.codePointAt(0)
      const id = cp !== undefined ? toInt(cp) : undefined
      if (id !== undefined) out.push(id)
    }
  } catch {
    // 兼容：若运行环境不支持 Unicode 属性转义，则忽略
  }

  return out
}

function isReactionConfigCommand(msg) {
  const s = String(msg || "").trim()
  return (
    /^(?:[#＃])?表情回应/.test(s) ||
    /^(?:[#＃])?关闭表情回应$/.test(s) ||
    /^(?:[#＃])?贴表情(?:开启|关闭)$/.test(s)
  )
}

function resolveReactionForCtx(ctx) {
  const uid = ctx?.user_id
  const stored = getUserReactionConfig(uid)

  // master default enabled
  const defaultEnabled = Boolean(ctx?.isMaster)
  const defaultReactions = [277]

  const enabled = stored ? Boolean(stored.enabled) : defaultEnabled
  const reactionsRaw = stored?.reactions ?? (stored?.reaction !== undefined ? [stored.reaction] : defaultReactions)
  const reactions = (Array.isArray(reactionsRaw) ? reactionsRaw : [reactionsRaw])
    .map(toInt)
    .filter(v => v !== undefined)

  return {
    enabled,
    reactions,
    hasStored: Boolean(stored),
  }
}

function uniqueReactionItems(items = [], max = 10) {
  const seen = new Set()
  const out = []
  for (const it of items) {
    const id = toInt(it?.id)
    if (id === undefined) continue
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ id, kind: it?.kind || "face" })
    if (out.length >= max) break
  }
  return out
}

function formatReactionDisplay(item) {
  const id = toInt(item?.id)
  if (id === undefined) return ""
  if (item?.kind === "emoji") {
    try {
      return String.fromCodePoint(id)
    } catch {
      return `[face:${id}]`
    }
  }
  return `[face:${id}]`
}

function extractTextFromCtx(ctx) {
  const segments = Array.isArray(ctx?.message) ? ctx.message : []
  const text = segments
    .filter(seg => seg && typeof seg === "object" && String(seg.type || "") === "text")
    .map(seg => {
      const data = seg.data && typeof seg.data === "object" ? seg.data : {}
      return String(data.text ?? data.content ?? seg.text ?? "")
    })
    .join("")
    .trim()

  if (text) return text
  return String(ctx?.raw_message ?? ctx?.msg ?? "").trim()
}

function resolveMessageReactionItems(ctx) {
  const emojiItems = parseEmojiIdsFromText(extractTextFromCtx(ctx)).map(id => ({
    id,
    kind: "emoji",
  }))
  const faceItems = findFaceIdsFromCtx(ctx).map(id => ({ id, kind: "face" }))
  return uniqueReactionItems([...emojiItems, ...faceItems], 10)
}

function isMessageEmojiReactionEnabled() {
  return cfg.getConfig("bot")?.message_emoji_reaction_enabled !== false
}

function setMessageEmojiReactionEnabled(enabled) {
  cfg.getConfigReader("bot").set("message_emoji_reaction_enabled", Boolean(enabled))
  return isMessageEmojiReactionEnabled()
}

export function register(bot) {
  if (!bot || !bot.registerCommand) return
  //第一个参数是数组第一个是命令，第二个是事件,如果是其他事件就是事件列表中的事件名称，第二个是方法，第三个是下文函数
  bot.registerCommand(["", 1000, { key: "auto-reaction" }], async ctx => {
    // 仅群消息可用 reaction
    if (!ctx?.isGroup || !ctx?.group_id) return false
    if (!ctx?.message_id && ctx?.seq === undefined && ctx?.message_seq === undefined) return false

    // 跳过配置命令本身（避免对设置消息也回应）
    if (isReactionConfigCommand(ctx?.msg)) return false

    const messageReactionItems = isMessageEmojiReactionEnabled() ? resolveMessageReactionItems(ctx) : []
    const messageReactions = messageReactionItems.map(item => item.id)

    const { enabled, reactions } = resolveReactionForCtx(ctx)
    const reactionsToSend = messageReactions.length
      ? messageReactions
      : enabled
        ? reactions
        : []
    if (!Array.isArray(reactionsToSend) || reactionsToSend.length === 0) return false

    const proto = String(ctx?.protocol || "")
    if (reactionApiSupport.get(proto) === false) return false

    // 不阻塞后续命令：后台执行
    void (async () => {
      for (const reaction of reactionsToSend) {
        try {
          await ctx.sendGroupMessageReaction({
            group_id: ctx.group_id,
            message_id: ctx?.message_id,
            message_seq: ctx?.seq ?? ctx?.message_seq,
            reaction,
          })
          if (proto) reactionApiSupport.set(proto, true)
        } catch (error) {
          const msg = error?.message || String(error)
          if (proto && /\bAPI not available\b/i.test(msg)) {
            reactionApiSupport.set(proto, false)
            console.warn("[other] sendGroupMessageReaction not available for protocol:", proto)
            break
          } else {
            console.warn("[other] sendGroupMessageReaction failed:", msg)
          }
        }
      }
    })()

    return false
  })

  // #表情回应<face>：开启并设置当前用户的消息表情回应
  bot.registerCommand(
    [
      "^(?:[#＃])?表情回应(\\s*.*)?$",
      1000,
      {
        key: "set-reaction",
        example: ["#表情回应277", "#表情回应 277 233", "#表情回应😭😂"],
        desc: "开启当前用户的消息表情回应并设置表情（可多个）",
      },
    ],
    async ctx => {
      const raw = String(ctx?.msg || "")
      const rest = raw.replace(/^(?:[#＃])?表情回应/, "").trim()

      const faceIdsText = parseFaceIdsFromText(rest).map(id => ({ id, kind: "face" }))
      const emojiIdsText = parseEmojiIdsFromText(rest).map(id => ({ id, kind: "emoji" }))
      const faceIdsSeg = findFaceIdsFromCtx(ctx).map(id => ({ id, kind: "face" }))

      const picked = uniqueReactionItems([...faceIdsText, ...emojiIdsText, ...faceIdsSeg], 10)
      const reactions = picked.map(i => i.id)

      if (!reactions.length) {
        return await ctx.reply("用法：#表情回应277 / #表情回应 277 233 / #表情回应😭😂（或：#表情回应 后跟表情）")
      }

      setUserReactionConfig(ctx?.user_id, { enabled: true, reactions })

      const display = picked.map(formatReactionDisplay).filter(Boolean).join(" ")
      return await ctx.reply(`已开启表情回应：${display}（仅对你生效）`)
    },
  )

  // #关闭表情回应：关闭当前用户
  bot.registerCommand(
    ["^(?:[#＃])?关闭表情回应$", 1000, { key: "disable-reaction", example: "#关闭表情回应", desc: "关闭当前用户的消息表情回应" }],
    async ctx => {
      disableUserReaction(ctx?.user_id)
      return await ctx.reply("已关闭表情回应（仅对你生效）")
    },
  )

  bot.registerCommand(
    [
      "^(?:[#＃])?贴表情(开启|关闭)$",
      1000,
      {
        key: "toggle-reaction-global",
        example: ["#贴表情开启", "#贴表情关闭"],
        desc: "开启或关闭全局消息自动贴表情",
      },
    ],
    async ctx => {
      if (!ctx?.isMaster) {
        return await ctx.reply("只有主人才能设置全局贴表情开关")
      }

      const matched = String(ctx?.msg || "").match(/贴表情(开启|关闭)$/)
      const enabled = matched?.[1] === "开启"
      const current = setMessageEmojiReactionEnabled(enabled)
      return await ctx.reply(`已${current ? "开启" : "关闭"}全局贴表情`)
    },
  )

  bot.registerCommand(["^测试转发$", 1000, { key: "test-forward" }], async ctx => {
    return ctx.reply(
      await ctx.makeGroupForwardMsg(
        ctx,
        [
          "测试转发",
          segment.image(
            "https://i0.hdslb.com/bfs/new_dyn/175aec36475e338175d4eada76cf264b456081437.jpg",
          ),
        ],
        "测试转发",
      ),
    )
  })

  bot.registerCommand(["一会做什么", 1000, { key: "what-next" }], async ctx => {
    console.log("被调用的ctx", ctx)

    if (ctx.isMaster) {
      let rlist = ["重构项目", "打原神", "看小说", "学习"]
      ctx.reply(rlist[lodash.random(0, rlist.length - 1)])
    }
  })

  bot.registerCommand(["^调用$", 1000, { key: "call-tts" }], async ctx => {
    if (ctx.isMaster) {
      ctx.reply("我将会调用语音合成发送：可莉说你是个几把")
      void bot
        .callFnc("tts-plugin-1", { ...ctx, msg: "可莉说你是个几把" })
        .catch(err => console.warn("[other] callFnc tts failed:", err?.message || err))
    }
  })

  bot.registerCommand(["^测试撤回$", 1000, { key: "test-recall" }], async ctx => {
    if (ctx.isMaster) {
      return await ctx.reply(
        await ctx.makeGroupForwardMsg(ctx, ["测试撤回", "消息二"], "测试撤回"),
        false,
        {
          recallMsg: 30,
        },
      )
    }
  })

  bot.registerCommand(["^测试群员$", 1000, { key: "test-members" }], async ctx => {
    const member_list = await Bot.getGroupMemberList(ctx.group_id)
    const member_list2 = await ctx.getGroupMemberList(ctx.group_id)
    console.log("ce1:", member_list)
    console.log("ce2:", member_list2)
  })

  bot.registerCommand(["取直链", 1000, { key: "get-direct-link" }], async ctx => {
    const replied = await ctx.getReplyMessage?.()
    if (!replied) return ctx.reply("请回复需要取直链的消息")

    const msglist = Array.isArray(replied.message) ? replied.message : []
    const imageSeg = msglist.find(i => i?.type === "image")
    const url = imageSeg?.data?.url

    if (!url) return ctx.reply("该消息没有图片")
    return ctx.reply([segment.image(url), url])
  })

  // 引用撤回：回复一条消息并发送“引用撤回”，机器人尝试撤回被引用的那条消息（需要权限）
  bot.registerCommand(["^(引用撤回|#?撤回)$", 1000, { key: "recall-quote" }], async ctx => {
    const normalizedCommand = String(ctx?.msg ?? "").trim()
    if (normalizedCommand === "撤回") {
      return false
    }
    return await handleRecallCommand(ctx)
  })
}
