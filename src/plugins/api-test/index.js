import definePlugin from "../define-plugin.js"
import { resolveProtocol, getRuntimeBotOrNull, toInt } from "../../Bot/api/universal-bot-api-utils.js"

function detectEnv(ctx) {
  const parts = []
  // platform
  const isYunzai = Boolean(typeof Bot !== "undefined" && Bot) || Boolean(globalThis.Bot)
  parts.push(isYunzai ? "平台: Yunzai" : "平台: Standalone")
  // protocol
  const protocol = resolveProtocol({ ctx, bot: ctx?.bot, runtimeBot: getRuntimeBotOrNull() })
  parts.push(`协议: ${protocol}`)
  // self_id
  const selfId = toInt(ctx?.self_id) ?? toInt(ctx?.bot?.uin) ?? ""
  if (selfId) parts.push(`Bot: ${selfId}`)
  // adapter info
  if (ctx?.bot?.adapter?.name) parts.push(`适配器: ${ctx.bot.adapter.name}`)
  else if (ctx?.bot?.adapter) parts.push(`适配器: ${String(ctx.bot.adapter)}`)
  // raw adapterType
  if (ctx?.adapterType) parts.push(`adapterType: ${ctx.adapterType}`)
  return parts.join(" | ")
}

const SAFE_APIS = [
  "getBot", "getLoginInfo", "getFriendList", "getGroupList",
  "listCommands", "listPlugins",
]

const UNSAFE_APIS = [
  "getFriendInfo", "getGroupInfo", "getUserInfo",
  "getGroupMemberList", "getGroupMemberInfo",
  "getGroupMemberRoleFlags", "isGroupOwner", "isGroupAdmin",
  "isBotGroupOwner", "isBotGroupAdmin",
]

async function safeCall(ctx, name, args = []) {
  const fn = typeof ctx.api?.[name] === "function" ? ctx.api[name] : typeof ctx[name] === "function" ? ctx[name] : null
  if (!fn) return { name, status: "SKIP", reason: "method not found on ctx" }
  try {
    const result = await fn.call(ctx.api || ctx, ...args)
    return { name, status: "OK", result: typeof result === "object" ? describe(result) : String(result) }
  } catch (err) {
    return { name, status: "ERR", reason: (err?.message || String(err)).slice(0, 200) }
  }
}

function describe(value, depth = 0) {
  if (depth > 2) return "[deep]"
  if (value === null || value === undefined) return String(value)
  if (typeof value === "string") return value.length > 80 ? value.slice(0, 80) + "..." : value
  if (typeof value !== "object") return String(value)
  if (value instanceof Map) return `Map(${value.size})`
  if (value instanceof Set) return `Set(${value.size})`
  if (Array.isArray(value)) return `[${value.length}] ${value.slice(0, 3).map(v => describe(v, depth + 1)).join(", ")}${value.length > 3 ? "..." : ""}`
  const keys = Object.keys(value)
  if (keys.length === 0) return "{}"
  const pairs = keys.slice(0, 4).map(k => `${k}: ${describe(value[k], depth + 1)}`)
  return `{ ${pairs.join(", ")}${keys.length > 4 ? ", ..." : ""} }`
}

function formatResult(r, idx) {
  const icon = r.status === "OK" ? "✓" : r.status === "SKIP" ? "―" : "✗"
  let line = `${idx}. ${icon} ${r.name}`
  if (r.status === "OK" && r.result) line += ` → ${r.result}`
  if (r.status === "ERR") line += ` → ${r.reason}`
  if (r.status === "SKIP" && r.reason) line += ` (${r.reason})`
  return line
}

export default definePlugin({
  name: "api-test",
  title: "API 兼容测试",
  shortName: "API测试",
  aliases: ["API测试", "测试API", "api兼容测试"],
  register(botApi) {
    if (!botApi?.registerCommand) return

    botApi.registerCommand(
      ["^[#]?(api测试|测试api|兼容测试)$", 2000, {
        example: ["#api测试", "#兼容测试"],
        desc: "遍历测试所有通用 API 并返回转发消息",
      }],
      async ctx => {
        const groupId = ctx?.group_id
        if (!groupId) return await ctx.reply("请在群聊中使用")

        const envInfo = detectEnv(ctx)
        const results = [{ name: "env", status: "OK", result: envInfo }]

        for (const name of SAFE_APIS) {
          const r = await safeCall(ctx, name)
          results.push(r)
        }

        for (const name of UNSAFE_APIS) {
          let args = []
          if (name === "getGroupInfo" || name === "getGroupMemberList" || name === "getGroupMemberRoleFlags" || name === "isGroupOwner" || name === "isGroupAdmin" || name === "isBotGroupOwner" || name === "isBotGroupAdmin") {
            args = [groupId]
          }
          if (name === "getGroupMemberInfo" || name === "getFriendInfo" || name === "getUserInfo") {
            args = [groupId, ctx?.user_id]
          }
          const r = await safeCall(ctx, name, args)
          results.push(r)
        }

        // sendProfileLike: test with current user
        {
          const r = await safeCall(ctx, "sendProfileLike", [{ user_id: ctx.user_id, times: 1 }])
          results.push(r)
        }

        // pickUser / pickGroup
        {
          const r1 = await safeCall(ctx, "pickUser", [ctx.user_id])
          results.push(r1)
          const r2 = await safeCall(ctx, "pickGroup", [groupId])
          results.push(r2)
        }

        const lines = results.map(formatResult)
        const pass = results.filter(r => r.status === "OK").length
        const fail = results.filter(r => r.status === "ERR").length
        const skip = results.filter(r => r.status === "SKIP").length
        const summary = `API 测试完成：${pass} 通过 / ${fail} 失败 / ${skip} 跳过（共 ${results.length} 项）`

        const nodes = []
        nodes.push({ user_id: ctx.self_id, nickname: "API测试", content: summary })
        for (let i = 0; i < lines.length; i += 10) {
          nodes.push({ user_id: ctx.self_id, nickname: "API测试", content: lines.slice(i, i + 10).join("\n") })
        }

        try {
          const forward = await ctx.makeGroupForwardMsg(ctx, nodes, summary)
          return await ctx.reply(forward)
        } catch {
          return await ctx.reply(lines.join("\n"))
        }
      },
    )
  },
})
