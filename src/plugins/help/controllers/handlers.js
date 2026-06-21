import fs from "node:fs"
import path from "node:path"

import env from "../../../lib/env.js"

function nowText() {
  const d = new Date()
  const pad = n => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}:${pad(d.getSeconds())}`
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
}

function listPluginNamesFromFs() {
  try {
    const dir = path.resolve(env.RootPath, "src", "plugins")
    if (!fs.existsSync(dir)) return []
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    const names = []
    for (const e of entries) {
      if (e.isDirectory()) {
        names.push(e.name)
        continue
      }
      if (e.isFile() && e.name.endsWith(".js")) {
        names.push(e.name.replace(/\.js$/, ""))
      }
    }
    return [...new Set(names)].sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}

function listPluginMetasFromFs() {
  return listPluginNamesFromFs().map(name => ({
    name,
    title: name,
    shortName: name,
    aliases: [name],
    helpHidden: false,
  }))
}

function uniqueTextList(values = []) {
  const seen = new Set()
  const list = []
  for (const value of values) {
    const text = String(value || "").trim()
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    list.push(text)
  }
  return list
}

function normalizeSearchKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "")
}

function normalizePluginMeta(item) {
  const name = String(item?.name ?? item?.plugin ?? "").trim()
  if (!name) return null

  const title = String(item?.title ?? item?.pluginTitle ?? item?.displayName ?? name).trim() || name
  const shortName =
    String(item?.shortName ?? item?.pluginShortName ?? item?.abbr ?? item?.alias ?? title).trim() || title
  const aliases = uniqueTextList([
    name,
    title,
    shortName,
    ...(Array.isArray(item?.aliases) ? item.aliases : []),
    ...(Array.isArray(item?.pluginAliases) ? item.pluginAliases : []),
  ])

  return {
    name,
    title,
    shortName,
    aliases,
    helpHidden: Boolean(item?.helpHidden),
  }
}

function mergePluginMeta(base, extra) {
  if (!base) return extra
  if (!extra) return base

  return {
    name: base.name || extra.name,
    title: base.title || extra.title || base.name,
    shortName: base.shortName || extra.shortName || base.title || extra.title || base.name,
    aliases: uniqueTextList([...(base.aliases || []), ...(extra.aliases || [])]),
    helpHidden: Boolean(base.helpHidden || extra.helpHidden),
  }
}

function buildPluginMetaMap(rawPlugins, items) {
  const map = new Map()
  const addMeta = raw => {
    const meta = normalizePluginMeta(raw)
    if (!meta) return
    map.set(meta.name, mergePluginMeta(map.get(meta.name), meta))
  }

  for (const plugin of rawPlugins || []) addMeta(plugin)
  for (const item of items || []) {
    addMeta({
      name: item.plugin,
      title: item.pluginTitle,
      shortName: item.pluginShortName,
      aliases: item.pluginAliases,
    })
  }
  if (map.size === 0) {
    for (const plugin of listPluginMetasFromFs()) addMeta(plugin)
  }

  return map
}

function resolvePluginQuery(query, pluginMetaMap) {
  const qKey = normalizeSearchKey(query)
  if (!qKey) return null

  for (const meta of pluginMetaMap.values()) {
    const aliasList = Array.isArray(meta.aliases) ? meta.aliases : [meta.name, meta.title, meta.shortName]
    if (aliasList.some(alias => normalizeSearchKey(alias) === qKey)) {
      return meta
    }
  }
  return null
}

function pickHelpExample(help) {
  if (!help) return ""
  const ex = help.example ?? help.examples
  if (Array.isArray(ex)) return ex.map(x => String(x || "").trim()).find(Boolean) || ""
  if (typeof ex === "string" || typeof ex === "number") return String(ex).trim()
  return ""
}

function pickHelpDesc(help) {
  if (!help) return ""
  const d = help.desc ?? help.description ?? help.summary
  if (typeof d === "string" || typeof d === "number") return String(d).trim()
  return ""
}

function clampText(text, maxLen = 80) {
  const s = String(text || "").trim()
  if (!s) return ""
  if (s.length <= maxLen) return s
  return s.slice(0, maxLen - 1) + "…"
}

function autoExampleFromReg(reg) {
  let s = String(reg || "").trim()
  if (!s) return ""

  // 去掉常见锚点
  if (s.startsWith("^")) s = s.slice(1)
  if (s.endsWith("$")) s = s.slice(0, -1)

  // 状态机生成“看起来像指令”的示例
  let out = ""
  let i = 0
  const push = v => {
    out += v
  }

  const readUntil = (endChar, startIndex) => {
    let depth = 0
    for (let j = startIndex; j < s.length; j++) {
      const ch = s[j]
      if (ch === "\\") {
        j++
        continue
      }
      if (ch === "(") depth++
      if (ch === ")") {
        if (depth === 0) return j
        depth--
      }
      if (ch === endChar && depth === 0) return j
    }
    return -1
  }

  while (i < s.length) {
    const ch = s[i]

    if (ch === "\\") {
      const next = s[i + 1]
      if (!next) break

      if (next === "s") {
        // \s* \s+
        i += 2
        if (s[i] === "*" || s[i] === "+") i++
        push(" ")
        continue
      }

      if (next === "d") {
        i += 2
        // \d+
        while (i < s.length && (s[i] === "+" || s[i] === "*" || s[i] === "?" || /[0-9{}]/.test(s[i]))) i++
        push("<数字>")
        continue
      }

      if (next === "w" || next === "S") {
        i += 2
        while (i < s.length && (s[i] === "+" || s[i] === "*" || s[i] === "?" || /[0-9{}]/.test(s[i]))) i++
        push("<参数>")
        continue
      }

      // 其它转义：按字面输出
      push(next)
      i += 2
      continue
    }

    if (ch === "(") {
      const end = readUntil(")", i + 1)
      if (end === -1) {
        i++
        continue
      }
      const inner = s.slice(i + 1, end)
      const optional = s[end + 1] === "?"

      // 分支选择：优先选择“更像常用指令”的项（尽量避免 1 个字的过短别名）
      const parts = inner.split("|").map(x => x.trim()).filter(Boolean)
      let picked = parts[0] || ""
      if (parts.length > 1) {
        const isClean = v => !/[.*+?[\]{}\\]/.test(v)
        const prefer =
          parts.find(v => isClean(v) && v.length >= 2) ||
          parts.find(v => isClean(v)) ||
          parts[0] ||
          ""
        picked = prefer
      }

      // 递归处理 picked（但避免无限递归：只做一次简单替换）
      picked = picked
        .replace(/\\s\*|\\s\+/g, " ")
        .replace(/\\d\+/g, "<数字>")
        .replace(/\\w\+/g, "<参数>")
        .replace(/\\S\+/g, "<参数>")
        .replace(/\.\+/g, "<参数>")
        .replace(/\.\*/g, "<参数>")

      // 可选分支：若只是后缀修饰（如“(鱼竿)?”），则默认不拼进示例；参数占位则保留
      if (!(optional && !picked.includes("<") && !picked.includes(" "))) {
        push(picked)
      }
      i = end + 1

      // 处理 )? 的可选，直接忽略 ?
      if (s[i] === "?") i++
      continue
    }

    if (ch === "[") {
      const end = s.indexOf("]", i + 1)
      if (end === -1) {
        i++
        continue
      }
      // 字符集统一视为参数
      push("<参数>")
      i = end + 1
      // 跳过量词
      while (i < s.length && (s[i] === "+" || s[i] === "*" || s[i] === "?")) i++
      continue
    }

    if (ch === ".") {
      // .+ / .* -> 参数
      const next = s[i + 1]
      if (next === "+" || next === "*") {
        push("<参数>")
        i += 2
        if (s[i] === "?") i++
        continue
      }
      push(".")
      i++
      continue
    }

    // 忽略量词符号
    if (ch === "+" || ch === "*" || ch === "?") {
      i++
      continue
    }

    // 其它字符原样输出
    push(ch)
    i++
  }

  // 清理：去掉多余空格与明显的正则残留
  out = out
    .replace(/\s+/g, " ")
    .replace(/\\+/g, "")
    .replace(/\(\?:/g, "")
    .trim()

  // 太像正则时的兜底
  if (!out || /[\[\]{}]/.test(out)) {
    return ""
  }

  return out
}

function autoDescFromExample(example, plugin) {
  const s = String(example || "").trim()
  if (!s) return `执行 ${plugin || "插件"} 指令`

  if (s.includes("帮助")) return "查看指令帮助/用法"
  if (s.includes("状态")) return "查看当前状态/信息"
  if (s.includes("商店")) return "查看商店/可购买项目"
  if (s.includes("签到")) return "签到领取奖励"
  if (s.includes("升级")) return "升级能力/装备"
  if (s.includes("买") || s.includes("购买")) return "购买道具/物品"
  if (s.includes("卖") || s.includes("出售")) return "出售物品/兑换收益"
  if (s.includes("测试")) return "自检/调试指令"

  return `执行 ${plugin || "插件"} 指令`
}

function isMessageEvent(event) {
  const value = String(event || "message").trim() || "message"
  return value === "message" || value.startsWith("message.")
}

function getEventMeta(event) {
  const value = String(event || "message").trim() || "message"

  const exactMap = {
    message: {
      title: "消息指令",
      category: "消息事件",
      detail: "发送对应消息后触发",
    },
    "message.group.*": {
      title: "群消息监听",
      category: "消息事件",
      detail: "收到群聊消息时自动触发",
    },
    "message.private.*": {
      title: "私聊消息监听",
      category: "消息事件",
      detail: "收到私聊或临时消息时自动触发",
    },
    "notice.group.poke": {
      title: "戳一戳互动",
      category: "通知事件",
      detail: "被群成员戳一戳时自动触发",
    },
    "notice.group.recall": {
      title: "群消息撤回",
      category: "通知事件",
      detail: "检测到群消息被撤回时自动触发",
    },
    "notice.private.recall": {
      title: "私聊消息撤回",
      category: "通知事件",
      detail: "检测到私聊消息被撤回时自动触发",
    },
    "request.private.friend": {
      title: "好友申请",
      category: "请求事件",
      detail: "收到好友申请时自动触发",
    },
    "request.group.add": {
      title: "加群申请",
      category: "请求事件",
      detail: "收到用户加群申请时自动触发",
    },
    "request.group.invite": {
      title: "群邀请/入群审核",
      category: "请求事件",
      detail: "收到群邀请或邀请入群审核时自动触发",
    },
    "notice.group.invited": {
      title: "被邀请入群",
      category: "通知事件",
      detail: "Bot 被邀请进群时自动触发",
    },
    "notice.group.increase": {
      title: "群成员增加",
      category: "通知事件",
      detail: "检测到成员加入或 Bot 进群时自动触发",
    },
    "notice.group.decrease": {
      title: "群成员减少",
      category: "通知事件",
      detail: "检测到成员退出、被移出或 Bot 退群时自动触发",
    },
    "notice.group.admin": {
      title: "管理员变更",
      category: "通知事件",
      detail: "检测到群管理员变更时自动触发",
    },
    "notice.group.ban": {
      title: "群禁言变化",
      category: "通知事件",
      detail: "检测到群禁言事件时自动触发",
    },
    "notice.group.allban": {
      title: "全员禁言变化",
      category: "通知事件",
      detail: "检测到全员禁言状态变化时自动触发",
    },
  }

  if (exactMap[value]) return exactMap[value]

  if (value.startsWith("message.group")) {
    return {
      title: "群消息监听",
      category: "消息事件",
      detail: "收到群聊消息时自动触发",
    }
  }

  if (value.startsWith("message.private")) {
    return {
      title: "私聊消息监听",
      category: "消息事件",
      detail: "收到私聊消息时自动触发",
    }
  }

  if (value.startsWith("message.")) {
    return {
      title: "消息监听",
      category: "消息事件",
      detail: `收到 ${value} 时自动触发`,
    }
  }

  if (value.startsWith("notice.")) {
    return {
      title: "通知响应",
      category: "通知事件",
      detail: `收到 ${value} 通知时自动触发`,
    }
  }

  if (value.startsWith("request.")) {
    return {
      title: "请求处理",
      category: "请求事件",
      detail: `收到 ${value} 请求时自动触发`,
    }
  }

  return {
    title: value,
    category: "事件监听",
    detail: `监听 ${value} 事件时自动触发`,
  }
}

function joinUniqueText(parts, separator = "；") {
  const list = []
  for (const part of parts) {
    const text = String(part || "").trim()
    if (!text) continue
    if (list.some(existing => existing.includes(text) || text.includes(existing))) continue
    list.push(text)
  }
  return list.join(separator)
}

function normalizePluginName(item) {
  const p = item?.plugin
  if (p) return String(p)
  const id = String(item?.id || "")
  const m = id.match(/^(.*?)-\d+$/)
  return m ? m[1] : id || "unknown"
}

function normalizeIncomingText(ctx) {
  return String(ctx?.__xunluOriginalMsg ?? ctx?.raw_message ?? ctx?.msg ?? "")
    .trim()
}

function parseScopedHelpQuery(text) {
  const raw = String(text || "").trim()
  const match = raw.match(/^(荨鹿|xunlu)帮助(?:\s+(.*))?$/i)
  if (!match) return null
  return String(match[2] || "").trim()
}

function shouldSkipDirectHelpCommand(ctx, { currentEnv = env.CurEnv } = {}) {
  if (String(currentEnv || "").trim() !== "QQBot-YunZai") return false
  // 仅跳过插件环境中的原始“帮助”，避免和宿主帮助指令冲突。
  return normalizeIncomingText(ctx) === "帮助"
}

function normalizeHelpItem(item) {
  const plugin = normalizePluginName(item)
  const reg = String(item?.reg || "")
  const event = String(item?.event || "message")
  const help = isPlainObject(item?.help) ? item.help : null
  const hasReg = Boolean(reg.trim())
  const isMessage = isMessageEvent(event)
  const mode = hasReg && isMessage ? "command" : "auto"
  const eventMeta = getEventMeta(event)

  // 空 reg 的消息监听器通常属于内部逻辑，避免塞满帮助页；非消息事件则展示为自动触发能力
  if (!hasReg && !help && isMessage) return null

  const example = pickHelpExample(help) || autoExampleFromReg(reg) || (mode === "auto" ? eventMeta.title : "(指令)")
  const helpDesc = pickHelpDesc(help)
  const desc =
    mode === "command"
      ? helpDesc || autoDescFromExample(example, plugin)
      : joinUniqueText([helpDesc, hasReg ? autoDescFromExample(example, plugin) : "", eventMeta.detail])

  return {
    plugin,
    pluginTitle: String(item?.pluginTitle || "").trim(),
    pluginShortName: String(item?.pluginShortName || "").trim(),
    pluginAliases: Array.isArray(item?.pluginAliases) ? item.pluginAliases : [],
    example: clampText(example, 60),
    desc: clampText(desc, 96),
    event,
    mode,
    modeClass: mode,
    triggerLabel: mode === "command" ? "消息指令" : "自动触发",
    eventCategory: mode === "command" ? "" : eventMeta.category,
    eventTitle: eventMeta.title,
    eventLine: mode === "command" ? "" : `监听事件：${event}`,
    priority: Number(item?.priority ?? 5000),
  }
}

function buildPluginDetailHint(meta) {
  const title = String(meta?.title || meta?.name || "").trim()
  const shortName = String(meta?.shortName || "").trim()
  const variants = uniqueTextList([
    title ? `${title}帮助` : "",
    shortName && shortName !== title ? `${shortName}帮助` : "",
    shortName ? `帮助 ${shortName}` : "",
  ])
  return variants.join(" / ")
}

function buildPluginSections(commands) {
  const sectionDefs = [
    {
      key: "command",
      title: "消息指令",
      desc: "发送对应消息即可触发",
      items: commands.filter(i => i.mode === "command"),
    },
    {
      key: "auto",
      title: "自动触发",
      desc: "满足事件条件后自动执行，无需手动发送指令",
      items: commands.filter(i => i.mode !== "command"),
    },
  ]

  const sections = sectionDefs
    .filter(section => section.items.length > 0)
    .map(section => ({
      ...section,
      count: section.items.length,
    }))

  return {
    sections,
    commandCount: sections.find(section => section.key === "command")?.count || 0,
    autoCount: sections.find(section => section.key === "auto")?.count || 0,
  }
}

function groupByPlugin(items, pluginMetaMap) {
  const map = new Map()
  for (const it of items) {
    const p = it.plugin || "unknown"
    if (!map.has(p)) map.set(p, { name: p, commands: [] })
    map.get(p).commands.push(it)
  }

  const list = [...map.values()]
  for (const p of list) {
    p.commands.sort((a, b) => {
      if (a.mode !== b.mode) return a.mode === "command" ? -1 : 1
      if (a.priority !== b.priority) return a.priority - b.priority
      if (a.event !== b.event) return a.event.localeCompare(b.event)
      return a.example.localeCompare(b.example)
    })
    Object.assign(p, buildPluginSections(p.commands))
    p.count = p.commands.length
    const meta = pluginMetaMap.get(p.name) || normalizePluginMeta({ name: p.name })
    p.title = meta?.title || p.name
    p.shortName = meta?.shortName || p.title
    p.aliases = meta?.aliases || [p.name]
    p.aliasText = uniqueTextList((p.aliases || []).filter(alias => alias !== p.title)).join(" / ")
    p.detailHint = buildPluginDetailHint(meta)
    const summaryParts = []
    if (p.commandCount) summaryParts.push(`${p.commandCount} 条消息指令`)
    if (p.autoCount) summaryParts.push(`${p.autoCount} 项自动触发`)
    p.summaryText = summaryParts.join(" / ") || "暂无功能"
  }

  return list.sort((a, b) => String(a.title || a.name).localeCompare(String(b.title || b.name)))
}

function buildPluginOverview(pluginMetaMap, groupedPlugins) {
  const groupedMap = new Map(groupedPlugins.map(item => [item.name, item]))
  const cards = []

  for (const meta of pluginMetaMap.values()) {
    if (meta.helpHidden) continue
    const grouped = groupedMap.get(meta.name)
    cards.push({
      name: meta.name,
      title: meta.title,
      shortName: meta.shortName,
      aliases: meta.aliases,
      aliasText: uniqueTextList((meta.aliases || []).filter(alias => alias !== meta.title)).join(" / "),
      count: grouped?.count || 0,
      commandCount: grouped?.commandCount || 0,
      autoCount: grouped?.autoCount || 0,
      summaryText: grouped?.summaryText || "暂无可展示功能",
      detailHint: buildPluginDetailHint(meta),
    })
  }

  return cards.sort((a, b) => String(a.title || a.name).localeCompare(String(b.title || b.name)))
}

function filterByQuery(items, query, pluginMetaMap) {
  const q = String(query || "").trim()
  if (!q) return { type: "all", query: "", items }

  const pluginMeta = resolvePluginQuery(q, pluginMetaMap)
  if (pluginMeta) {
    return {
      type: "plugin",
      query: pluginMeta.title,
      plugin: pluginMeta,
      items: items.filter(i => String(i.plugin).toLowerCase() === String(pluginMeta.name).toLowerCase()),
    }
  }

  const lower = q.toLowerCase()
  return {
    type: "search",
    query: q,
    items: items.filter(i => {
      const ex = String(i.example || "").toLowerCase()
      const desc = String(i.desc || "").toLowerCase()
      const extra = [i.eventTitle, i.eventCategory, i.event].map(v => String(v || "").toLowerCase()).join(" ")
      return (
        ex.includes(lower) ||
        desc.includes(lower) ||
        extra.includes(lower) ||
        [i.pluginTitle, i.pluginShortName, ...(i.pluginAliases || [])]
          .map(v => String(v || "").toLowerCase())
          .join(" ")
          .includes(lower) ||
        String(i.plugin || "").toLowerCase().includes(lower)
      )
    }),
  }
}

async function replyHelp(ctx, query, options = {}) {
  const rawList = typeof ctx?.listCommands === "function" ? ctx.listCommands() : []
  const items = Array.isArray(rawList) ? rawList.map(normalizeHelpItem).filter(Boolean) : []
  const rawPlugins = typeof ctx?.listPlugins === "function" ? ctx.listPlugins() : []
  const pluginMetaMap = buildPluginMetaMap(rawPlugins, items)
  const filtered = filterByQuery(items, query, pluginMetaMap)

  if (options.strictPluginOnly && filtered.type !== "plugin") return false

  const groupedAll = groupByPlugin(items, pluginMetaMap)
  const grouped = groupByPlugin(filtered.items, pluginMetaMap)
  const overviewPlugins = buildPluginOverview(pluginMetaMap, groupedAll)
  const summaryMode = filtered.type === "all"
  const pluginCount = summaryMode ? overviewPlugins.length : grouped.length
  const featureCount = grouped.reduce((sum, p) => sum + (p.count || 0), 0)
  const messageCount = grouped.reduce((sum, p) => sum + (p.commandCount || 0), 0)
  const autoCount = grouped.reduce((sum, p) => sum + (p.autoCount || 0), 0)

  const headerLine =
    summaryMode
      ? `插件总览（共 ${pluginCount} 个大插件）`
      : filtered.type === "plugin"
        ? `插件帮助：${filtered.query}（${featureCount} 项功能）`
        : `搜索：${filtered.query}（${featureCount} 项匹配）`

  const data = {
    title: "插件帮助",
    header: headerLine,
    generatedAt: nowText(),
    query: filtered.query,
    queryType: filtered.type,
    summaryMode,
    pluginCount,
    featureCount,
    messageCount,
    autoCount,
    plugins: summaryMode ? overviewPlugins : grouped,

    // 截图分页（列表很长时）
    multiPage: true,
    multiPageHeight: 4200,
    viewportWidth: 1680,
    viewportHeight: 1280,
  }

  try {
    const img = await ctx.renderImg("help", data, { tpl: "help" })
    if (img) return await ctx.reply(img)
  } catch (err) {
    console.error("[help] render error:", err?.stack || err?.message || String(err))
  }

  // 降级文本输出（simulate 环境通常会走这里）
  const lines = [
    headerLine,
    "",
    "用法：",
    "- 帮助（独立运行可直接使用）",
    "- 荨鹿帮助 / xunlu帮助",
    "- 帮助 <插件名或简称>",
    "- 荨鹿帮助 <插件名或简称> / xunlu帮助 <插件名或简称>",
    "- <插件名或简称>帮助",
    "- 帮助 <关键词>",
    "",
  ]
  if (summaryMode) {
    for (const p of overviewPlugins) {
      const short = p.shortName && p.shortName !== p.title ? `，简称：${p.shortName}` : ""
      lines.push(`- ${p.title}${short}（${p.summaryText}）`)
    }
    return await ctx.reply(lines.join("\n").trim())
  }

  for (const p of grouped) {
    if (!Array.isArray(p.commands) || p.commands.length === 0) continue
    lines.push(`[${p.title}] ${p.summaryText}`)
    if (p.aliasText) lines.push(`别名：${p.aliasText}`)
    if (p.detailHint) lines.push(`查看：${p.detailHint}`)
    for (const c of p.commands.slice(0, 12)) {
      const label = [c.triggerLabel, c.eventCategory].filter(Boolean).join("·")
      lines.push(`- [${label}] ${c.example}：${c.desc}`)
    }
    if (p.commands.length > 12) lines.push(`- ...(共 ${p.commands.length} 条)`)
    lines.push("")
  }
  return await ctx.reply(lines.join("\n").trim())
}

export function register(bot) {
  if (!bot || typeof bot.registerCommand !== "function") return

  bot.registerCommand(
    [
      "^(荨鹿|xunlu)帮助(\\s+.*)?$",
      4400,
      {
        key: "help-xunlu",
        example: ["荨鹿帮助", "xunlu帮助 钓鱼"],
        desc: "显式查看 xunlu-core 帮助，插件环境可用于避开宿主的通用帮助指令",
      },
    ],
    async ctx => {
      const rest = parseScopedHelpQuery(String(ctx?.msg || ""))
      return await replyHelp(ctx, rest ?? "")
    },
  )

  // 帮助 / 帮助 <插件名|简称|关键词>
  bot.registerCommand(
    ["^帮助(\\s+.*)?$",
      { key: "help", example: ["帮助", "帮助 钓鱼", "帮助 鱼"], desc: "默认展示大插件列表，带上插件名或简称可查看详细功能" }],
    async ctx => {
      if (shouldSkipDirectHelpCommand(ctx)) return false
      const raw = String(ctx?.msg || "").trim()
      const rest = raw.replace(/^帮助/, "").trim()
      return await replyHelp(ctx, rest)
    },
  )

  bot.registerCommand(
    ["^([^\\s]{1,24})帮助$", 4500, { key: "help-plugin", example: ["钓鱼帮助", "鱼帮助"], desc: "按插件名或简称查看该插件的详细帮助" }],
    async ctx => {
      const raw = String(ctx?.msg || "").trim()
      const rest = raw.replace(/帮助$/, "").trim()
      return await replyHelp(ctx, rest, { strictPluginOnly: true })
    },
  )
}

export function onBotEvent(event) {
  void event
}

export const __test = {
  parseScopedHelpQuery,
  shouldSkipDirectHelpCommand,
}
