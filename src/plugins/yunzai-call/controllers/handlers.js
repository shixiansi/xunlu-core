import { invokeYunzaiCommandByText } from "../../../Bot/yunzai/command-bridge.js"

function extractTargetCommand(ctx) {
  const raw = String(ctx?.msg || ctx?.raw_message || "").trim()
  return raw.replace(/^#?调用/, "").trim()
}

function buildReplyMessage(target, result) {
  switch (result?.reason) {
    case "unavailable":
      return "当前不是云崽环境，无法调用云崽原生指令"
    case "guild-message":
      return "当前场景不支持调用云崽原生指令"
    case "cooldown":
      return `指令当前处于冷却或重复触发保护中：${target}`
    case "blacklist":
      return "当前账号或群聊被云崽的黑白名单限制，无法调用该指令"
    case "no-plugin":
    case "no-match":
    case "no-reg-match":
      return `没有匹配到可执行的云崽指令：${target}`
    default:
      return `调用云崽指令失败：${target}`
  }
}

export function register(bot) {
  if (!bot || typeof bot.registerCommand !== "function") return

  bot.registerCommand(
    [
      "^(#)?调用(\\s*.+)?$",
      900,
      {
        example: ["调用 #帮助", "#调用 #原神帮助", "调用 #面板"],
        desc: "把后面的文本当作云崽原生指令重新匹配并触发",
        trackUsage: false,
      },
    ],
    async ctx => {
      const target = extractTargetCommand(ctx)
      if (!target) {
        return await ctx.reply("用法：调用 <云崽指令>\n例如：调用 #帮助")
      }

      const result = await invokeYunzaiCommandByText(target, ctx, {
        skipOnlyReplyAt: true,
      }).catch(error => ({
        reason: "error",
        error,
      }))

      if (result?.handled && result?.blocked && result?.reason === "permission-denied") {
        return true
      }
      if (result?.ok) {
        return true
      }

      if (result?.error) {
        console.warn("[yunzai-call] invoke failed:", result.error?.message || result.error)
      }
      return await ctx.reply(buildReplyMessage(target, result))
    },
  )
}

export function onBotEvent(event) {
  void event
}
