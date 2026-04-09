import { createRequire } from "module"

const require = createRequire(import.meta.url)
const { execFile, spawn } = require("child_process")

class ffmpeg {
  run(args = [], { label = "ffmpeg" } = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn("ffmpeg", args, {
        stdio: "ignore",
        windowsHide: true,
      })

      child.once("error", err => {
        logger.error(`${label}失败`, err)
        reject(err)
      })

      child.once("close", code => {
        if (code !== 0) {
          const err = new Error(`ffmpeg exited with code ${code}`)
          logger.error(`${label}失败`, err)
          reject(err)
          return
        }
        resolve(true)
      })
    })
  }

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
    this.run(["-y", "-i", path, "-i", path2, "-c", "copy", resultPath], { label: "视频合成" })
      .then(async () => {
        logger.info("鎴愬姛鍚堟垚浜?")
        await suc()
      })
      .catch(async err => {
        logger.error("鍚堟垚澶辫触浜?", err)
        await faith(err)
      })
  }

  async saveVideoClip(input = "", resultPath = "", options = {}) {
    const durationSec = Math.max(1, Math.floor(Number(options.durationSec) || 10))
    return await this.run(
      [
        "-y",
        "-i",
        input,
        "-t",
        String(durationSec),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        resultPath,
      ],
      { label: "直播切片" },
    )
  }
}

export default new ffmpeg()
