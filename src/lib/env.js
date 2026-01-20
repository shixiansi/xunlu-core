import Filemage from "../utils/Filemage.js";
const filemage = new Filemage();
class xunLuEnv {
  get package() {
    return filemage.getFileDataToJson("package.json");
  }

  //获取当前环境
  get CurEnv() {
    const YunZai = ["YunZai", "yunzai"];
    if (YunZai.find((i) => this.package.name.includes(i))) {
      return "QQBot-YunZai";
    } else if (this.package.name == "xunlu-core") {
    }
  }

  get RootPath() {
    if (this.CurEnv == "QQBot-YunZai") {
      return process.cwd() + "/plugins/xunlu-plugin/";
    } else {
      return process.cwd() + "/";
    }
  }
}
export default new xunLuEnv();
