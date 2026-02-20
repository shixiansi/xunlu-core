export default function getErrorMessage(code) {
  switch (Number(code)) {
    case -1:
      return "应用程序不存在或已被封禁"
    case -2:
      return "Access Key 错误"
    case -3:
      return "API 校验密匙错误"
    case -4:
      return "调用方对该 Method 没有权限"
    case -101:
      return "账号未登录"
    case -102:
      return "账号被封停"
    case -103:
      return "积分不足"
    case -104:
      return "硬币不足"
    case -105:
      return "验证码错误"
    case -106:
      return "账号非正式会员或在适应期"
    case -107:
      return "应用不存在或者被封禁"
    case -108:
      return "未绑定手机"
    case -110:
      return "未绑定手机"
    case -111:
      return "csrf 校验失败"
    case -112:
      return "系统升级中"
    case -113:
      return "账号尚未实名认证"
    case -114:
      return "请先绑定手机"
    case -115:
      return "请先完成实名认证"
    case -304:
      return "木有改动"
    case -307:
      return "撞车跳转"
    case -352:
      return "风控校验失败 (UA 或 wbi 参数不合法)"
    case -400:
      return "请求错误"
    case -401:
      return "未认证 (或非法请求)"
    case -403:
      return "访问权限不足"
    case -404:
      return "啥都木有"
    case -405:
      return "不支持该方法"
    case -409:
      return "冲突"
    case -412:
      return "请求被拦截 (客户端 ip 被服务端风控)"
    case -500:
      return "服务器错误"
    case -503:
      return "过载保护,服务暂不可用"
    case -504:
      return "服务调用超时"
    case -509:
      return "超出限制"
    case -616:
      return "上传文件不存在"
    case -617:
      return "上传文件太大"
    case -625:
      return "登录失败次数太多"
    case -626:
      return "用户不存在"
    case -628:
      return "密码太弱"
    case -629:
      return "用户名或密码错误"
    case -632:
      return "操作对象数量限制"
    case -643:
      return "被锁定"
    case -650:
      return "用户等级太低"
    case -652:
      return "重复的用户"
    case -658:
      return "Token 过期"
    case -662:
      return "密码时间戳过期"
    case -688:
      return "地理区域限制"
    case -689:
      return "版权限制"
    case -701:
      return "扣节操失败"
    case -799:
      return "请求过于频繁，请稍后再试"
    case -8888:
      return "对不起，服务器开小差了~ (ಥ﹏ಥ)"
    default:
      return "未知错误"
  }
}
