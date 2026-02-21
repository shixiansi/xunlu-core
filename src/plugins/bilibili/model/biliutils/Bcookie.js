import fetch from "node-fetch"
import Bapi from "../Bapi.js"
import { getBiliTicket } from "./bili_ticket.cjs"
async function getCookie() {
  let Buvid = await getBuvid()
  let bili_ticket = "bili_ticket=" + (await getBiliTicket(""))?.data?.ticket

  let b_nut = await getB_nt()
  const jsonData = await redis.get("bilibili_cookie")

  const { SESSDATA } = jsonData ? JSON.parse(jsonData) : {}
  return [Buvid, bili_ticket, b_nut, `SESSDATA=${SESSDATA}`].join(";")
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
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0",
    },
  })

  let cookie = rep.headers.get("set-cookie")

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
