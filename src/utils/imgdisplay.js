import cfg from "../lib/config.js"
import fetch from "node-fetch"

// 一言接口超时：外部 API stall 时不阻塞消息处理（node-fetch@2 默认无超时）
const HITOKOTO_TIMEOUT_MS = Number(process.env.XUNLU_HITOKOTO_TIMEOUT_MS) || 5000

export default async function getImageDisplay() {
  if (!cfg.getConfig("bot")?.image_display) return ""
  try {
    const rep = await fetch("https://v1.hitokoto.cn/", {
      signal: AbortSignal.timeout(HITOKOTO_TIMEOUT_MS),
    })
    const res = await rep.json()
    return res?.hitokoto || ""
  } catch (err) {
    try {
      globalThis.logger?.warn?.(`[imgdisplay] 获取一言失败: ${err?.message || err}`)
    } catch {}
    return ""
  }
}
