import fetch from "node-fetch"
import Bapi from "./Bapi.js"
import { getWbi } from "./biliutils/Bwbi.cjs"
import { getCookie, getProvisionalCookie } from "./biliutils/Bcookie.js"
import BLogin from "./Blogin.js"
import moment from "moment"
import lodash from "lodash"
import getErrorMessage from "./BErrorCode.js"
import * as cheerio from "cheerio"
class Bilibili {
  get dynamicType() {
    return {
      DYNAMIC_TYPE_AV: "视频",
      DYNAMIC_TYPE_WORD: "文字",
      DYNAMIC_TYPE_DRAW: "图文",
      DYNAMIC_TYPE_ARTICLE: "专栏",
      DYNAMIC_TYPE_FORWARD: "转发",
      DYNAMIC_TYPE_LIVE_RCMD: "直播",
    }
  }

  async provisionalCK() {
    return await getProvisionalCookie()
  }

  async getCookie() {
    return await getCookie()
  }

  async buildApiUrl(apiName, params = {}, extraParams = {}) {
    const queryParams = new URLSearchParams({ ...params, ...extraParams })
    return `${Bapi(apiName, params)}?${queryParams.toString()}&${await getWbi()}`
  }

  async fetchWithHeaders(url, headers = {}) {
    try {
      const cookie = await this.getCookie()
      const response = await fetch(url, {
        headers: {
          ...headers,
          Cookie: cookie,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0.0",
        },
      })
      if (!response.ok) {
        throw new Error(`请求失败: [errcode:${response.status}] ${response.statusText}`)
      }

      const data = await response.json()
      if (data.code) {
        throw new Error(`API 错误: [errcode:${data.code}]`)
      }

      return data
    } catch (error) {
      console.error("[ERROR] 网络请求失败:", error.message)
      const facePattern = /\[errcode:(\d+)\]/g
      const errorCode = facePattern.exec(error.message)[1] || "500"
      const errorMessage = getErrorMessage(errorCode)
      return { code: errorCode, message: errorMessage }
    }
  }

  // 获取动态
  async getDynamic(mid, mode) {
    try {
      let dynamicList = await this.getdynamiclist(mid)

      if (!dynamicList || dynamicList.code || !Array.isArray(dynamicList)) {
        console.error("[ERROR] 动态列表无效:", dynamicList)
        return { code: dynamicList?.code || "500", message: getErrorMessage(dynamicList?.code) }
      }

      // 获取不到动态
      if (dynamicList.length === 0) {
        return { code: "0", message: "up主还没有发布过动态！" }
      }

      // 移除直播动态
      dynamicList = dynamicList.filter(item => item.type !== "DYNAMIC_TYPE_LIVE_RCMD")

      let dynamic
      switch (mode) {
        case "update": // 仅取最近10分钟的动态
          if (
            parseInt(
              moment().diff(
                dynamicList[0]?.modules?.module_author?.pub_ts * 1000 || 0,
                "minute",
                true,
              ),
            ) < 10
          ) {
            dynamic = dynamicList[0]
          } else if (
            parseInt(
              moment().diff(
                dynamicList[1]?.modules?.module_author?.pub_ts * 1000 || 0,
                "minute",
                true,
              ),
            ) < 10
          ) {
            // 说明第一条为置顶并且在10分钟之前
            dynamic = dynamicList[1]
          }
          break
        case "first": // 只取第一条动态,规避置顶
          if (
            dynamicList[0]?.modules?.module_tag?.text === "置顶" &&
            dynamicList[0]?.modules?.module_author?.pub_ts <
              dynamicList[1]?.modules?.module_author?.pub_ts
          ) {
            dynamic = dynamicList[1]
          } else {
            dynamic = dynamicList[0]
          }
          break
        case "top": // 只取置顶
          if (dynamicList[0]?.modules?.module_tag?.text === "置顶") {
            dynamic = dynamicList[0]
          }
          break
        default:
          dynamic = dynamicList[0]
      }

      // 判断是否是文章动态
      let cid = null
      if (dynamic?.type === "DYNAMIC_TYPE_ARTICLE") {
        const ulist = dynamic?.modules?.module_dynamic?.major?.opus?.jump_url.split("/")
        cid = ulist[ulist.includes("opus") ? ulist.length - 1 : ulist.length - 2]
      }

      if (dynamic) {
        dynamic = this.dealDynamicData(dynamic)
      }

      if (cid) {
        dynamic.article = await this.getArticle(cid)
        console.log(dynamic.article)
        dynamic.article.content = dynamic.article?.content.replace(
          /<img src="/g,
          '<img src="https:',
        )
      }

      return dynamic
    } catch (error) {
      console.error("[ERROR] 获取动态失败:", error.message)
      const facePattern = /\[errcode:(\d+)\]/g
      const errorCode = facePattern.exec(error.message)[1] || "500"
      const errorMessage = getErrorMessage(errorCode)
      return { code: errorCode, message: errorMessage }
    }
  }

  // 获取置顶动态
  async getTopDynamic(mid) {
    try {
      const dynamic = await this.getDynamic(mid, "top")
      if (dynamic?.code) {
        return { code: dynamic?.code || "500", message: getErrorMessage(dynamic?.code) }
      }
      if (!dynamic) {
        return { code: "0", message: "暂无置顶动态！" }
      }
      return dynamic
    } catch (error) {
      console.error("[ERROR] 获取置顶动态失败:", error.message)
      const facePattern = /\[errcode:(\d+)\]/g
      const errorCode = facePattern.exec(error.message)[1] || "500"
      const errorMessage = getErrorMessage(errorCode)
      return { code: errorCode, message: errorMessage }
    }
  }

  // 获取最新动态信息(10分钟以内)
  async getUpdateDynamic(mid) {
    try {
      const dynamic = await this.getDynamic(mid, "update")
      if (dynamic?.code) {
        return { code: dynamic?.code || "500", message: getErrorMessage(dynamic?.code) }
      }
      if (!dynamic) {
        return { code: "0", message: "暂无最新动态！" }
      }
      return dynamic
    } catch (error) {
      console.error("[ERROR] 获取最新动态失败:", error.message)
      const facePattern = /\[errcode:(\d+)\]/g
      const errorCode = facePattern.exec(error.message)[1] || "500"
      const errorMessage = getErrorMessage(errorCode)
      return { code: errorCode, message: errorMessage }
    }
  }

  // 获取up主第一条动态
  async getFirstDynamic(mid) {
    try {
      const dynamic = await this.getDynamic(mid, "first")
      if (dynamic?.code) {
        return { code: dynamic?.code || "500", message: getErrorMessage(dynamic?.code) }
      }
      return dynamic
    } catch (error) {
      console.error("[ERROR] 获取第一条动态失败:", error.message)
      const facePattern = /\[errcode:(\d+)\]/g
      const errorCode = facePattern.exec(error.message)[1] || "500"
      const errorMessage = getErrorMessage(errorCode)
      return { code: errorCode, message: errorMessage }
    }
  }

  // 获取用户的某一类型动态
  async getDynamicByType(mid, type = "图文", mode = "all") {
    try {
      const dynamicTypeKey = Object.keys(this.dynamicType).find(
        key => this.dynamicType[key] === type,
      )
      if (!dynamicTypeKey) {
        return { code: "400", message: `未知的动态类型: ${type}` }
      }

      const dynamicList = await this.getdynamiclist(mid)
      if (!dynamicList || dynamicList.code) {
        console.error("[ERROR] 动态列表无效:", dynamicList)
        return { code: dynamicList?.code || "500", message: getErrorMessage(dynamicList?.code) }
      }

      // 过滤指定类型的动态
      const filteredDynamicList = dynamicList.filter(item => item.type === dynamicTypeKey)

      // 获取不到动态
      if (filteredDynamicList.length === 0) {
        return { code: "0", message: `暂无最新的${type}动态！` }
      }

      // 处理动态数据
      const processedDynamicList = filteredDynamicList.map(element => this.dealDynamicData(element))

      // 按日期排序
      const sortedDynamicList = lodash.orderBy(processedDynamicList, "date", "desc")

      return sortedDynamicList[0]
    } catch (error) {
      console.error("[ERROR] 获取指定类型动态失败:", error.message)
      const facePattern = /\[errcode:(\d+)\]/g
      const errorCode = facePattern.exec(error.message)[1] || "500"
      const errorMessage = getErrorMessage(errorCode)
      return { code: errorCode, message: errorMessage }
    }
  }

  // 处理动态数据
  dealDynamicData(data) {
    const { desc, major } = data.modules.module_dynamic
    const type = this.dynamicType[data.type]
    let text = "",
      imglist = [],
      video = null,
      orig = null,
      liveInfo = null,
      comment = null,
      erm = "",
      id = ""

    const author = {
      nickname: data.modules.module_author.name, // 昵称
      img: data.modules.module_author.face, // 头像
      pendantImg: data.modules.module_author?.pendant.image, // 头像框
    }

    erm = `https://www.bilibili.com/opus/${data.id_str}` // 二维码链接
    id = data.id_str // 动态id

    // 是否是直播动态
    if (major?.live_rcmd) {
      const { live_play_info } = JSON.parse(major.live_rcmd.content)
      liveInfo = {
        cover: live_play_info.cover, // 直播间封面
        title: live_play_info.title, // 直播间标题
        area_name: live_play_info.area_name, // 直播间分区
        watched_show: live_play_info.watched_show.text_large, // 多少人看过
        liveurl: "https:" + live_play_info.link, // 直播间地址
        live_id: live_play_info.live_id, // 直播间id
      }
    }

    // 描述
    if (desc) {
      text =
        desc.rich_text_nodes
          .map(item => {
            if (item.type === "RICH_TEXT_NODE_TYPE_EMOJI") {
              return `<img src='${item.emoji.icon_url}' class='face'/>`
            }
            if (
              item.type === "RICH_TEXT_NODE_TYPE_LOTTERY" ||
              item.type === "RICH_TEXT_NODE_TYPE_TOPIC" ||
              item.type === "RICH_TEXT_NODE_TYPE_AT"
            ) {
              return `<span style="color:#178bcf">${item.orig_text}</span>`
            }
            return item.orig_text.replace(/\n/g, "<br>")
          })
          .join("") || ""
    }

    // 图片列表
    if (major?.draw) {
      imglist = major.draw.items.map(item => item.src)
    }

    // 档案（视频）
    if (major?.archive) {
      video = {
        img: major.archive.cover,
        title: major.archive.title,
        cover: major.archive.cover,
        bvid: major.archive.bvid,
        stat: major.archive.stat,
        url: "https:" + major.archive.jump_url,
        desc: major.archive.desc,
        duration: major.archive.duration_text,
        comment: data.modules.module_interaction
          ? {
              user: data.modules.module_interaction.items[0].desc.rich_text_nodes[0].text,
              content: data.modules.module_interaction.items[0].desc.rich_text_nodes[1].text,
            }
          : "",
      }
      erm = video.url
    }

    const interaction = data.modules.module_interaction || ""

    // 动态相关
    if (interaction) {
      comment = {
        user: interaction.items[0].desc.rich_text_nodes[0].text,
        content: interaction.items[0].desc.rich_text_nodes[1].text,
      }
    }

    // desc为空时描述在这
    if (major?.opus) {
      const richnodes = major.opus?.summary?.rich_text_nodes
      text =
        richnodes
          .map(item => {
            if (item.type === "RICH_TEXT_NODE_TYPE_EMOJI") {
              return `<img src='${item.emoji.icon_url}' class='face'/>`
            }
            if (
              item.type === "RICH_TEXT_NODE_TYPE_LOTTERY" ||
              item.type === "RICH_TEXT_NODE_TYPE_TOPIC" ||
              item.type === "RICH_TEXT_NODE_TYPE_AT"
            ) {
              return `<span style="color:#178bcf">${item.orig_text}</span>`
            }
            if (item.orig_text === "互动抽奖") {
              type = "抽奖"
            }
            return item.orig_text.replace(/\n/g, "<br>")
          })
          .join("") || ""

      if (major.opus?.pics) {
        imglist = major.opus?.pics.map(item => item.url)
      }
    }

    // 转发动态来源
    if (data.orig) {
      const odata = data.orig.modules
      orig = {
        face: odata.module_author.face,
        name: odata.module_author.name,
        text: [],
      }

      const richTextNodes = odata.module_dynamic.desc?.rich_text_nodes
      if (richTextNodes) {
        orig.text =
          richTextNodes
            .map(item => {
              if (item.type === "RICH_TEXT_NODE_TYPE_EMOJI") {
                return `<img src='${item.emoji.icon_url}' class='face'/>`
              }
              if (
                item.type === "RICH_TEXT_NODE_TYPE_LOTTERY" ||
                item.type === "RICH_TEXT_NODE_TYPE_TOPIC" ||
                item.type === "RICH_TEXT_NODE_TYPE_AT"
              ) {
                return `<span style="color:#178bcf">${item.orig_text}</span>`
              }
              if (item.orig_text === "互动抽奖") {
                type = "抽奖"
              }
              return item.orig_text.replace(/\n/g, "<br>")
            })
            .join("") || ""
      }

      if (odata.module_dynamic.major?.draw) {
        orig.imglist = odata.module_dynamic.major.draw.items.map(item => item.src)
      }

      if (odata.module_dynamic.major?.archive) {
        const archive = odata.module_dynamic.major.archive
        orig.video = {
          img: archive.cover,
          title: archive.title,
          cover: archive.cover,
          bvid: archive.bvid,
          stat: archive.stat,
          url: "https:" + archive.jump_url,
          desc: archive.desc,
          duration: archive.duration_text,
        }
      }

      if (odata.module_dynamic.major?.live) {
        const live = odata.module_dynamic.major.live
        const live_play_info = live
        orig.live = {
          cover: live_play_info.cover,
          title: live_play_info.title,
          area_name: live_play_info.desc_first,
          watched_show: live_play_info.desc_second,
        }
      }

      if (odata.module_dynamic.major?.opus) {
        const richnodes = odata.module_dynamic.major.opus?.summary?.rich_text_nodes
        orig.text =
          richnodes
            .map(item => {
              if (item.type === "RICH_TEXT_NODE_TYPE_EMOJI") {
                return `<img src='${item.emoji.icon_url}' class='face'/>`
              }
              if (
                item.type === "RICH_TEXT_NODE_TYPE_LOTTERY" ||
                item.type === "RICH_TEXT_NODE_TYPE_TOPIC" ||
                item.type === "RICH_TEXT_NODE_TYPE_AT"
              ) {
                return `<span style="color:#178bcf">${item.orig_text}</span>`
              }
              if (item.orig_text === "互动抽奖") {
                type = "抽奖"
              }
              return item.orig_text.replace(/\n/g, "<br>")
            })
            .join("") || ""

        if (odata.module_dynamic.major.opus?.pics) {
          orig.imglist = odata.module_dynamic.major.opus?.pics.map(item => item.url)
        }
      }
    }

    return {
      id,
      type,
      video,
      comment,
      text,
      imglist,
      author,
      erm,
      liveInfo,
      orig,
      date: moment(data.modules.module_author.pub_ts * 1000).format("YYYY年MM月DD日 HH:mm:ss"),
    }
  }

  // 搜索视频
  async searchVideoByType(params = {}) {
    try {
      const {
        search_type = "video",
        keyword = "",
        order = "totalrank",
        order_sort = 0,
        user_type = 0,
        duration = 0,
        tids = 0,
        category_id = 0,
        page = 1,
        ...extraParams
      } = params

      const url = await this.buildApiUrl(
        "searchType",
        {},
        { search_type, keyword, order, order_sort, user_type, duration, tids, category_id, page },
      )
      const { data } = await this.fetchWithHeaders(url)

      if (data?.v_voucher) {
        return { code: 0, msg: "访问繁忙！请稍后再试或者登录B站账号。" }
      }

      const result = data.result.map(item => ({
        type: item.type,
        id: item.id,
        author: item.author,
        mid: item.mid,
        typeid: item.typeid,
        typename: item.typename,
        arcurl: item.arcurl,
        aid: item.aid,
        bvid: item.bvid,
        title: item.title,
        description: item.description,
        pic: item.pic,
        play: item.play,
        video_review: item.video_review,
        favorites: item.favorites,
        tag: item.tag,
        review: item.review,
        duration: item.duration,
        pubdate: item.pubdate,
        senddate: item.senddate,
        like: item.like,
        upic: item.upic,
        rank_score: item.rank_score,
      }))

      return { numResults: data.numResults, result }
    } catch (error) {
      console.error("[ERROR] 搜索视频失败:", error.message)
      const facePattern = /\[errcode:(\d+)\]/g
      const errorCode = facePattern.exec(error.message)[1] || "500"
      const errorMessage = getErrorMessage(errorCode)
      return { code: errorCode, message: errorMessage }
    }
  }

  // 获取视频信息
  async getVideoInfo(bv) {
    try {
      const url = Bapi("videoInfo", { bv })
      const { data } = await this.fetchWithHeaders(url)
      return this.parseVideoInfoData(data)
    } catch (error) {
      console.error("[ERROR] 获取视频信息失败:", error.message)
      const facePattern = /\[errcode:(\d+)\]/g
      const errorCode = facePattern.exec(error.message)[1] || "500"
      const errorMessage = getErrorMessage(errorCode)
      return { code: errorCode, message: errorMessage }
    }
  }

  parseVideoInfoData(data) {
    const { bvid, cid, owner, pic, title, desc, ctime, stat, duration, aid, pages } = data
    return { bvid, cid, owner, pic, title, desc, ctime, stat, duration, aid, pages }
  }

  // 获取视频低质量播放地址
  async getVideoLow(bv, CID) {
    try {
      if (!bv) return

      const videoInfo = await this.getVideoInfo(bv)
      const cid = CID || videoInfo.cid
      const url = Bapi("videoLow", { bv, cid })
      const { data } = await this.fetchWithHeaders(url)
      const tags = await this.getVideoTags(videoInfo.aid, cid)

      return { ...videoInfo, videos: data?.dash?.video, audios: data?.dash?.audio, tags }
    } catch (error) {
      console.error("[ERROR] 获取视频低质量播放地址失败:", error.message)
      const facePattern = /\[errcode:(\d+)\]/g
      const errorCode = facePattern.exec(error.message)[1] || "500"
      const errorMessage = getErrorMessage(errorCode)
      return { code: errorCode, message: errorMessage }
    }
  }

  // 获取视频标签
  async getVideoTags(aid, cid) {
    try {
      const url = Bapi("tags", { aid, cid })
      const { data } = await this.fetchWithHeaders(url)
      return data.map(item => item.tag_name)
    } catch (error) {
      console.error("[ERROR] 获取视频标签失败:", error.message)
      const facePattern = /\[errcode:(\d+)\]/g
      const errorCode = facePattern.exec(error.message)[1] || "500"
      const errorMessage = getErrorMessage(errorCode)
      return { code: errorCode, message: errorMessage }
    }
  }

  // 获取搜索建议
  async getSuggest(str) {
    try {
      const url = Bapi("suggest", { str })
      const { result } = await this.fetchWithHeaders(url)
      return result.tag
    } catch (error) {
      console.error("[ERROR] 获取搜索建议失败:", error.message)
      const facePattern = /\[errcode:(\d+)\]/g
      const errorCode = facePattern.exec(error.message)[1] || "500"
      const errorMessage = getErrorMessage(errorCode)
      return { code: errorCode, message: errorMessage }
    }
  }

  async getSearchUser(name, num = 1, order = "fans") {
    let data = await this.getsearch(name, "bili_user", order)
    console.log(data)

    if (data) {
      return num == 1 ? data[0] : data.slice(0, num)
    }
  }

  async getsearch(keyword, search_type, order) {
    try {
      const url = Bapi("search", { order, keyword, search_type })
      const { data } = await this.fetchWithHeaders(url)
      console.log(data)

      return data.result
    } catch (error) {
      console.error("[ERROR] 搜索失败:", error.message)
      const facePattern = /\[errcode:(\d+)\]/g
      const errorCode = facePattern.exec(error.message)[1] || "500"
      const errorMessage = getErrorMessage(errorCode)
      return { code: errorCode, message: errorMessage }
    }
  }

  // 获取用户基本信息
  async getUserBaseInfo(mid) {
    try {
      if (!mid) return
      const url = Bapi("userCard", { mid })
      console.log(url)
      const { data } = await this.fetchWithHeaders(url)
      console.log(data)
      const { name, face, fans, friend, sign, level_info } = data.card
      const { like_num, archive_count, space } = data
      return {
        mid,
        name,
        face,
        fans,
        friend,
        sign,
        like_num,
        archive_count,
        space,
        level: level_info.current_level,
      }
    } catch (error) {
      console.error("[ERROR] 获取用户基本信息失败:", error.message)
      const facePattern = /\[errcode:(\d+)\]/g
      const errorCode = facePattern.exec(error.message)[1] || "500"
      const errorMessage = getErrorMessage(errorCode)
      return { code: errorCode, message: errorMessage }
    }
  }

  // 生成登录二维码
  async getLoginQRImg() {
    try {
      return await BLogin.generateQRImage(true)
    } catch (error) {
      console.error("[ERROR] 生成登录二维码失败:", error.message)
      const facePattern = /\[errcode:(\d+)\]/g
      const errorCode = facePattern.exec(error.message)[1] || "500"
      const errorMessage = getErrorMessage(errorCode)
      return { code: errorCode, message: errorMessage }
    }
  }

  // 检查登录状态
  async checkLogin() {
    try {
      return await BLogin.pollLoginStatus(this.getUserInfo.bind(this))
    } catch (error) {
      console.error("[ERROR] 检查登录状态失败:", error.message)
      const facePattern = /\[errcode:(\d+)\]/g
      const errorCode = facePattern.exec(error.message)[1] || "500"
      const errorMessage = getErrorMessage(errorCode)
      return { code: errorCode, message: errorMessage }
    }
  }

  // 获取用户信息
  async getUserInfo() {
    try {
      const url = Bapi("userInfo")
      const { data } = await this.fetchWithHeaders(url)
      console.log(data)

      if (!data || !data.isLogin) {
        return { code: 0, msg: "登录失败！" }
      }
      const { face, uname, mid } = data
      return { face, uname, mid }
    } catch (error) {
      console.error("[ERROR] 获取用户信息失败:", error.message)
      const facePattern = /\[errcode:(\d+)\]/g
      const errorCode = facePattern.exec(error.message)[1] || "500"
      const errorMessage = getErrorMessage(errorCode)
      return { code: errorCode, message: errorMessage }
    }
  }

  // 获取用户空间视频
  async getSpaceVideo(mid, order = "pubdate", keyword = "", pn = 1, ps = 10) {
    try {
      if (!mid) return
      const url = Bapi("spaceVideo")
      const params = { mid, order, keyword, pn, ps }
      const response = await this.fetchWithHeaders(url + `?${await getWbi(params)}`)
      return response.data
    } catch (error) {
      console.error("[ERROR] 获取用户空间视频失败:", error.message)
      const facePattern = /\[errcode:(\d+)\]/g
      const errorCode = facePattern.exec(error.message)[1] || "500"
      const errorMessage = getErrorMessage(errorCode)
      return { code: errorCode, message: errorMessage }
    }
  }

  // 获取用户视频列表
  async getUserVideo(mid, last_aid, order = "pubdate") {
    try {
      if (!mid) return
      const url = Bapi("userVideo", { mid })
      const response = await this.fetchWithHeaders(
        `${url}${last_aid ? "&aid=" + last_aid : ""}&order=${order}`,
      )
      const { data } = response

      const videoList = data.item.map(item => ({
        title: item.title,
        tname: item.tname,
        cover: item.cover,
        aid: item.param,
        duration: item.duration,
        play: item.play,
        danmaku: item.danmaku,
        ctime: item.ctime,
        author: item.author,
        bvid: item.bvid,
        first_cid: item.first_cid,
        view_content: item.view_content,
        publish_time_text: item.publish_time_text,
      }))

      return { count: data.count, item: videoList, has_next: data.has_next }
    } catch (error) {
      console.error("[ERROR] 获取用户视频列表失败:", error.message)
      const facePattern = /\[errcode:(\d+)\]/g
      const errorCode = facePattern.exec(error.message)[1] || "500"
      const errorMessage = getErrorMessage(errorCode)
      return { code: errorCode, message: errorMessage }
    }
  }

  // 根据mid获取直播间信息
  async getRoomInfobyMid(mid) {
    try {
      const url = Bapi("midRoom", { mid })
      const { data } = await this.fetchWithHeaders(url)
      return data
    } catch (error) {
      console.error("[ERROR] 根据mid获取直播间信息失败:", error.message)
      const facePattern = /\[errcode:(\d+)\]/g
      const errorCode = facePattern.exec(error.message)[1] || "500"
      const errorMessage = getErrorMessage(errorCode)
      return { code: errorCode, message: errorMessage }
    }
  }

  // 根据room_id获取直播间信息
  async getRoomInfo(room_id) {
    try {
      const url = Bapi("liveRoomInfo", { room_id })
      const { data } = await this.fetchWithHeaders(url)
      return this.parseRoomInfoData(data)
    } catch (error) {
      console.error("[ERROR] 根据room_id获取直播间信息失败:", error.message)
      const facePattern = /\[errcode:(\d+)\]/g
      const errorCode = facePattern.exec(error.message)[1] || "500"
      const errorMessage = getErrorMessage(errorCode)
      return { code: errorCode, message: errorMessage }
    }
  }

  parseRoomInfoData(data) {
    const {
      uid,
      attention,
      area_name,
      online,
      description,
      live_status,
      user_cover,
      live_time,
      title,
      room_id,
    } = data
    return {
      uid,
      room_id,
      area_name,
      attention,
      online,
      description,
      live_status,
      user_cover,
      live_time,
      title,
    }
  }

  // 获取用户的动态列表
  async getdynamiclist(mid) {
    try {
      const url = Bapi("dynamiclist", { mid })
      const res = await this.fetchWithHeaders(url, {
        Referer: `https://space.bilibili.com/${mid}/`, // 对应UP主空间地址
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9",
        Origin: "https://space.bilibili.com",
      })
      console.log(res)

      const { data } = res
      console.log("动态数据", data)

      if (res.code === 0) {
        return data.items
      } else {
        return res
      }
    } catch (error) {
      console.error("[ERROR] 获取动态列表失败:", error.message)
      const facePattern = /\[errcode:(\d+)\]/g
      const errorCode = facePattern.exec(error.message)[1] || "500"
      const errorMessage = getErrorMessage(errorCode)
      return { code: errorCode, message: errorMessage }
    }
  }

  async getSearchFans(str) {
    const url = Bapi("medalfans", { str })

    let rep = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36",
      },
    })
    const $ = cheerio.load(await rep.text())
    const medalList = []
    const tableRows = $("table.am-table > tbody > tr")

    for (let i = 1; i < tableRows.length; i++) {
      const row = tableRows.eq(i)
      const columns = row.find("td")

      const roomId = columns.eq(0).find("a").text().trim() || ""

      const medalName = columns.eq(1).text().trim() || ""

      const medalId = columns.eq(2).find("span").text().trim() || ""

      const anchorCol = columns.eq(3)
      const anchorHref = anchorCol.find("a").attr("href") || ""
      const anchorUid = anchorHref.split("/").pop() || ""
      let anchorName =
        anchorCol.find("a").clone().find("div").remove().end().text().trim() || "账号已注销"
      let certType = 0
      if (anchorCol.find("a .vo0").length > 0) {
        certType = 1
      } else if (anchorCol.find("a .vo1").length > 0) {
        certType = 2
      }
      medalList.push({
        medal_id: parseInt(medalId),
        medal_name: medalName,
        anchor_uid: anchorUid,
        anchor_name: anchorName,
        room_id: roomId,
      })
    }
    return medalList
  }

  // 获取文章信息
  async getArticle(id) {
    try {
      id = id.includes("cv") ? id.replace("cv", "") : id
      const url = Bapi("article", { id })
      const { data } = await this.fetchWithHeaders(url)
      if (data.code === 0) {
        return data.items
      } else {
        return data
      }
    } catch (error) {
      console.error("[ERROR] 获取文章信息失败:", error.message)
      const facePattern = /\[errcode:(\d+)\]/g
      const errorCode = facePattern.exec(error.message)[1] || "500"
      const errorMessage = getErrorMessage(errorCode)
      return { code: errorCode, message: errorMessage }
    }
  }
}

// 示例调用
// ;(async () => {
//   const bilibiliInstance = new Bilibili()
//   console.log(await bilibiliInstance.getUserBaseInfo("19914630"))
// })()

export default new Bilibili()
