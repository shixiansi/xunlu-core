import { createRequire } from "module"

const require = createRequire(import.meta.url)
const { execFile, spawn } = require("child_process")

class ffmpeg {
  checkEnv() {
    return new Promise(resolve => {
      execFile("ffmpeg", ["-version"], err => {
        if (err) {
          logger.error("ffmepg鏈畨瑁?")
          resolve(false)
          return
        }
        resolve(true)
      })
    })
  }

  VideoComposite(path = "", path2 = "", resultPath = "", suc, faith = () => {}) {
    const child = spawn("ffmpeg", ["-y", "-i", path, "-i", path2, "-c", "copy", resultPath], {
      stdio: "ignore",
      windowsHide: true,
    })

    child.once("error", async err => {
      logger.error("鍚堟垚澶辫触浜?", err)
      await faith(err)
    })

    child.once("close", async code => {
      if (code !== 0) {
        logger.error("鍚堟垚澶辫触浜?")
        await faith(new Error(`ffmpeg exited with code ${code}`))
        return
      }
      logger.info("鎴愬姛鍚堟垚浜?")
      await suc()
    })
  }
}

export default new ffmpeg()
