import puppeteer from "../component/puppeteer/puppeteer.js"
import lodash from "lodash"
import { segment } from "../Bot/segment.js"
import fs from "fs"
import Path from "path" // 新增：路径处理
import env from "../lib/env.js"
class Render {
  async render(plugin, tplPath, data = {}, cfg = {}) {
    // 修复：路径处理，避免空值
    if (!tplPath || typeof tplPath !== "string") {
      console.error("[Render] 无效的path参数")
      return false
    }

    // 处理路径（移除.html，过滤空值）
    tplPath = tplPath.replace(/.html$/, "")
    let paths = lodash.filter(tplPath.split("/"), p => !!p && typeof p === "string")
    if (paths.length === 0) {
      console.error("[Render] 路径解析后为空")
      return false
    }
    tplPath = paths.join("/")

    // 创建目录（修复路径拼接）
    const mkdir = check => {
      if (!check) return ""
      let currDir = Path.resolve(env.RootPath, "data")
      for (let p of check.split("/")) {
        if (!p) continue
        currDir = Path.join(currDir, p)
        if (!fs.existsSync(currDir)) {
          fs.mkdirSync(currDir, { recursive: true }) // 新增：递归创建
        }
      }
      return currDir
    }
    mkdir(`html/${plugin}/${tplPath}`)

    // 计算资源路径（修复重复../问题）
    const xunLuEnv = String(process.env.xunLuEnv || "")
    const resLevel = paths.length + (xunLuEnv.includes("YunZai") ? 3 : 3)
    let pluResPath =
      lodash.repeat("../", resLevel) +
      `${
        xunLuEnv.includes("YunZai") ? "plugins/xunlu-core/src/" : "src/"
      }plugins/${plugin}/resources/`

    // 渲染数据（修复tplFile路径）
    data = {
      ...data,
      _plugin: plugin,
      sys: { scale: 1 },
      _htmlPath: tplPath,
      pluResPath,
      tplFile: Path.resolve(
        env.RootPath,
        `${
          xunLuEnv.includes("YunZai") ? "src/" : "src/"
        }plugins/${plugin}/resources/${tplPath}.html`,
      ),
      saveId: data.saveId || data.save_id || paths[paths.length - 1],
      pageGotoParams: {
        waitUntil: "networkidle2",
      },
    }

    // 前置处理
    if (cfg.beforeRender) {
      const newData = cfg.beforeRender({ data })
      if (newData) data = newData
    }

    // 调试模式保存数据
    if (process.argv.includes("web-debug")) {
      let saveDir = mkdir(`ViewData/${plugin}`)
      let saveFile = Path.join(saveDir, `${data._htmlPath.split("/").join("_")}.json`)
      fs.writeFileSync(saveFile, JSON.stringify(data, null, 2))
    }

    // 截图
    console.log(`[Render] 开始截图：${plugin}/${tplPath}`)
    let base64 = await puppeteer.screenshot(`${plugin}/${tplPath}`, data)
    if (!base64) {
      console.error("[Render] 截图失败")
      return false
    }

    // 处理返回结果
    base64 = Array.isArray(base64) ? base64.map(item => segment.image(item)) : segment.image(base64)
    if (cfg.retType === "base64") {
      return base64
    }

    // 注：this.e未定义（需在实际调用时绑定上下文）
    let ret = true
    // if (cfg.recallMsg) {
    //   ret = await this.e.reply(base64, false, {});
    // } else {
    //   ret = await this.e.reply(base64);
    // }
    return cfg.retType === "msgId" ? ret : true
  }
}

export default new Render()
