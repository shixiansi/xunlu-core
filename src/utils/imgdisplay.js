import cfg from "../lib/config.js"
import fetch from "node-fetch"
export default async function getImageDisplay() {
  if (!cfg.getConfig("llbot")?.image_display) return ""
  let rep = await fetch("https://v1.hitokoto.cn/")
  let res = await rep.json()
  return res.hitokoto
}
