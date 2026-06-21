import fs from "fs"
import os from "os"
import path from "path"
import { pathToFileURL } from "url"

import cfg from "../../../lib/config.js"
import { getRuntimePaths } from "../../../runtime/runtime-context.js"
import {
  formatGroupPrefixState,
  setCurrentGroupPrefix,
  setCurrentGroupPrefixEnabled,
} from "../model/prefix-config.js"

async function resolveCommandKey(userInput) {
  const input = String(userInput || "").trim()
  if (!input) return null

  if (input.includes(":")) {
    const [pluginPart, cmdPart] = input.split(":", 2)
    const folderName = await resolvePluginFolderName(pluginPart)
    return folderName ? `${folderName}:${cmdPart}` : null
  }

  // 未带插件名时直接返回原值（匹配所有插件的同名 key 或正则）
  return input
}

async function resolvePluginFolderName(userInput) {
  const input = String(userInput || "").trim()
  if (!input) return null

  const rootDir = getRuntimePaths().rootDir
  const pluginsDir = path.join(rootDir, "src", "plugins")

  if (!fs.existsSync(pluginsDir)) return null
  const entries = fs.readdirSync(pluginsDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const indexPath = path.join(pluginsDir, entry.name, "index.js")
    if (!fs.existsSync(indexPath)) continue
    try {
      const mod = await import(pathToFileURL(indexPath).href)
      const meta = mod?.default || {}
      const name = String(meta.name || "").trim()
      const shortName = String(meta.shortName || "").trim()
      const title = String(meta.title || "").trim()
      const aliases = Array.isArray(meta.aliases) ? meta.aliases.map(String) : []
      if (
        entry.name === input ||
        name === input ||
        shortName === input ||
        title === input ||
        aliases.includes(input)
      ) {
        return name || entry.name
      }
    } catch {}
  }
  return null
}

async function ensureGroupMaster(ctx) {
  if (!ctx?.isGroup || !ctx?.group_id) {
    await ctx.reply("请在群聊中使用该命令")
    return false
  }
  if (!ctx?.isMaster) {
    await ctx.reply("仅主人可使用该命令")
    return false
  }
  return true
}

export function register(bot) {
  if (!bot || !bot.registerCommand) return
  //第一个参数是数组第一个是命令，第二个是事件，第三个是优先级（第二个和第三个都可以省略）
  bot.registerCommand(["^(|#)设置尾缀", { key: "set-suffix", example: "设置尾缀 xxx", desc: "设置机器人回复尾缀" }], async ctx => {
    let suffix = ctx.msg.replace(/^(|#)设置尾缀/, "") || ""
    if (ctx.message?.find(i => i.type == "face")) {
      suffix = ctx.message.map(i => {
        const text = i?.data?.content || ""
        if (i.type == "text" && text.includes("设置尾缀")) {
          return text.replace(/^(|#)设置尾缀/, "")
        }
        if (i.type == "face") {
          const faceId = i?.data?.id
          console.log("[face:" + faceId + "]")
          return "[face:" + faceId + "]"
        }
        return text
      })
      console.log(suffix)
      suffix = suffix.join("")
    }
    cfg.setConfigValue("bot", "suffix_text", suffix)
    return ctx.reply(`尾缀已设置为: ${suffix}`)
  })

  bot.registerCommand(["^(|#)我是什么bot", { key: "bot-type", example: "我是什么bot", desc: "查看当前机器人类型" }], async ctx => {
    const name = JSON.parse(fs.readFileSync("./package.json")).name
    ctx.reply(`我是运行在${name}的${ctx.adapterType}_Bot`)
  })

  bot.registerCommand(["^(?:#|＃)?设置前缀\\s+(.+)$", { key: "set-prefix", example: "设置前缀 #", desc: "设置群聊前缀（仅群主可用）" }], async ctx => {
    if (!(await ensureGroupMaster(ctx))) return true

    const prefix = String(ctx?.msg || "").replace(/^(?:#|＃)?设置前缀\s+/, "").trim()
    if (!prefix) {
      return await ctx.reply("用法：设置前缀 <前缀文本>")
    }

    const state = await setCurrentGroupPrefix(ctx.group_id, prefix)
    return await ctx.reply(`已将当前群前缀设置为：${state.prefix}\n${formatGroupPrefixState(state)}`)
  })

  bot.registerCommand(["^(?:#|＃)?开启群前缀$", { key: "prefix-on", example: "开启群前缀", desc: "开启当前群前缀限制（仅群主可用）" }], async ctx => {
    if (!(await ensureGroupMaster(ctx))) return true

    const state = await setCurrentGroupPrefixEnabled(ctx.group_id, true)
    return await ctx.reply(`已开启当前群前缀限制\n${formatGroupPrefixState(state)}`)
  })

  bot.registerCommand(["^(?:#|＃)?关闭群前缀$", { key: "prefix-off", example: "关闭群前缀", desc: "关闭当前群前缀限制（仅群主可用）" }], async ctx => {
    if (!(await ensureGroupMaster(ctx))) return true

    const state = await setCurrentGroupPrefixEnabled(ctx.group_id, false)
    return await ctx.reply(`已关闭当前群前缀限制\n${formatGroupPrefixState(state)}`)
  })

  // 插件管理命令

  // 禁用插件命令
  bot.registerCommand(["^(?:#|＃)?禁用插件\\s+(.+)$", { key: "disable-plugin", example: "禁用插件 抖音", desc: "禁用指定插件（支持文件夹名/别名/短名，仅主人可用，重载插件后生效）" }], async ctx => {
    if (!ctx.isMaster) return false

    const userInput = String(ctx?.msg || "").replace(/^(?:#|＃)?禁用插件\s+/, "").trim()
    if (!userInput) {
      return await ctx.reply("用法：禁用插件 <插件名或别名>")
    }

    const pluginName = await resolvePluginFolderName(userInput)
    if (!pluginName) {
      return await ctx.reply(`未找到匹配的插件：${userInput}\n请使用文件夹名、别名或短名（如 #禁用插件 抖音）`)
    }

    const botCfg = cfg.getConfig("bot") || {}
    const disabledPlugins = botCfg?.plugin_control?.disabled_plugins || []

    if (disabledPlugins.includes(pluginName)) {
      return await ctx.reply(`插件 ${pluginName} 已经被禁用`)
    }

    disabledPlugins.push(pluginName)
    cfg.setConfigValue("bot", "plugin_control", {
      ...botCfg?.plugin_control,
      disabled_plugins: disabledPlugins,
    })

    return await ctx.reply(`已禁用插件：${pluginName}\n重载插件后生效`)
  })

  // 启用插件命令
  bot.registerCommand(["^(?:#|＃)?启用插件\\s+(.+)$", { key: "enable-plugin", example: "启用插件 抖音", desc: "启用指定插件（支持文件夹名/别名/短名，仅主人可用，重载插件后生效）" }], async ctx => {
    if (!ctx.isMaster) return false

    const userInput = String(ctx?.msg || "").replace(/^(?:#|＃)?启用插件\s+/, "").trim()
    if (!userInput) {
      return await ctx.reply("用法：启用插件 <插件名或别名>")
    }

    const pluginName = await resolvePluginFolderName(userInput)
    if (!pluginName) {
      return await ctx.reply(`未找到匹配的插件：${userInput}`)
    }

    const botCfg = cfg.getConfig("bot") || {}
    const disabledPlugins = botCfg?.plugin_control?.disabled_plugins || []

    if (!disabledPlugins.includes(pluginName)) {
      return await ctx.reply(`插件 ${pluginName} 未被禁用`)
    }

    const newDisabledPlugins = disabledPlugins.filter(item => item !== pluginName)
    cfg.setConfigValue("bot", "plugin_control", {
      ...botCfg?.plugin_control,
      disabled_plugins: newDisabledPlugins,
    })

    return await ctx.reply(`已启用插件：${pluginName}\n重载插件后生效`)
  })

  // 禁用命令命令
  bot.registerCommand(["^(?:#|＃)?禁用命令\\s+(.+)$", { key: "disable-cmd", example: ["禁用命令 bilibili:video", "禁用命令 bilibili-plugin:video"], desc: "禁用指定命令（插件名支持别名，仅主人可用，重载插件后生效）" }], async ctx => {
    if (!ctx.isMaster) return false

    const rawInput = String(ctx?.msg || "").replace(/^(?:#|＃)?禁用命令\s+/, "").trim()
    if (!rawInput) {
      return await ctx.reply("用法：禁用命令 <插件名>:<命令key>\n如 #禁用命令 bilibili:video")
    }

    const commandKey = await resolveCommandKey(rawInput)
    if (!commandKey) {
      return await ctx.reply(`无法解析命令：${rawInput}\n格式：插件名:命令key\n如 #禁用命令 bilibili:video`)
    }

    const botCfg = cfg.getConfig("bot") || {}
    const disabledCommands = botCfg?.plugin_control?.disabled_commands || []

    if (disabledCommands.includes(commandKey)) {
      return await ctx.reply(`命令 ${commandKey} 已经被禁用`)
    }

    disabledCommands.push(commandKey)
    cfg.setConfigValue("bot", "plugin_control", {
      ...botCfg?.plugin_control,
      disabled_commands: disabledCommands,
    })

    return await ctx.reply(`已禁用命令：${commandKey}\n重载插件后生效`)
  })

  // 启用命令命令
  bot.registerCommand(["^(?:#|＃)?启用命令\\s+(.+)$", { key: "enable-cmd", example: "启用命令 bilibili:video", desc: "启用指定命令（插件名支持别名，仅主人可用，重载插件后生效）" }], async ctx => {
    if (!ctx.isMaster) return false

    const rawInput = String(ctx?.msg || "").replace(/^(?:#|＃)?启用命令\s+/, "").trim()
    if (!rawInput) {
      return await ctx.reply("用法：启用命令 <插件名>:<命令key>")
    }

    const commandKey = await resolveCommandKey(rawInput)
    if (!commandKey) {
      return await ctx.reply(`无法解析命令：${rawInput}`)
    }

    const botCfg = cfg.getConfig("bot") || {}
    const disabledCommands = botCfg?.plugin_control?.disabled_commands || []

    if (!disabledCommands.includes(commandKey)) {
      return await ctx.reply(`命令 ${commandKey} 未被禁用`)
    }

    const newDisabledCommands = disabledCommands.filter(item => item !== commandKey)
    cfg.setConfigValue("bot", "plugin_control", {
      ...botCfg?.plugin_control,
      disabled_commands: newDisabledCommands,
    })

    return await ctx.reply(`已启用命令：${commandKey}\n重载插件后生效`)
  })

  // 查看已禁用插件命令
  bot.registerCommand(["^(?:#|＃)?查看禁用插件$", { key: "list-disabled-plugins", example: "查看禁用插件", desc: "查看所有已禁用的插件列表（仅主人可用）" }], async ctx => {
    if (!ctx.isMaster) return false

    const botCfg = cfg.getConfig("bot") || {}
    const disabledPlugins = botCfg?.plugin_control?.disabled_plugins || []

    if (disabledPlugins.length === 0) {
      return await ctx.reply("当前没有禁用的插件")
    }

    return await ctx.reply(`已禁用的插件：\n${disabledPlugins.join("\n")}`)
  })

  // 查看已禁用命令命令
  bot.registerCommand(["^(?:#|＃)?查看禁用命令$", { key: "list-disabled-cmds", example: "查看禁用命令", desc: "查看所有已禁用的命令列表（仅主人可用）" }], async ctx => {
    if (!ctx.isMaster) return false

    const botCfg = cfg.getConfig("bot") || {}
    const disabledCommands = botCfg?.plugin_control?.disabled_commands || []

    if (disabledCommands.length === 0) {
      return await ctx.reply("当前没有禁用的命令")
    }

    return await ctx.reply(`已禁用的命令：\n${disabledCommands.join("\n")}`)
  })

  // 查看所有插件命令
  bot.registerCommand(["^(?:#|＃)?查看插件列表$", { key: "list-plugins", example: "查看插件列表", desc: "查看所有已加载的插件列表（仅主人可用）" }], async ctx => {
    if (!ctx.isMaster) return false

    const plugins = ctx.baseBot?.pluginCatalog || {}
    const pluginList = Object.values(plugins).map(p => `${p.name} (${p.title})`)

    if (pluginList.length === 0) {
      return await ctx.reply("当前没有加载任何插件")
    }

    return await ctx.reply(`已加载的插件：\n${pluginList.join("\n")}`)
  })

  // 查看插件命令列表命令
  bot.registerCommand(["^(?:#|＃)?查看插件命令\\s+(.+)$", { key: "list-plugin-cmds", example: "查看插件命令 set", desc: "查看指定插件的所有命令列表（仅主人可用）" }], async ctx => {
    if (!ctx.isMaster) return false

    const userInput = String(ctx?.msg || "").replace(/^(?:#|＃)?查看插件命令\s+/, "").trim()
    if (!userInput) {
      return await ctx.reply("用法：查看插件命令 <插件名或别名>")
    }

    const resolvedName = await resolvePluginFolderName(userInput)
    const pluginName = resolvedName || userInput

    const plugins = ctx.baseBot?.plugins || {}
    const commandList = Object.values(plugins)
      .filter(p => p.plugin === pluginName)
      .map(p => {
        const keyLabel = p.key ? `[${p.key}] ` : ""
        const regLabel = p.reg || "(自动触发)"
        return `${keyLabel}${regLabel}`
      })

    if (commandList.length === 0) {
      return await ctx.reply(`插件 ${pluginName} 没有注册任何命令`)
    }

    return await ctx.reply(`插件 ${pluginName} 的命令：\n${commandList.join("\n")}`)
  })

  // 荨鹿web登录指令（仅主人可用，生成带token的web登录链接）
  function getWebuiTokens() {
    if (!globalThis.__xunlu_webui_tokens) {
      globalThis.__xunlu_webui_tokens = new Map()
      // 每5分钟清理过期token
      setInterval(() => {
        const now = Date.now()
        for (const [t, exp] of globalThis.__xunlu_webui_tokens) {
          if (exp <= now) globalThis.__xunlu_webui_tokens.delete(t)
        }
      }, 300000).unref()
    }
    return globalThis.__xunlu_webui_tokens
  }

function getServerHostIp() {
  const interfaces = os.networkInterfaces()
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue
    for (const addr of addrs) {
      if (addr.family === "IPv4" && !addr.internal) return addr.address
    }
  }
  return "127.0.0.1"
}

  bot.registerCommand(["^(?:#|＃)?荨鹿web登录$", { key: "webui-login", desc: "生成带token的Web管理后台登录链接（仅主人可用，30分钟有效）" }], async ctx => {
    if (!ctx.isMaster) return false

    const botCfg = cfg.getConfig("bot") || {}
    const rawHost = botCfg.webui_host || process.env.XUNLU_WEBUI_HOST || "127.0.0.1"
    const host = rawHost === "0.0.0.0" || rawHost === "::" ? getServerHostIp() : rawHost
    const port = botCfg.webui_port || process.env.XUNLU_WEBUI_PORT || 9191
    const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    const tokens = getWebuiTokens()
    tokens.set(token, Date.now() + 1800000) // 30分钟过期

    const url = `http://${host}:${port}/webui?token=${token}`
    const masterQQ = ctx?.self_id || ctx?.bot?.uin

    try {
      if (masterQQ && typeof ctx?.bot?.pickFriend === "function") {
        const friend = ctx.bot.pickFriend(Number(masterQQ))
        await friend.sendMsg(`荨鹿Web管理后台登录链接（30分钟有效）：\n${url}`)
        return true
      }
      if (typeof ctx?.sendPrivateMsg === "function") {
        await ctx.sendPrivateMsg(masterQQ, `荨鹿Web管理后台登录链接（30分钟有效）：\n${url}`)
        return true
      }
    } catch {}

    return await ctx.reply(`Web管理后台登录链接（30分钟有效）：\n${url}`)
  })
}

export function onBotEvent(event) {
  console.log("[example-plugin] received bot event:", event)
}
