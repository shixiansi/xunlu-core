import fetch from "node-fetch"
import Bapi from "../Bapi.js"
import { getBiliTicket } from "./bili_ticket.cjs"
import { getPlatformRedis } from "../../../../runtime/platform-services.js"

async function getCookie() {
  let Buvid = await getBuvid()
  let bili_ticket = "bili_ticket=" + (await getBiliTicket(""))?.data?.ticket

  let b_nut = await getB_nt()
  const jsonData = await getPlatformRedis()?.get?.("bilibili_cookie")

  const { SESSDATA, DedeUserID } = jsonData ? JSON.parse(jsonData) : {}
  return [
    Buvid,
    bili_ticket,
    b_nut === null ? "" : b_nut,
    `SESSDATA=${SESSDATA}`,
    `DedeUserID=${DedeUserID}`,
  ].join(";")
}

async function getProvisionalCookie() {
  let Buvid = await getBuvid()
  let bili_ticket = "bili_ticket=" + (await getBiliTicket(""))?.data?.ticket

  let b_nut = await getB_nt()
  return [Buvid, bili_ticket, b_nut].join(";")
}

async function getB_nt() {
  let rep = await fetch("https://www.bilibili.com/", {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36 Edg/114.0.1823.79",
    },
  })

  let cookie = rep.headers.get("set-cookie")
  if (cookie === null) {
    return null
  }
  let b_nut = cookie
    .split(";")
    .find(i => i.includes("b_nut"))
    .split(",")[1]
  return b_nut
}

async function getBuvid() {
  let url = Bapi("buvid3")
  let rep = await fetch(url)
  let { data } = await rep.json()
  return `buvid4=${data.b_4};buvid3=${data.b_3}`
}

export { getCookie, getProvisionalCookie }
