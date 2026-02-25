import { createRequire } from "module"
const require = createRequire(import.meta.url)
const { exec } = require("child_process")
class ffmpeg {
  checkEnv() {
    return new Promise((resolve, reject) => {
      exec("ffmpeg -version", err => {
        if (err) {
          logger.error("ffmepg未安装")
          resolve(false)
        }
        resolve(true)
      })
    })
  }

  VideoComposite(path = "", path2 = "", resultPath = "", suc, faith = () => {}) {
    exec(`ffmpeg -y -i ${path} -i ${path2} -c copy ${resultPath}`, async function (err) {
      if (err) {
        logger.error("合成失败了", err)
        await faith()
      } else {
        logger.info("成功合成了")
        await suc()
      }
    })
  }
}

export default new ffmpeg()
