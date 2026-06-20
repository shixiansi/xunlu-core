import fetch from "node-fetch"
import qrcode from "qrcode"
import fs from "fs"
import path from "path"
import { getRuntimePaths } from "../../../runtime/runtime-context.js"
import { getPlatformRedis } from "../../../runtime/platform-services.js"

class BiliBiliQRLogin {
  constructor() {
    this.qrcodeKey = null
    this.qrImagePath = path.join(
      getRuntimePaths().getPluginTempDir("bilibili"),
      "bilibili-login-qrcode.png",
    )
  }

  parseCookies(cookiesArray) {
    if (!cookiesArray) return {}
    return cookiesArray.reduce((acc, cookieStr) => {
      const parts = cookieStr.split(";")[0].split("=")
      if (parts.length >= 2) {
        acc[parts[0]] = parts[1]
      }
      return acc
    }, {})
  }

  async generateQRImage(isBase64 = false) {
    try {
      const response = await fetch(
        "https://passport.bilibili.com/x/passport-login/web/qrcode/generate",
      )
      let rep = await response.json()
      if (rep.code !== 0) throw new Error("二维码获取失败")

      this.qrcodeKey = rep.data.qrcode_key
      const qrUrl = rep.data.url
      if (!isBase64) {
        await qrcode.toFile(this.qrImagePath, qrUrl, {
          width: 300,
          margin: 2,
          errorCorrectionLevel: "H",
        })
        return { filePath: this.qrImagePath }
      }
      const base64 = await qrcode.toDataURL(qrUrl)
      return { base64 }
    } catch (error) {
      console.error("生成二维码失败：", error.message)
      throw error
    }
  }

  async pollLoginStatus(getUserInfo) {
    if (!this.qrcodeKey) throw new Error("未生成二维码")
    try {
      const response = await fetch(
        `https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${this.qrcodeKey}`,
      )
      let res = await response.json()
      console.log(res)
      switch (res.data.code) {
        case 0: // 登录成功
          this.cleanupQRFile()
          await getPlatformRedis()?.set?.(
            "bilibili_cookie",
            JSON.stringify(this.parseCookies(response.headers.raw()["set-cookie"])),
          )
          return {
            code: 200,
            userInfo: await getUserInfo(),
          }
          return // 立即返回避免继续执行
        case 86038: // 二维码过期
          this.cleanupQRFile()
          return {
            code: 86038,
            msg: "二维码已过期",
          }
        case 86090:
          return {
            code: 86090,
            msg: "已扫码未确认",
          }
        default:
          console.log(`状态码 ${res.code}: ${this.getStatusText(res.code)}`)
      }
    } catch (error) {
      return error
    }
  }

  cleanupQRFile() {
    if (fs.existsSync(this.qrImagePath)) {
      fs.unlinkSync(this.qrImagePath)
      console.log("已清理二维码图片")
    }
  }

  getStatusText(code) {
    const statusMap = {
      86101: "等待扫码",
      86090: "已扫码未确认",
    }
    return statusMap[code] || "未知状态"
  }

  async login() {
    try {
      await this.generateQRImage()
      console.log("请打开B站APP扫描二维码图片")
      return await this.pollLoginStatus()
    } catch (error) {
      console.error("登录失败：", error.message)
      throw error
    }
  }
}

export default new BiliBiliQRLogin()
