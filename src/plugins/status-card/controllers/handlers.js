import { getStatusCardConfig } from "../model/config.js"
import { buildStatusCardPayload, prepareStatusCardRenderData } from "../services/status-service.js"

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function buildCommandPattern(aliases = []) {
  const list = Array.isArray(aliases) ? aliases.map(alias => String(alias || "").trim()).filter(Boolean) : []
  if (!list.length) return "^系统状态$"
  return `^(?:${list.map(escapeRegExp).join("|")})$`
}

export async function handleStatusCardCommand(ctx) {
  const config = getStatusCardConfig()
  const payload = await buildStatusCardPayload(ctx, config)
  const fallbackText = payload?.fallbackText || "状态卡片生成失败"
  const renderData = {
    ...(await prepareStatusCardRenderData(payload.data)),
    renderReadyTimeout: 15000,
  }

  try {
    if (typeof ctx?.renderImg === "function") {
      const img = await ctx.renderImg("status-card", renderData, { tpl: "status" })
      if (img) return await ctx.reply(img)
    }
  } catch (error) {
    console.error("[status-card] render error:", error?.stack || error?.message || String(error))
  }

  return await ctx.reply(fallbackText)
}

export function register(bot) {
  if (!bot || typeof bot.registerCommand !== "function") return

  const config = getStatusCardConfig()
  const aliases = config.commands.aliases
  bot.registerCommand(
    [
      buildCommandPattern(aliases),
      "message",
      5000,
      {
        example: aliases.slice(0, 3),
        desc: "生成暖色二次元状态卡片，展示系统与机器人运行信息",
      },
    ],
    async ctx => await handleStatusCardCommand(ctx),
  )
}

export function onBotEvent(event) {
  void event
}
