/**
 * 把 selectDailyDigest() 的结果排版成「合并转发」的节点文本。
 * 只做纯字符串处理，方便离线单测；真正的转发封装在 controllers/handlers.js。
 */
import { SOURCE_SITE } from "./source.js"

function formatMonthDay(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${month}-${day}`
}

export function buildForwardTitle(date = new Date()) {
  return `AI 羊毛日报 · ${formatMonthDay(date)}`
}

function joinParts(parts, separator = " ｜ ") {
  return parts.filter(Boolean).join(separator)
}

function buildHeaderNode(digest) {
  const lines = [`「${buildForwardTitle(new Date(digest?.generatedAt || Date.now()))}」`]
  lines.push(
    joinParts([
      `当前可领 ${Number(digest?.totalClaimable || 0)} 项`,
      digest?.fallback
        ? `近期无新增（展示最近上架 ${Number(digest?.items?.length || 0)} 项）`
        : `近 ${Number(digest?.lookbackDays || 0)} 天新增 ${Number(digest?.freshCount || 0)} 项`,
    ]),
  )
  lines.push(`数据源：${SOURCE_SITE}（每条都附官方出处）`)
  return lines.join("\n")
}

function buildItemNode(item, index) {
  const lines = [`${index + 1}. ${item.title}`]

  const platformLine = `${item.platform ? `平台：${item.platform}` : ""}${
    item.platformType ? `（${item.platformType}）` : ""
  }`
  if (platformLine) lines.push(platformLine)

  const typeLine = joinParts([
    item.typeLabel ? `类型：${item.typeLabel}` : "",
    item.claimLabel ? `领取：${item.claimLabel}` : "",
  ])
  if (typeLine) lines.push(typeLine)

  if (item.requirementLabels?.length) lines.push(`条件：${item.requirementLabels.join("、")}`)

  const valueLine = joinParts([item.usdText, item.valueText], "｜")
  if (valueLine) lines.push(`价值：${valueLine}`)

  const timeLine = joinParts([item.deadlineText, item.startText])
  if (timeLine) lines.push(`期限：${timeLine}`)

  if (item.steps?.length) {
    lines.push(`步骤：${item.steps.map((step, i) => `${i + 1}) ${step}`).join("；")}`)
  }

  if (item.sourceUrl) lines.push(`出处：${item.sourceUrl}`)
  return lines.join("\n")
}

function buildEndingNode(digest) {
  const lines = [`⏳ ${Number(digest?.endingSoonDays || 0)} 天内截止`]
  for (const item of digest.ending) {
    lines.push(`· ${item.title} — ${item.deadlineText || "时间待确认"}`)
  }
  return lines.join("\n")
}

function buildFooterNode() {
  return [
    "说明",
    `· 数据来自第三方汇总站 ${SOURCE_SITE}，条目均可回溯官方出处`,
    "· 领取前请核对官方页面，谨防要求付费、交押金或提供账号密码的钓鱼站",
    "· 本群开关：#羊毛开启 / #羊毛关闭 ｜ 手动查看：#羊毛",
  ].join("\n")
}

export function buildDigestNodes(digest, { date = new Date() } = {}) {
  const nodes = [buildHeaderNode({ ...digest, generatedAt: digest?.generatedAt || date.getTime() })]

  for (const [index, item] of (digest?.items || []).entries()) {
    nodes.push(buildItemNode(item, index))
  }

  if (digest?.ending?.length) nodes.push(buildEndingNode(digest))
  nodes.push(buildFooterNode())
  return nodes
}

/** 转发失败时的文本降级：把节点拼成一条普通消息 */
export function buildDigestText(nodes) {
  const list = Array.isArray(nodes) ? nodes.filter(Boolean) : []
  return list.join("\n\n")
}

export function buildEmptyMessage(digest) {
  const generated = new Date(digest?.generatedAt || Date.now())
  return `今天还没抓到可领的羊毛（${formatMonthDay(generated)}）。\n数据源：${SOURCE_SITE}`
}
