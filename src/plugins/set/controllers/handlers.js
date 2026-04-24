import fs from "fs"

import cfg from "../../../lib/config.js"
import {
  formatGroupPrefixState,
  setCurrentGroupPrefix,
  setCurrentGroupPrefixEnabled,
} from "../model/prefix-config.js"

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
  bot.registerCommand(["^(|#)设置尾缀"], async ctx => {
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

  bot.registerCommand(["^(|#)我是什么bot"], async ctx => {
    const name = JSON.parse(fs.readFileSync("./package.json")).name
    ctx.reply(`我是运行在${name}的${ctx.adapterType}_Bot`)
  })

  bot.registerCommand(["^(?:#|＃)?设置前缀\\s+(.+)$"], async ctx => {
    if (!(await ensureGroupMaster(ctx))) return true

    const prefix = String(ctx?.msg || "").replace(/^(?:#|＃)?设置前缀\s+/, "").trim()
    if (!prefix) {
      return await ctx.reply("用法：设置前缀 <前缀文本>")
    }

    const state = await setCurrentGroupPrefix(ctx.group_id, prefix)
    return await ctx.reply(`已将当前群前缀设置为：${state.prefix}\n${formatGroupPrefixState(state)}`)
  })

  bot.registerCommand(["^(?:#|＃)?开启群前缀$"], async ctx => {
    if (!(await ensureGroupMaster(ctx))) return true

    const state = await setCurrentGroupPrefixEnabled(ctx.group_id, true)
    return await ctx.reply(`已开启当前群前缀限制\n${formatGroupPrefixState(state)}`)
  })

  bot.registerCommand(["^(?:#|＃)?关闭群前缀$"], async ctx => {
    if (!(await ensureGroupMaster(ctx))) return true

    const state = await setCurrentGroupPrefixEnabled(ctx.group_id, false)
    return await ctx.reply(`已关闭当前群前缀限制\n${formatGroupPrefixState(state)}`)
  })
}

export function onBotEvent(event) {
  console.log("[example-plugin] received bot event:", event)
}
