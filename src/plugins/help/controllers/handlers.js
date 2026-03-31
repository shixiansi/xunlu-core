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

function normalizePluginName(item) {
  const p = item?.plugin
  if (p) return String(p)
  const id = String(item?.id || "")
  const m = id.match(/^(.*?)-\d+$/)
  return m ? m[1] : id || "unknown"
}

function normalizeHelpItem(item) {
  const plugin = normalizePluginName(item)
  const reg = String(item?.reg || "")
  const help = isPlainObject(item?.help) ? item.help : null

  // 空 reg 通常是内部监听器/非消息事件，不展示到帮助里（避免出现“(指令)”）
  if (!reg.trim()) {
    if (!help) return null
  }

  const example = pickHelpExample(help) || autoExampleFromReg(reg) || "(指令)"
  const desc = pickHelpDesc(help) || autoDescFromExample(example, plugin)

  return {
    plugin,
    example: clampText(example, 60),
    desc: clampText(desc, 90),
    event: String(item?.event || "message"),
    priority: Number(item?.priority ?? 5000),
  }
}

function groupByPlugin(pluginNames, items) {
  const map = new Map()
  for (const name of pluginNames) {
    map.set(name, { name, commands: [] })
  }
  for (const it of items) {
    const p = it.plugin || "unknown"
    if (!map.has(p)) map.set(p, { name: p, commands: [] })
    map.get(p).commands.push(it)
  }

  const list = [...map.values()]
  for (const p of list) {
    p.commands.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      return a.example.localeCompare(b.example)
    })
  }

  return list.sort((a, b) => a.name.localeCompare(b.name))
}

function filterByQuery(items, query, pluginNamesSet) {
  const q = String(query || "").trim()
  if (!q) return { type: "all", query: "", items }

  const lower = q.toLowerCase()
  if (pluginNamesSet.has(lower)) {
    return { type: "plugin", query: q, items: items.filter(i => String(i.plugin).toLowerCase() === lower) }
  }

  return {
    type: "search",
    query: q,
    items: items.filter(i => {
      const ex = String(i.example || "").toLowerCase()
      const desc = String(i.desc || "").toLowerCase()
      return ex.includes(lower) || desc.includes(lower) || String(i.plugin || "").toLowerCase().includes(lower)
    }),
  }
}

async function replyHelp(ctx, query) {
  const rawList = typeof ctx?.listCommands === "function" ? ctx.listCommands() : []
  const items = Array.isArray(rawList) ? rawList.map(normalizeHelpItem).filter(Boolean) : []

  const pluginNames = listPluginNamesFromFs()
  const pluginNamesSet = new Set(pluginNames.map(n => String(n).toLowerCase()))
  const filtered = filterByQuery(items, query, pluginNamesSet)

  let grouped = groupByPlugin(pluginNames, filtered.items)
  if (filtered.type !== "all") {
    grouped = grouped.filter(p => Array.isArray(p.commands) && p.commands.length > 0)
  }
  const pluginCount = grouped.length
  const commandCount = grouped.reduce((sum, p) => sum + (p.commands?.length || 0), 0)

  const headerLine =
    filtered.type === "all"
      ? `插件帮助（共 ${pluginCount} 个插件 / ${commandCount} 条指令）`
      : filtered.type === "plugin"
        ? `插件帮助：${filtered.query}（${commandCount} 条指令）`
        : `搜索：${filtered.query}（${commandCount} 条匹配）`

  const data = {
    title: "插件帮助",
    header: headerLine,
    generatedAt: nowText(),
    query: filtered.query,
    queryType: filtered.type,
    pluginCount,
    commandCount,
    plugins: grouped.map(p => ({
      name: p.name,
      count: p.commands.length,
      commands: p.commands,
    })),

    // 截图分页（列表很长时）
    multiPage: true,
    multiPageHeight: 3800,
  }

  try {
    const img = await ctx.renderImg("help", data, { tpl: "help" })
    if (img) return await ctx.reply(img)
  } catch (err) {
    console.error("[help] render error:", err?.stack || err?.message || String(err))
  }

  // 降级文本输出（simulate 环境通常会走这里）
  const lines = [headerLine, "", "用法：", "- 帮助", "- 帮助 <插件名>", "- 帮助 <关键词>", ""]
  for (const p of grouped) {
    if (!Array.isArray(p.commands) || p.commands.length === 0) continue
    lines.push(`[${p.name}]`)
    for (const c of p.commands.slice(0, 12)) {
      lines.push(`- ${c.example}：${c.desc}`)
    }
    if (p.commands.length > 12) lines.push(`- ...(共 ${p.commands.length} 条)`)
    lines.push("")
  }
  return await ctx.reply(lines.join("\n").trim())
}

export function register(bot) {
  if (!bot || typeof bot.registerCommand !== "function") return

  // 帮助 / 帮助 <插件名|关键词>
  bot.registerCommand(
    ["^帮助(\\s+.*)?$",
      { example: ["帮助", "帮助 diaoyu", "帮助 签到"], desc: "展示已加载插件的指令示例与说明" }],
    async ctx => {
      const raw = String(ctx?.msg || "").trim()
      const rest = raw.replace(/^帮助/, "").trim()
      return await replyHelp(ctx, rest)
    },
  )
}

export function onBotEvent(event) {
  void event
}
