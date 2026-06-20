import { createRequire } from "module"
import lodash from "lodash"
import env from "../../../lib/env.js"
import { getPlatformLogger, getPlatformRedis } from "../../../runtime/platform-services.js"
const require = createRequire(import.meta.url)
const { exec, execFile, execFileSync } = require("child_process")

// 全局状态：防止重复更新
let uping = false
// 插件常量配置
const PLUGIN_CONFIG = {
  typeName: "荨鹿核心",
  key: "xunlu-core",
  pluginDir: "xunlu-core",
  repoUrl: "https://github.com/shixiansi/xunlu-core",
}

const pluginPath = env.CurEnv == "xunlu-core" ? "./" : `./plugins/${PLUGIN_CONFIG.pluginDir}/`

function getPlatformBotApi() {
  return globalThis.xunluCore?.bot?.api || globalThis.xunluCore?.bot?.getRuntimeBot?.() || null
}

function getGitCwd(plugin = "") {
  return plugin ? pluginPath : undefined
}

function execFileCmd(command, args = [], options = {}) {
  return new Promise(resolve => {
    execFile(command, args, { windowsHide: true, ...options }, (error, stdout, stderr) => {
      resolve({ error, stdout: stdout.toString(), stderr: stderr.toString() })
    })
  })
}

function execGitSync(args = [], options = {}) {
  return execFileSync("git", args, {
    encoding: "utf-8",
    windowsHide: true,
    ...options,
  })
}

function buildGitUpdateArgs(isForce = false) {
  return isForce ? ["pull", "--rebase", "--allow-unrelated-histories"] : ["pull", "--no-rebase"]
}

async function getDirtyWorktree(cwd = pluginPath) {
  const ret = await execFileCmd("git", ["status", "--porcelain"], { cwd })
  if (ret.error) return { error: ret.error, stdout: ret.stdout, stderr: ret.stderr, dirty: true }
  return { error: null, stdout: ret.stdout, stderr: ret.stderr, dirty: Boolean(ret.stdout.trim()) }
}

async function runGitUpdate(isForce = false) {
  return await execFileCmd("git", buildGitUpdateArgs(isForce), { cwd: pluginPath })
}
/**
 * 初始化重启状态检查（原init逻辑）
 */
async function initRestartStatus() {
  console.log("执行更新了")

  const redisClient = getPlatformRedis()
  const botApi = getPlatformBotApi()
  const logger = getPlatformLogger()
  let restart = await redisClient?.get?.(PLUGIN_CONFIG.key)
  console.log(restart)

  if (restart && process.argv[1].includes("pm2")) {
    restart = JSON.parse(restart)
    let time = restart.time || new Date().getTime()
    time = (new Date().getTime() - time) / 1000
    let msg = `重启成功：耗时${time.toFixed(2)}秒`

    try {
      if (restart.isGroup) {
        await botApi?.sendMessage?.({ group_id: restart.id }, msg)
      } else {
        await botApi?.sendMessage?.(String(restart.id), msg)
      }
      await redisClient?.del?.(PLUGIN_CONFIG.key)
    } catch (error) {
      logger.error(`[荨鹿更新] 重启成功通知失败：${error.stack}`)
    }
  }
}

/**
 * 检查Git是否安装
 * @param {Object} ctx 命令上下文
 */
async function checkGit(ctx) {
  const logger = getPlatformLogger()
  try {
    let ret = execGitSync(["--version"])
    if (!ret || !ret.includes("git version")) {
      await ctx.reply("请先安装git")
      return false
    }
    return true
  } catch (error) {
    await ctx.reply("Git命令执行失败，请检查Git是否正确安装")
    logger.error(`[荨鹿更新] 检查Git失败：${error.stack}`)
    return false
  }
}

/**
 * 异步执行shell命令
 * @param {string} cmd 命令字符串
 */
async function execSyncCmd(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { windowsHide: true }, (error, stdout, stderr) => {
      resolve({ error, stdout: stdout.toString(), stderr: stderr.toString() })
    })
  })
}

/**
 * 获取当前commitId
 * @param {string} plugin 插件目录
 */
async function getCommitId(plugin = "") {
  const logger = getPlatformLogger()
  try {
    let commitId = execGitSync(["rev-parse", "--short", "HEAD"], { cwd: getGitCwd(plugin) })
    return lodash.trim(commitId)
  } catch (error) {
    logger.error(`[荨鹿更新] 获取CommitId失败：${error.stack}`)
    return ""
  }
}

/**
 * 获取最后更新时间
 * @param {string} plugin 插件目录
 */
async function getUpdateTime(plugin = "") {
  const logger = getPlatformLogger()
  try {
    let time = execGitSync(
      ["log", "-1", "--oneline", "--pretty=format:%cd", "--date=format:%m-%d %H:%M"],
      { cwd: getGitCwd(plugin) },
    )
    return lodash.trim(time)
  } catch (error) {
    logger.error(`[荨鹿更新] 获取更新时间失败：${error.toString()}`)
    return "获取时间失败"
  }
}

/**
 * Git错误处理
 * @param {Object} ctx 命令上下文
 * @param {Error} err 错误对象
 * @param {string} stdout 命令输出
 */
async function handleGitError(ctx, err, stdout) {
  let msg = "更新失败！"
  let errMsg = err.toString()

  if (errMsg.includes("Timed out")) {
    let remote = errMsg.match(/'(.+?)'/g)?.[0]?.replace(/'/g, "") || "未知仓库"
    await ctx.reply(msg + `\n连接超时：${remote}`)
    return
  }

  if (/Failed to connect|unable to access/g.test(errMsg)) {
    let remote = errMsg.match(/'(.+?)'/g)?.[0]?.replace(/'/g, "") || "未知仓库"
    await ctx.reply(msg + `\n连接失败：${remote}`)
    return
  }

  if (errMsg.includes("be overwritten by merge")) {
    await ctx.reply(
      msg + `存在冲突：\n${errMsg}\n` + "请解决冲突后再更新，或者执行#荨鹿强制更新，放弃本地修改",
    )
    return
  }

  if (stdout.includes("CONFLICT")) {
    await ctx.reply([
      msg + "存在冲突\n",
      errMsg,
      stdout,
      "\n请解决冲突后再更新，或者执行#荨鹿强制更新，放弃本地修改",
    ])
    return
  }

  await ctx.reply([errMsg, stdout])
}

/**
 * 获取更新日志
 * @param {Object} ctx 命令上下文
 * @param {string} plugin 插件目录
 * @param {string} oldCommitId 更新前的CommitId（新增参数）
 */
async function getUpdateLog(ctx, plugin = "", oldCommitId = "") {
  const logger = getPlatformLogger()
  plugin = plugin || PLUGIN_CONFIG.pluginDir
  // 修复：去掉--oneline，避免和--pretty冲突
  let logAll
  try {
    logAll = execGitSync(
      ["log", "-20", "--pretty=format:%h||[%cd]  %s", "--date=format:%m-%d %H:%M"],
      { cwd: getGitCwd(plugin) },
    )
  } catch (error) {
    logger.error(`[荨鹿更新] 获取更新日志失败：${error.toString()}`)
    await ctx.reply(error.toString())
    return ""
  }

  if (!logAll) return ""

  // 过滤空行，避免分割后出现异常数据
  logAll = logAll.split("\n").filter(line => line.trim())
  console.log(logAll)

  // 优先使用传入的oldCommitId，没有则重新获取（兼容旧调用）
  let commitId = oldCommitId || (await getCommitId(plugin))
  console.log("commitId:", commitId)

  // 兼容CommitId获取失败的情况
  if (!commitId) {
    await ctx.reply("⚠️ 无法获取当前版本CommitId，将展示最新20条日志")
  }

  let log = []
  for (let str of logAll) {
    str = str.split("||")
    console.log(str)

    // 跳过分割异常的数据
    if (!str[0] || !str[1]) continue

    // 只有commitId有效时才终止遍历
    if (commitId && str[0] == commitId) break

    // 放宽过滤条件，只过滤纯合并分支的提交
    if (str[1]?.trim() === "Merge branch") continue

    log.push(str[1])
  }

  if (log.length <= 0) return ""

  let line = log.length
  log = log.join("\n\n")
  console.log("log日常：", log)

  let end = `更多详细信息，请前往GitHub查看\n${PLUGIN_CONFIG.repoUrl}`
  let forwardMsg = await ctx.makeGroupForwardMsg(
    ctx,
    [log, end],
    `${plugin || "Qianyu-Bot"}更新日志，共${line}条`,
  )
  console.log("更新的forward", forwardMsg)

  return forwardMsg
}

/**
 * 检查pnpm/npm
 */
async function checkPnpm() {
  let npm = "npm"
  let ret = await execSyncCmd("pnpm -v")
  if (ret.stdout) npm = "pnpm"
  return npm
}

/**
 * 重启应用
 * @param {Object} ctx 命令上下文
 */
async function restartApp(ctx) {
  const redisClient = getPlatformRedis()
  const logger = getPlatformLogger()
  await ctx.reply("开始执行重启，请稍等...")
  logger.mark(`${ctx.logFnc} 开始执行重启，请稍等...`)

  let data = JSON.stringify({
    isGroup: !!ctx.isGroup,
    id: ctx.isGroup ? ctx.group_id : ctx.user_id,
    time: new Date().getTime(),
  })

  let npm = await checkPnpm()

  try {
    await redisClient?.set?.(PLUGIN_CONFIG.key, data, { EX: 120 })
    let cm = `${npm} start`

    if (process.argv[1].includes("pm2")) {
      cm = `${npm} run restart`
    } else {
      await ctx.reply("当前为前台运行，重启将转为后台...")
    }
    console.log(cm)

    exec(cm, { windowsHide: true }, (error, stdout, stderr) => {
      console.log(stdout)
      console.log(error)
      console.log(stderr)

      if (error) {
        redisClient?.del?.(PLUGIN_CONFIG.key)
        ctx.reply(`操作失败！\n${error.stack}`)
        logger.error(`[荨鹿更新] 重启失败\n${error.stack}`)
      } else if (stdout) {
        logger.mark("重启成功，运行已由前台转为后台")
        logger.mark(`查看日志请用命令：${npm} run log`)
        logger.mark(`停止后台运行命令：${npm} stop`)
        process.exit()
      }
    })
  } catch (error) {
    await redisClient?.del?.(PLUGIN_CONFIG.key)
    let e = error.stack ?? error
    await ctx.reply(`操作失败！\n${e}`)
  }

  return true
}

/**
 * 执行更新逻辑
 * @param {Object} ctx 命令上下文
 * @param {boolean} isForce 是否强制更新
 */
async function runUpdate(ctx, isForce = false) {
  // 权限校验：仅主人可执行
  if (!ctx.isMaster) return false
  // 防重复更新
  if (uping) {
    await ctx.reply("已有命令更新中..请勿重复操作")
    return false
  }

  // 检查Git
  if (!(await checkGit(ctx))) return false

  const dirty = await getDirtyWorktree(pluginPath)
  if (dirty.error) {
    await ctx.reply(`Update failed: unable to check local changes\n${dirty.stderr || dirty.error.message}`)
    return false
  }
  if (dirty.dirty) {
    await ctx.reply(
      [
        "Update cancelled: local changes were detected.",
        "Please commit or back up local changes before updating.",
        dirty.stdout.trim(),
      ].filter(Boolean).join("\n"),
    )
    return false
  }

  // 构建更新命令
  let type = isForce ? "强制更新" : "更新"

  // 记录旧CommitId（现在真正用上了）
  const oldCommitId = await getCommitId(PLUGIN_CONFIG.pluginDir)
  // 优化：日志里加入oldCommitId，方便溯源
  logger.mark(
    `${ctx.logFnc} 开始${type}：${PLUGIN_CONFIG.typeName} | 更新前CommitId：${oldCommitId || "未知"}`,
  )

  await ctx.reply(`开始#${type}${PLUGIN_CONFIG.typeName}`)
  uping = true
  let ret = await runGitUpdate(isForce)
  uping = false

  // 处理更新错误
  if (ret.error) {
    logger.mark(
      `${ctx.logFnc} 更新失败：${PLUGIN_CONFIG.typeName} | 更新前CommitId：${oldCommitId || "未知"}`,
    )
    await handleGitError(ctx, ret.error, ret.stdout)
    return false
  }

  // 获取更新时间
  let updateTime = await getUpdateTime(PLUGIN_CONFIG.pluginDir)

  // 处理更新结果
  if (/Already up|已经是最新/g.test(ret.stdout)) {
    await ctx.reply(`${PLUGIN_CONFIG.typeName}已经是最新\n最后更新时间：${updateTime}`)
    return true
  } else {
    await ctx.reply(`${PLUGIN_CONFIG.typeName}更新成功\n更新时间：${updateTime}`)
    // 优化：把oldCommitId传给getUpdateLog，避免重复获取
    let log = await getUpdateLog(ctx, PLUGIN_CONFIG.pluginDir, oldCommitId)
    console.log(log)

    if (log) await ctx.reply(log)
    // 执行重启
    setTimeout(async () => await restartApp(ctx), 2000)
    return true
  }
}

/**
 * 注册命令（核心入口）
 * @param {Object} bot 机器人实例
 */
export async function onEnable(pluginDef) {
  try {
    await initRestartStatus()
  } catch (err) {
    logger.error(`[荨鹿更新] 初始化失败：${err.stack}`)
  }
}

export function register(bot) {
  if (!bot || !bot.registerCommand) return
  const logger = getPlatformLogger()

  // 注册「荨鹿更新」命令
  bot.registerCommand(["^荨鹿更新$"], async ctx => {
    await runUpdate(ctx, false)
  })

  // 注册「荨鹿强制更新」命令
  bot.registerCommand(["^荨鹿强制更新$"], async ctx => {
    await runUpdate(ctx, true)
  })

  // 注册「荨鹿更新日志」命令
  bot.registerCommand(["^荨鹿更新日志$"], async ctx => {
    let log = await getUpdateLog(ctx, "", "")
    await ctx.reply(log || "暂无更新日志")
  })

  logger.mark("[荨鹿更新] 命令注册完成：荨鹿更新、荨鹿强制更新、荨鹿更新日志")
}

/**
 * 机器人事件监听
 * @param {Object} event 事件对象
 */
export function onBotEvent(event) {
  const logger = getPlatformLogger()
  // 可根据需要处理机器人事件（如启动、消息等）
  // 示例：监听机器人启动事件
  if (event.type === "bot_ready") {
    logger.mark("[荨鹿更新] 机器人已就绪，更新功能可用")
  }
  console.log("[qianyu-update] received bot event:", event)
}
console.log(process.argv[1])
