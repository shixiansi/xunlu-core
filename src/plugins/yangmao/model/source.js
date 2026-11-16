/**
 * 数据源：ai-yangmao.com 的公开 JSON 接口。
 *
 * - /api/offers：全部羊毛条目（含条件、步骤、官方出处）
 * - /api/platforms：平台字典，用于把 platformId 翻译成可读名称
 *
 * 本模块只做「抓取 + 归一化 + 筛选」，不做任何消息排版（排版见 report.js）。
 */
const DAY_MS = 24 * 60 * 60 * 1000

export const SOURCE_SITE = "https://ai-yangmao.com"
export const SOURCE_NAME = "AI 羊毛牧场"
const OFFERS_PATH = "/api/offers?view=all"
const PLATFORMS_PATH = "/api/platforms"

const TYPE_LABELS = Object.freeze({
  new: "注册新人礼",
  trial: "应用尝鲜",
  free: "限时免费开放",
  perk: "会员福利",
  topup: "充值赠送",
  gift: "会员免费送",
  standing: "常驻免费额度",
  apply: "申请制",
})

const CLAIM_LABELS = Object.freeze({
  auto: "自动到账",
  signup: "注册即送",
  app: "下载应用并登录",
  form: "邮件或表单申请",
  topup: "充值触发",
  member: "会员自动生效",
  code: "兑换码",
})

const REQUIREMENT_LABELS = Object.freeze({
  none: "零门槛",
  unknown: "领取条件待确认",
  pay: "需充值",
  member: "需会员",
  phone: "需海外手机号",
  card: "需海外信用卡",
  net: "需海外网络",
  realname: "需实名",
  biz: "需企业认证",
  student: "需学生认证",
  invite: "需邀请码",
  targeted: "定向发放",
})

const MODALITY_LABELS = Object.freeze({
  text: "文本",
  image: "图像",
  video: "视频",
  audio: "音频",
})

const PLATFORM_TYPE_LABELS = Object.freeze({
  lab: "模型厂商",
  cloud: "云厂商",
  infra: "推理平台",
  tool: "AI 工具",
  new: "新玩家",
})

const AUDIENCE_LABELS = Object.freeze({
  new: "新用户",
  old: "老用户",
  all: "全部用户",
  unclear: "资格未明确",
})

/** 仍然可以领取的状态；ended=已结束，upcoming=未开始 */
const CLAIMABLE_STATUS = new Set(["active", "standing", "open"])

function toTimestamp(value) {
  if (!value) return 0
  const ts = Date.parse(String(value))
  return Number.isFinite(ts) ? ts : 0
}

function collapseWhitespace(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
}

export function truncateText(text, max = 100) {
  const flat = collapseWhitespace(text)
  if (!flat) return ""
  if (flat.length <= max) return flat
  return `${flat.slice(0, Math.max(1, max - 1)).trimEnd()}…`
}

function labelOf(map, key) {
  const text = String(key || "").trim()
  if (!text) return ""
  return map[text] || text
}

function labelListOf(map, keys, max = 3) {
  const list = Array.isArray(keys) ? keys : []
  const out = []
  for (const key of list) {
    const label = labelOf(map, key)
    if (label && !out.includes(label)) out.push(label)
    if (out.length >= max) break
  }
  return out
}

/** 领取条件只保留已知枚举，避免把上游的内部标记（如 member:xxx）直接丢给用户 */
function requirementLabels(keys, max = 3) {
  const list = Array.isArray(keys) ? keys : []
  const out = []
  for (const key of list) {
    const label = REQUIREMENT_LABELS[String(key || "").trim()]
    if (label && !out.includes(label)) out.push(label)
    if (out.length >= max) break
  }
  if (!out.length && list.length) return [REQUIREMENT_LABELS.unknown]
  return out
}

function formatDay(value, { now = Date.now() } = {}) {
  const raw = String(value || "").trim()
  if (!raw) return ""

  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnly) {
    const [, year, month, day] = dateOnly
    return Number(year) === new Date(now).getFullYear() ? `${month}-${day}` : `${year}-${month}-${day}`
  }

  const ts = toTimestamp(raw)
  if (!ts) return ""
  const date = new Date(ts)
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return date.getFullYear() === new Date(now).getFullYear()
    ? `${month}-${day}`
    : `${date.getFullYear()}-${month}-${day}`
}

function formatUsdText(offer) {
  const valuation = offer?.valuation && typeof offer.valuation === "object" ? offer.valuation : {}
  const low = Number(offer?.usdEstimate ?? valuation.usdEstimate ?? NaN)
  const high = Number(offer?.usdMax ?? valuation.usdMax ?? NaN)
  const hasLow = Number.isFinite(low) && low > 0
  const hasHigh = Number.isFinite(high) && high > 0
  if (!hasLow && !hasHigh) return ""

  const money = value => (value >= 1000 ? `$${Math.round(value).toLocaleString("en-US")}` : `$${Math.round(value)}`)
  const amount =
    hasLow && hasHigh && Math.round(low) !== Math.round(high) ? `${money(low)}–${money(high)}` : money(hasLow ? low : high)
  const period = String(valuation.period || "").toLowerCase()
  const suffix = period === "monthly" ? "/月" : period === "yearly" ? "/年" : ""
  return `约 ${amount}${suffix}`
}

function formatDeadlineText(offer, { now = Date.now() } = {}) {
  const endKind = String(offer?.endKind || "").toLowerCase()
  const end = formatDay(offer?.claimEnd, { now })
  if (end) return `截止 ${end}`
  if (endKind === "standing") return "长期有效"
  if (endKind === "estimated") return "截止时间待官方确认"
  return "官方未公布截止"
}

function normalizeOffer(offer, platformMap) {
  const platform = platformMap instanceof Map ? platformMap.get(String(offer?.platformId || "")) : null
  const steps = (Array.isArray(offer?.steps) ? offer.steps : [])
    .map(step => truncateText(step, 80).replace(/[。；;]+$/u, ""))
    .filter(Boolean)
    .slice(0, 3)

  const discovered = toTimestamp(offer?.discoveredAt || offer?.createdAt)
  const updated = toTimestamp(offer?.updatedAt)
  const freshAt = Math.max(discovered, updated)
  const rawTitle = collapseWhitespace(offer?.title)
  const rawValue = collapseWhitespace(offer?.valueText)
  // 价值说明和标题重复时不再重复展示
  const valueText = rawValue && rawValue !== rawTitle ? truncateText(rawValue, 100) : ""

  return {
    id: String(offer?.id || ""),
    title: truncateText(rawTitle, 60) || "未命名羊毛",
    platform: truncateText(platform?.name || offer?.platformId, 40),
    platformType: labelOf(PLATFORM_TYPE_LABELS, platform?.type),
    type: String(offer?.type || ""),
    typeLabel: labelOf(TYPE_LABELS, offer?.type),
    claimLabel: labelOf(CLAIM_LABELS, offer?.claimMethod),
    requirementLabels: requirementLabels(offer?.requirements),
    audienceLabel: labelOf(AUDIENCE_LABELS, offer?.audience),
    modalityLabels: labelListOf(MODALITY_LABELS, offer?.modalities, 2),
    valueText,
    usdText: formatUsdText(offer),
    deadlineText: formatDeadlineText(offer),
    startText: formatDay(offer?.claimStart) ? `开始 ${formatDay(offer?.claimStart)}` : "",
    steps,
    sourceUrl: String(offer?.evidence?.url || "").trim(),
    status: String(offer?.status || ""),
    freshAt,
    discoveredAt: discovered,
    endsAt: toTimestamp(offer?.claimEnd),
  }
}

function buildPlatformMap(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.platforms) ? raw.platforms : []
  const map = new Map()
  for (const item of list) {
    const id = String(item?.id || "").trim()
    if (id) map.set(id, item)
  }
  return map
}

export function normalizeOffers(rawOffers, rawPlatforms = []) {
  const platformMap = buildPlatformMap(rawPlatforms)
  const list = Array.isArray(rawOffers) ? rawOffers : Array.isArray(rawOffers?.offers) ? rawOffers.offers : []
  return list.map(offer => normalizeOffer(offer, platformMap)).filter(item => item.id && item.title)
}

async function requestJson(url, { timeoutMs = 15000, fetchImpl } = {}) {
  const doFetch = typeof fetchImpl === "function" ? fetchImpl : globalThis.fetch
  if (typeof doFetch !== "function") throw new Error("当前运行环境不支持 fetch")

  const controller = typeof AbortController === "function" ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), Math.max(1000, timeoutMs)) : null
  try {
    const response = await doFetch(url, {
      headers: { accept: "application/json" },
      signal: controller?.signal,
    })
    if (!response || response.ok === false) {
      throw new Error(`HTTP ${response?.status ?? "unknown"}`)
    }
    if (typeof response.json !== "function") throw new Error("响应格式异常")
    return await response.json()
  } catch (err) {
    if (err?.name === "AbortError") throw new Error(`请求超时（${timeoutMs}ms）`)
    throw err
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * 抓取并归一化数据源快照。
 * 平台字典只影响展示名称，抓取失败不影响主流程。
 */
export async function fetchOffers({ apiBase = SOURCE_SITE, timeoutMs = 15000, fetchImpl } = {}) {
  const base = String(apiBase || SOURCE_SITE).replace(/\/+$/, "")
  const [offersResult, platformsResult] = await Promise.allSettled([
    requestJson(`${base}${OFFERS_PATH}`, { timeoutMs, fetchImpl }),
    requestJson(`${base}${PLATFORMS_PATH}`, { timeoutMs, fetchImpl }),
  ])

  if (offersResult.status === "rejected") {
    throw new Error(`羊毛数据抓取失败：${offersResult.reason?.message || offersResult.reason}`)
  }

  const rawOffers = offersResult.value
  const offers = Array.isArray(rawOffers) ? rawOffers : Array.isArray(rawOffers?.offers) ? rawOffers.offers : []
  const platforms = platformsResult.status === "fulfilled" ? platformsResult.value : []
  return normalizeOffers(offers, platforms)
}

export function isClaimable(offer) {
  const status = String(offer?.status || "").toLowerCase()
  return CLAIMABLE_STATUS.has(status)
}

/**
 * 选出当天要推送的条目：
 * - items：最近 lookbackDays 天内新发现/更新的可领条目（按新鲜度倒序）
 * - 若窗口内为空，则退化为「最近上架」并标记 fallback
 * - ending：endingSoonDays 天内截止、且未出现在 items 里的条目
 */
export function selectDailyDigest(
  offers,
  { now = Date.now(), lookbackDays = 3, maxItems = 12, endingSoonDays = 3 } = {},
) {
  const list = Array.isArray(offers) ? offers.filter(isClaimable) : []
  const since = now - Math.max(1, lookbackDays) * DAY_MS
  const freshList = list
    .filter(item => item.freshAt && item.freshAt >= since)
    .sort((a, b) => b.freshAt - a.freshAt)

  const fallback = freshList.length === 0
  const picked = fallback ? list.slice().sort((a, b) => (b.freshAt || 0) - (a.freshAt || 0)) : freshList
  const items = picked.slice(0, Math.max(1, maxItems))

  let ending = []
  const endingDays = Number(endingSoonDays) || 0
  if (endingDays > 0) {
    const pickedIds = new Set(items.map(item => item.id))
    const until = now + endingDays * DAY_MS
    ending = list
      .filter(item => item.endsAt && item.endsAt >= now && item.endsAt <= until && !pickedIds.has(item.id))
      .sort((a, b) => a.endsAt - b.endsAt)
      .slice(0, 6)
  }

  return {
    items,
    ending,
    fallback,
    lookbackDays,
    endingSoonDays: endingDays,
    totalClaimable: list.length,
    freshCount: freshList.length,
    generatedAt: now,
  }
}
