import fs from "fs"
import path from "path"

import cfg from "../../../lib/config.js"
import { getRuntimePaths } from "../../../runtime/runtime-context.js"
import {
  formatGroupPrefixState,
  setCurrentGroupPrefix,
  setCurrentGroupPrefixEnabled,
} from "../model/prefix-config.js"

function resolvePluginFolderName(userInput) {
  const input = String(userInput || "").trim().toLowerCase()
  if (!input) return null

  // 直接文件夹名匹配（相对于 xunlu-core 根目录）
  const pluginDir = path.join(getRuntimePaths().rootDir, "src", "plugins", input)
  if (fs.existsSync(pluginDir) && fs.statSync(pluginDir).isDirectory()) return input

  // 别名/短名匹配（从 pluginCatalog 读取）
  const catalog = globalThis.__xunlu_core?.commandBus?.getCatalog?.() || {}
  for (const [name, meta] of Object.entries(catalog)) {
    const aliases = Array.isArray(meta.aliases) ? meta.aliases : []
    const shortName = meta.pluginShortName || meta.shortName || ""
    if (name.toLowerCase() === input) return name
    if (shortName.toLowerCase() === input) return name
    if (aliases.some(a => String(a).toLowerCase() === input)) return name
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
  bot.registerCommand(["^(|#)设置尾缀", { example: "设置尾缀 xxx", desc: "设置机器人回复尾缀" }], async ctx => {
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

  bot.registerCommand(["^(|#)我是什么bot", { example: "我是什么bot", desc: "查看当前机器人类型" }], async ctx => {
    const name = JSON.parse(fs.readFileSync("./package.json")).name
    ctx.reply(`我是运行在${name}的${ctx.adapterType}_Bot`)
  })

  bot.registerCommand(["^(?:#|＃)?设置前缀\\s+(.+)$", { example: "设置前缀 #", desc: "设置群聊前缀（仅群主可用）" }], async ctx => {
    if (!(await ensureGroupMaster(ctx))) return true

    const prefix = String(ctx?.msg || "").replace(/^(?:#|＃)?设置前缀\s+/, "").trim()
    if (!prefix) {
      return await ctx.reply("用法：设置前缀 <前缀文本>")
    }

    const state = await setCurrentGroupPrefix(ctx.group_id, prefix)
    return await ctx.reply(`已将当前群前缀设置为：${state.prefix}\n${formatGroupPrefixState(state)}`)
  })

  bot.registerCommand(["^(?:#|＃)?开启群前缀$", { example: "开启群前缀", desc: "开启当前群前缀限制（仅群主可用）" }], async ctx => {
    if (!(await ensureGroupMaster(ctx))) return true

    const state = await setCurrentGroupPrefixEnabled(ctx.group_id, true)
    return await ctx.reply(`已开启当前群前缀限制\n${formatGroupPrefixState(state)}`)
  })

  bot.registerCommand(["^(?:#|＃)?关闭群前缀$", { example: "关闭群前缀", desc: "关闭当前群前缀限制（仅群主可用）" }], async ctx => {
    if (!(await ensureGroupMaster(ctx))) return true

    const state = await setCurrentGroupPrefixEnabled(ctx.group_id, false)
    return await ctx.reply(`已关闭当前群前缀限制\n${formatGroupPrefixState(state)}`)
  })

  // 插件管理命令

  // 禁用插件命令
  bot.registerCommand(["^(?:#|＃)?禁用插件\\s+(.+)$", { example: "禁用插件 抖音", desc: "禁用指定插件（支持文件夹名/别名/短名，仅主人可用，重载插件后生效）" }], async ctx => {
    if (!ctx.isMaster) return false

    const userInput = String(ctx?.msg || "").replace(/^(?:#|＃)?禁用插件\s+/, "").trim()
    if (!userInput) {
      return await ctx.reply("用法：禁用插件 <插件名或别名>")
    }

    const pluginName = resolvePluginFolderName(userInput)
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
  bot.registerCommand(["^(?:#|＃)?启用插件\\s+(.+)$", { example: "启用插件 抖音", desc: "启用指定插件（支持文件夹名/别名/短名，仅主人可用，重载插件后生效）" }], async ctx => {
    if (!ctx.isMaster) return false

    const userInput = String(ctx?.msg || "").replace(/^(?:#|＃)?启用插件\s+/, "").trim()
    if (!userInput) {
      return await ctx.reply("用法：启用插件 <插件名或别名>")
    }

    const pluginName = resolvePluginFolderName(userInput)
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
  bot.registerCommand(["^(?:#|＃)?禁用命令\\s+(.+)$", { example: "禁用命令 set:示例", desc: "禁用指定命令（仅主人可用，重载插件后生效）" }], async ctx => {
    if (!ctx.isMaster) return false

    const commandKey = String(ctx?.msg || "").replace(/^(?:#|＃)?禁用命令\s+/, "").trim()
    if (!commandKey) {
      return await ctx.reply("用法：禁用命令 <插件名>:<命令正则> 或 <命令正则>")
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
  bot.registerCommand(["^(?:#|＃)?启用命令\\s+(.+)$", { example: "启用命令 set:示例", desc: "启用指定命令（仅主人可用，重载插件后生效）" }], async ctx => {
    if (!ctx.isMaster) return false

    const commandKey = String(ctx?.msg || "").replace(/^(?:#|＃)?启用命令\s+/, "").trim()
    if (!commandKey) {
      return await ctx.reply("用法：启用命令 <插件名>:<命令正则> 或 <命令正则>")
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
  bot.registerCommand(["^(?:#|＃)?查看禁用插件$", { example: "查看禁用插件", desc: "查看所有已禁用的插件列表（仅主人可用）" }], async ctx => {
    if (!ctx.isMaster) return false

    const botCfg = cfg.getConfig("bot") || {}
    const disabledPlugins = botCfg?.plugin_control?.disabled_plugins || []

    if (disabledPlugins.length === 0) {
      return await ctx.reply("当前没有禁用的插件")
    }

    return await ctx.reply(`已禁用的插件：\n${disabledPlugins.join("\n")}`)
  })

  // 查看已禁用命令命令
  bot.registerCommand(["^(?:#|＃)?查看禁用命令$", { example: "查看禁用命令", desc: "查看所有已禁用的命令列表（仅主人可用）" }], async ctx => {
    if (!ctx.isMaster) return false

    const botCfg = cfg.getConfig("bot") || {}
    const disabledCommands = botCfg?.plugin_control?.disabled_commands || []

    if (disabledCommands.length === 0) {
      return await ctx.reply("当前没有禁用的命令")
    }

    return await ctx.reply(`已禁用的命令：\n${disabledCommands.join("\n")}`)
  })

  // 查看所有插件命令
  bot.registerCommand(["^(?:#|＃)?查看插件列表$", { example: "查看插件列表", desc: "查看所有已加载的插件列表（仅主人可用）" }], async ctx => {
    if (!ctx.isMaster) return false

    const plugins = ctx.baseBot?.pluginCatalog || {}
    const pluginList = Object.values(plugins).map(p => `${p.name} (${p.title})`)

    if (pluginList.length === 0) {
      return await ctx.reply("当前没有加载任何插件")
    }

    return await ctx.reply(`已加载的插件：\n${pluginList.join("\n")}`)
  })

  // 查看插件命令列表命令
  bot.registerCommand(["^(?:#|＃)?查看插件命令\\s+(.+)$", { example: "查看插件命令 set", desc: "查看指定插件的所有命令列表（仅主人可用）" }], async ctx => {
    if (!ctx.isMaster) return false

    const pluginName = String(ctx?.msg || "").replace(/^(?:#|＃)?查看插件命令\s+/, "").trim()
    if (!pluginName) {
      return await ctx.reply("用法：查看插件命令 <插件名>")
    }

    const plugins = ctx.baseBot?.plugins || {}
    const commandList = Object.values(plugins)
      .filter(p => p.plugin === pluginName)
      .map(p => `${p.reg || "(空正则)"}`)

    if (commandList.length === 0) {
      return await ctx.reply(`插件 ${pluginName} 没有注册任何命令`)
    }

    return await ctx.reply(`插件 ${pluginName} 的命令：\n${commandList.join("\n")}`)
  })
}

export function onBotEvent(event) {
  console.log("[example-plugin] received bot event:", event)
}
