import cfg from "../../lib/config.js"
import timer from "../../utils/timer.js"
import { createClient as createRedisClient } from "redis"
import { exec } from "node:child_process"

const REDIS_START_COMMAND = "redis-server --save 900 1 --save 300 10 --daemonize yes"

function getLogger(loggerLike = globalThis.logger || console) {
  return {
    info: typeof loggerLike.info === "function" ? loggerLike.info.bind(loggerLike) : () => {},
    error: typeof loggerLike.error === "function" ? loggerLike.error.bind(loggerLike) : () => {},
    red: typeof loggerLike.red === "function" ? loggerLike.red.bind(loggerLike) : value => value,
    blue: typeof loggerLike.blue === "function" ? loggerLike.blue.bind(loggerLike) : value => value,
  }
}

function buildRedisUrl(rc = {}) {
  const redisUn = rc.username || ""
  let redisPw = rc.password ? `:${rc.password}` : ""
  if (rc.username || rc.password) redisPw += "@"
  return `redis://${redisUn}${redisPw}${rc.host}:${rc.port}/${rc.db}`
}

async function getRedisStartCommand({ platform = process.platform, execCommand = execSync } = {}) {
  return REDIS_START_COMMAND + (await aarch64({ platform, execCommand }))
}

/**
 * 初始化全局redis客户端
 */
export default async function redisInit(options = {}) {
  const {
    config = cfg,
    redisConfig = config.getConfig("redis") || {},
    createClient = createRedisClient,
    execCommand = execSync,
    sleep = timer.sleep,
    logger: loggerLike,
    platform = process.platform,
    exit = () => process.exit(),
    setGlobalClient = client => {
      global.redis = client
    },
  } = options

  const log = getLogger(loggerLike)
  const redisUrl = buildRedisUrl(redisConfig)
  let client = createClient({ url: redisUrl })

  try {
    log.info(`正在连接 ${log.blue(redisUrl)}`)
    await client.connect()
  } catch (err) {
    log.error(`Redis 错误：${log.red(err)}`)

    const cmd = await getRedisStartCommand({ platform, execCommand })
    log.info("正在启动 Redis...")
    await execCommand(cmd)
    await sleep(1000)

    try {
      client = createClient({ url: redisUrl })
      await client.connect()
    } catch (err) {
      log.error(`Redis 错误：${log.red(err)}`)
      log.error(`请先启动 Redis：${log.blue(cmd)}`)
      return exit()
    }
  }

  client.on("error", async err => {
    log.error(`Redis 错误：${log.red(err)}`)
    const cmd = await getRedisStartCommand({ platform, execCommand })
    log.error(`请先启动 Redis：${cmd}`)
    return exit()
  })

  /** 全局变量 redis */
  setGlobalClient(client)
  log.info("Redis 连接成功")
  return client
}

async function aarch64({ platform = process.platform, execCommand = execSync } = {}) {
  if (platform == "win32") return ""
  /** 判断arch */
  const arch = await execCommand("uname -m")
  if (arch.stdout && arch.stdout.includes("aarch64")) {
    /** 判断redis版本 */
    let v = await execCommand("redis-server -v")
    if (v.stdout) {
      v = v.stdout.match(/v=(\d)./)
      /** 忽略arm警告 */
      if (v && v[1] >= 6) return " --ignore-warnings ARM64-COW-BUG"
    }
  }
  return ""
}

function execSync(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr })
    })
  })
}
