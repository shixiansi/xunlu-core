import {
  addBlacklistDomain,
  listBlacklist,
  removeBlacklistDomain,
} from "../model/store.js"
import {
  scanCtxForLinksWithSource,
  scanHtmlSource,
  scanTextForLinksWithSource,
} from "../model/detector.js"

const recentWarnCache = new Map()
const WARN_TTL_MS = 2 * 60 * 1000

function cleanupRecentWarnCache(now = Date.now()) {
  for (const [key, expireAt] of recentWarnCache.entries()) {
    if (Number(expireAt || 0) <= now) recentWarnCache.delete(key)
  }
}

function makeWarnKey(ctx, result) {
  const groupId = String(ctx?.group_id || ctx?.groupId || "private")
  const domain = String(result?.matchedDomain || result?.domain || "")
  return `${groupId}:${domain}`
}

function shouldWarn(ctx, result) {
  const now = Date.now()
  cleanupRecentWarnCache(now)
  const key = makeWarnKey(ctx, result)
  const expireAt = Number(recentWarnCache.get(key) || 0)
  if (expireAt > now) return false
  recentWarnCache.set(key, now + WARN_TTL_MS)
  return true
}

function formatResultLine(item) {
  const domain = String(item?.matchedDomain || item?.domain || "未知域名")
  const reasons = Array.isArray(item?.reasons) ? item.reasons.filter(Boolean) : []
  const score = Number(item?.score || 0)
  const scoreText = score > 0 ? ` [风险分:${score}]` : ""
  const fetchState = item?.sourceFetched
    ? " [已抓源码]"
    : item?.sourceMeta?.error
      ? ` [未抓源码:${String(item.sourceMeta.error)}]`
      : ""
  if (!reasons.length) return `${domain}${scoreText}${fetchState}`
  return `${domain}${scoreText}${fetchState}：${reasons.join("；")}`
}

function extractCommandArg(ctx, prefixRegExp) {
  const raw = String(ctx?.msg || "").trim()
  return raw.replace(prefixRegExp, "").trim()
}

function formatHtmlScanResult(result) {
  const score = Number(result?.score || 0)
  const levelMap = {
    clean: "低风险",
    suspicious: "可疑",
    "high-risk": "高危",
  }
  const lines = [
    `源码检测结果：${levelMap[result?.level] || result?.level || "未知"}`,
    `风险分：${score}`,
    `${result?.summary || ""}`,
  ].filter(Boolean)

  const hits = Array.isArray(result?.hits) ? result.hits : []
  if (hits.length) {
    lines.push("命中特征：")
    for (const item of hits) {
      lines.push(`- ${item.reason} (+${Number(item?.score || 0)})`)
    }
  }

  return lines.join("\n")
}

async function handleScanMessage(ctx) {
  const results = await scanCtxForLinksWithSource(ctx)
  const risky = results.filter(item => item.level === "malicious" || item.level === "suspicious")
  if (!risky.length) return false

  const shouldSend = risky.some(item => item.level === "malicious" || shouldWarn(ctx, item))
  if (!shouldSend) return false

  const malicious = risky.filter(item => item.level === "malicious")
  const suspicious = risky.filter(item => item.level === "suspicious")
  const lines = ["检测到风险链接，请勿点击。"]

  if (malicious.length) {
    lines.push("")
    lines.push("恶意网址：")
    for (const item of malicious.slice(0, 5)) lines.push(`- ${formatResultLine(item)}`)
  }

  if (suspicious.length) {
    lines.push("")
    lines.push("可疑网址：")
    for (const item of suspicious.slice(0, 5)) lines.push(`- ${formatResultLine(item)}`)
  }

  return await ctx.reply(lines.join("\n"))
}

export function register(bot) {
  if (!bot || typeof bot.registerCommand !== "function") return

  bot.registerCommand(["", 1000], async ctx => {
    if (!ctx?.msg && !ctx?.raw_message && !Array.isArray(ctx?.message)) return false
    return await handleScanMessage(ctx)
  })

  bot.registerCommand(
    [
      "^[#＃]恶意网址检测\\s+(.+)$",
      {
        example: ["#恶意网址检测 https://example.com/"],
        desc: "手动检测一段链接文本是否命中恶意网址规则",
      },
    ],
    async ctx => {
      const text = extractCommandArg(ctx, /^[#＃]恶意网址检测\s*/)
      const results = await scanTextForLinksWithSource(text)
      if (!results.length) return await ctx.reply("没有识别到可检测的网址")

      const risky = results.filter(item => item.level !== "clean")
      if (!risky.length) return await ctx.reply("未命中恶意网址规则，也没有发现明显可疑特征")

      const lines = ["检测结果："]
      for (const item of risky) {
        const label = item.level === "malicious" ? "恶意" : "可疑"
        lines.push(`- ${label}：${formatResultLine(item)}`)
      }
      return await ctx.reply(lines.join("\n"))
    },
  )

  bot.registerCommand(
    [
      "^[#＃]恶意源码检测[\\s\\S]+$",
      {
        example: ["#恶意源码检测 <!DOCTYPE html>..."],
        desc: "手动检测 HTML/JS 源码片段中的风险特征",
      },
    ],
    async ctx => {
      const source = extractCommandArg(ctx, /^[#＃]恶意源码检测\s*/)
      if (!source) return await ctx.reply("请在命令后附上要检测的 HTML/JS 源码片段")
      const result = scanHtmlSource(source)
      return await ctx.reply(formatHtmlScanResult(result))
    },
  )

  bot.registerCommand(
    [
      "^[#＃]恶意网址添加\\s+(.+)$",
      {
        example: ["#恶意网址添加 example.com", "#恶意网址添加 https://abc.example.com/path"],
        desc: "添加恶意域名黑名单",
      },
    ],
    async ctx => {
      if (!ctx?.isMaster) return await ctx.reply("只有主人才能添加恶意网址黑名单")
      const domain = extractCommandArg(ctx, /^[#＃]恶意网址添加\s*/)
      const added = addBlacklistDomain(domain, "主人手动添加")
      if (!added) return await ctx.reply("添加失败：请提供有效域名或链接")
      return await ctx.reply(`已加入恶意网址黑名单：${added}`)
    },
  )

  bot.registerCommand(
    [
      "^[#＃]恶意网址删除\\s+(.+)$",
      {
        example: ["#恶意网址删除 example.com"],
        desc: "移除恶意域名黑名单",
      },
    ],
    async ctx => {
      if (!ctx?.isMaster) return await ctx.reply("只有主人才能删除恶意网址黑名单")
      const domain = extractCommandArg(ctx, /^[#＃]恶意网址删除\s*/)
      const removed = removeBlacklistDomain(domain)
      if (!removed) return await ctx.reply("未找到这个恶意网址域名")
      return await ctx.reply(`已移除恶意网址黑名单：${domain}`)
    },
  )

  bot.registerCommand(
    [
      "^[#＃]恶意网址列表$",
      {
        example: ["#恶意网址列表"],
        desc: "查看当前恶意域名黑名单",
      },
    ],
    async ctx => {
      const list = listBlacklist()
      if (!list.length) return await ctx.reply("当前没有恶意网址黑名单")

      const lines = ["当前恶意网址黑名单："]
      for (const item of list.slice(0, 50)) {
        const source = item.source === "builtin" ? "内置" : "手动"
        lines.push(`- ${item.domain} (${source}${item.reason ? `，${item.reason}` : ""})`)
      }
      return await ctx.reply(lines.join("\n"))
    },
  )
}

export function onBotEvent(event) {
  void event
}
