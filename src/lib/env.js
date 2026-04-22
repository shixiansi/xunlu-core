import { getRuntimeContext } from "../runtime/runtime-context.js"

class XunLuEnvCompat {
  get package() {
    return getRuntimeContext().packageInfo
  }

  get CurEnv() {
    return getRuntimeContext().currentEnv
  }

  get RootPath() {
    return getRuntimeContext().rootPath
  }
}

export default new XunLuEnvCompat()
