import fs from "fs"

class xunLuEnv {
  get package() {
    return JSON.parse(fs.readFileSync("package.json", "utf-8"))
  }

  //获取当前环境
  get CurEnv() {
    const YunZai = ["YunZai", "yunzai"]
    if (YunZai.find(i => this.package.name.includes(i))) {
      return "QQBot-YunZai"
    } else if (this.package.name == "xunlu-core") {
      return "xunlu-core"
    }
  }

  get RootPath() {
    if (this.CurEnv == "QQBot-YunZai") {
      return process.cwd() + "/plugins/xunlu-core/"
    } else {
      return process.cwd() + "/"
    }
  }
}
export default new xunLuEnv()
