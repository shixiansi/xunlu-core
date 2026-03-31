import fs from "node:fs"
import path from "node:path"

import lodash from "lodash"

import env from "../../../lib/env.js"

const DATA_DIR = path.resolve(env.RootPath, "data", "chuo")
const CONFIG_PATH = path.join(DATA_DIR, "config.json")

let cachedConfig = null
let cachedAt = 0

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

function readConfigFromDisk() {
  ensureDir()

  if (!fs.existsSync(CONFIG_PATH)) {
    const init = { enabled: true }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(init, null, 2), "utf8")
    return init
  }

  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8")
    const data = raw ? JSON.parse(raw) : null
    if (!data || typeof data !== "object") return { enabled: true }
    return { enabled: data.enabled !== false }
  } catch {
    return { enabled: true }
  }
}

function getConfig({ ttlMs = 5000 } = {}) {
  const now = Date.now()
  if (cachedConfig && now - cachedAt < ttlMs) return cachedConfig
  cachedConfig = readConfigFromDisk()
  cachedAt = now
  return cachedConfig
}
const textChuo = [
  "唔… 被戳到啦🥺 揉揉小脸蛋",
  "戳戳？是想贴贴我嘛～",
  "呀！软软的戳一下，心都化啦💓",
  "被戳戳啦，伸手贴贴๑・̀ㅂ・́و✧",
  "戳戳小脑袋，乖乖应一声～",
  "别戳啦别戳啦，再戳就鼓腮帮子咯！",
  "哼，戳我干嘛，是不是想引起我的注意😜",
  "戳戳戳，再戳我就躲起来啦～",
  "哎呀！别戳啦，我的小脑袋要被戳歪啦",
  "敢戳我？看我反手戳回去😝",
  "哇！被戳中啦～要不要和我玩呀？",
  "戳戳触发成功✨ 你的小可爱已上线",
  "戳戳乐开启！你戳一下，我冒个泡～",
  "收到你的戳戳信号📶 立马回应！",
  "戳戳～贴贴～我们是好朋友啦🥳",
  "呀，被轻轻戳了一下，软软的～",
  "戳戳？收到你的小互动啦✨",
  "慢悠悠冒头：是谁在戳我呀～",
  "软乎乎被戳中，眨眨眼不说话👀",
  "一份温柔的戳戳，查收啦～",
]
export function register(bot) {
  if (!bot || !bot.registerCommand) return
  bot.registerCommand(["", "notice.group.poke"], ctx => {
    console.log("触发戳一戳了", ctx)

    const cfg = getConfig()
    if (cfg.enabled === false) return false

    const targetId =
      ctx.target_id ??
      ctx.targetId ??
      ctx.receiver_id ??
      ctx.receiverId ??
      ctx.user_id
    if (String(targetId || "") !== String(ctx.self_id || "")) return false
    return ctx.reply(textChuo[lodash.random(0, textChuo.length - 1)])
  })
  console.log("[example-plugin] registered with bot shim")
}

export function onBotEvent(event) {
  console.log("[example-plugin] received bot event:", event)
}
