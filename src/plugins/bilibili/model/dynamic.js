import moment from "moment"
const dynamicType = {
  DYNAMIC_TYPE_AV: "视频",
  DYNAMIC_TYPE_WORD: "文字",
  DYNAMIC_TYPE_DRAW: "图文",
  DYNAMIC_TYPE_ARTICLE: "专栏",
  DYNAMIC_TYPE_FORWARD: "转发",
  DYNAMIC_TYPE_LIVE_RCMD: "直播",
}

async function getDynamic(mid, mode) {
  let dynamicList = await getdynamiclistAllbymid(mid)
  if (!dynamicList || dynamicList.code || !Array.isArray(dynamicList)) {
    return {
      code: dynamicList?.code || "500",
      message: dynamicList?.message || "未知错误！",
    }
  }
  //获取不到动态
  if (dynamicList.length == 0) {
    return {
      code: "0",
      message: "up主还没有发布过动态！",
    }
  }
  //移除直播动态
  dynamicList = dynamicList.filter(item => item.type !== "DYNAMIC_TYPE_LIVE_RCMD")
  let dynamic
  switch (mode) {
    case "update": //仅取最近10分钟的动态
      if (
        parseInt(
          moment().diff(dynamicList[0]?.modules?.module_author?.pub_ts * 1000 || 0, "minute", true),
        ) < 10
      ) {
        dynamic = dynamicList[0]
      } else if (
        parseInt(
          moment().diff(dynamicList[1]?.modules?.module_author?.pub_ts * 1000 || 0, "minute", true),
        ) < 10
      ) {
        //说明第一条为置顶并且在10分钟之前
        dynamic = dynamicList[1]
      }
      break
    case "first":
      //只取第一条动态,规避置顶
      if (
        dynamicList[0]?.modules?.module_tag?.text == "置顶" &&
        dynamicList[0]?.modules?.module_author?.pub_ts <
          dynamicList[1]?.modules?.module_author?.pub_ts
      ) {
        dynamic = dynamicList[1]
      } else {
        dynamic = dynamicList[0]
      }
      break
    case "top":
      //只取置顶
      if (dynamicList[0]?.modules?.module_tag?.text == "置顶") {
        dynamic = dynamicList[0]
      }
      break
  }
  //判断是否是文章动态
  let cid
  if (dynamic?.type == "DYNAMIC_TYPE_ARTICLE") {
    let ulist = dynamic?.modules?.module_dynamic?.major?.opus?.jump_url.split("/")
    cid = ulist[ulist.includes("opus") ? ulist.length - 1 : ulist.length - 2]
  }
  if (dynamic) {
    dynamic = dealDynamicData(dynamic)
  }
  if (cid) {
    dynamic.article = await getArticle(cid)
    console.log(dynamic.article)
    dynamic.article.content = dynamic.article?.content.replace(/<img src="/g, '<img src="https:')
  }
  return dynamic
}

//获取置顶动态
async function getTopDynamic(mid) {
  let dynamic = await getDynamic(mid, "top")
  if (dynamic?.code) {
    return {
      code: dynamic?.code || "500",
      message: dynamic?.message || "未知错误！",
    }
  }
  if (!dynamic) {
    return {
      code: "0",
      message: "暂无置顶动态！",
    }
  }
  return dynamic
}

//获取最新动态信息(10分钟以内)
async function getUpdateDynamic(mid) {
  let dynamic = await getDynamic(mid, "update")
  if (dynamic?.code) {
    return {
      code: dynamic?.code || "500",
      message: dynamic?.message || "未知错误！",
    }
  }
  if (!dynamic) {
    return {
      code: "0",
      message: "暂无最新动态！",
    }
  }
  return dynamic
}

//获取up主第一条动态
async function getFirstDynamic(mid) {
  let dynamic = await getDynamic(mid, "first")
  if (dynamic?.code) {
    return {
      code: dynamic?.code || "500",
      message: dynamic?.message || "未知错误！",
    }
  }
  return dynamic
}

//处理动态数据
function dealDynamicData(data) {
  let { desc, major } = data.modules.module_dynamic
  let type = dynamicType[data.type]
  let text = "",
    imglist = "",
    video,
    orig = "",
    liveInfo,
    comment = "",
    erm,
    id
  let author = {
    nickname: data.modules.module_author.name, //昵称
    img: data.modules.module_author.face, //头像
    pendantImg: data.modules.module_author?.pendant.image, //头像框
  }
  erm = `https://www.bilibili.com/opus/${data.id_str}` //二维码链接
  id = data.id_str //动态id
  //是否是直播动态
  if (major?.live_rcmd) {
    let { live_play_info } = JSON.parse(major.live_rcmd.content)
    liveInfo = {
      cover: live_play_info.cover, //直播间封面
      title: live_play_info.title, //直播间标题
      area_name: live_play_info.area_name, //直播间分区
      watched_show: live_play_info.watched_show.text_large, //多少人看过
      liveurl: "https:" + live_play_info.link, //直播间地址
      live_id: live_play_info.live_id, //直播间id
    }
  }
  //描述
  if (desc) {
    text =
      desc.rich_text_nodes
        .map(item => {
          if (item.type == "RICH_TEXT_NODE_TYPE_EMOJI") {
            return `<img src='${item.emoji.icon_url}' class='face'/>`
          }
          if (
            item.type == "RICH_TEXT_NODE_TYPE_LOTTERY" ||
            item.type == "RICH_TEXT_NODE_TYPE_TOPIC" ||
            item.type == "RICH_TEXT_NODE_TYPE_AT"
          ) {
            return `<span style="color:#178bcf">${item.orig_text}</span>`
          }
          return item.orig_text.replace(/\n/g, "<br>")
        })
        ?.join("") || ""
  }
  //图片列表
  if (major?.draw) {
    imglist = major.draw.items.map(item => {
      return item.src
    })
  }
  //档案（视频）
  if (major?.archive) {
    video = {}
    video.img = major.archive.cover
    video.title = major.archive.title
    video.cover = major.archive.cover
    video.bvid = major.archive.bvid
    video.stat = major.archive.stat
    video.url = "https:" + major.archive.jump_url
    video.desc = major.archive.desc
    video.duration = major.archive.duration_text
    video.comment = data.modules.module_interaction
      ? {
          user: data.modules.module_interaction.items[0].desc.rich_text_nodes[0].text,
          content: data.modules.module_interaction.items[0].desc.rich_text_nodes[1].text,
        }
      : ""
    erm = video.url
  }
  let interaction = data.modules.module_interaction || ""
  //动态相关
  if (interaction) {
    comment = {
      user: interaction.items[0].desc.rich_text_nodes[0].text,
      content: interaction.items[0].desc.rich_text_nodes[1].text,
    }
  }
  //desc为空时描述在这
  if (major?.opus) {
    let richnodes = major.opus?.summary?.rich_text_nodes
    text =
      richnodes
        .map(item => {
          if (item.type == "RICH_TEXT_NODE_TYPE_EMOJI") {
            return `<img src='${item.emoji.icon_url}' class='face'/>`
          }
          if (
            item.type == "RICH_TEXT_NODE_TYPE_LOTTERY" ||
            item.type == "RICH_TEXT_NODE_TYPE_TOPIC" ||
            item.type == "RICH_TEXT_NODE_TYPE_AT"
          ) {
            return `<span style="color:#178bcf">${item.orig_text}</span>`
          }
          return item.orig_text.replace(/\n/g, "<br>")
        })
        ?.join("") || ""
    if (major.opus?.pics) {
      imglist = major.opus?.pics.map(item => {
        return item.url
      })
    }
  }
  //转发动态来源
  if (data.orig) {
    orig = {}
    let odata = data.orig.modules
    orig.face = odata.module_author.face
    orig.name = odata.module_author.name
    orig.text = []
    orig.text =
      odata.module_dynamic.desc?.rich_text_nodes.map(item => {
        if (item.type == "RICH_TEXT_NODE_TYPE_EMOJI") {
          return `<img src='${item.emoji.icon_url}' class='face'/>`
        }
        if (
          item.type == "RICH_TEXT_NODE_TYPE_LOTTERY" ||
          item.type == "RICH_TEXT_NODE_TYPE_TOPIC" ||
          item.type == "RICH_TEXT_NODE_TYPE_AT"
        ) {
          return `<span style="color:#178bcf">${item.orig_text}</span>`
        }
        if (item.orig_text === "互动抽奖") {
          type = "抽奖"
        }
        return item.orig_text.replace(/\n/g, "<br>")
      }) || ""
    orig.text = orig.text ? orig.text.join("") : ""
    orig.imglist =
      odata.module_dynamic.major?.draw?.items.map(item => {
        return item.src
      }) || ""
    if (odata.module_dynamic.major?.archive) {
      orig.video = {}
      let { archive } = odata.module_dynamic.major
      orig.video.img = archive.cover
      orig.video.title = archive.title
      orig.video.cover = archive.cover
      orig.video.bvid = archive.bvid
      orig.video.stat = archive.stat
      orig.video.url = "https:" + archive.jump_url
      orig.video.desc = archive.desc
      orig.video.duration = archive.duration_text
    }
    if (odata.module_dynamic.major?.live) {
      let live = odata.module_dynamic.major.live
      orig.live = {}
      let live_play_info = live
      orig.live = {
        cover: live_play_info.cover,
        title: live_play_info.title,
        area_name: live_play_info.desc_first,
        watched_show: live_play_info.desc_second,
      }
    }
    if (odata.module_dynamic.major?.opus) {
      let richnodes = odata.module_dynamic.major.opus?.summary?.rich_text_nodes
      orig.text =
        richnodes
          .map(item => {
            if (item.type == "RICH_TEXT_NODE_TYPE_EMOJI") {
              return `<img src='${item.emoji.icon_url}' class='face'/>`
            }
            if (
              item.type == "RICH_TEXT_NODE_TYPE_LOTTERY" ||
              item.type == "RICH_TEXT_NODE_TYPE_TOPIC" ||
              item.type == "RICH_TEXT_NODE_TYPE_AT"
            ) {
              return `<span style="color:#178bcf">${item.orig_text}</span>`
            }
            if (item.orig_text === "互动抽奖") {
              type = "抽奖"
            }
            return item.orig_text.replace(/\n/g, "<br>")
          })
          ?.join("") || ""
      if (odata.module_dynamic.major.opus?.pics) {
        orig.imglist = odata.module_dynamic.major.opus?.pics.map(item => {
          return item.url
        })
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

//获取用户的某一类型动态
async function getDynamicByType(mid, type = "图文", mode = "all") {
  let dynamicType = Object.keys(dynamicType).find(item => dynamicType[item] == type)
  let dynamicList = await getdynamiclistAllbymid(mid)
  if (!dynamicList || dynamicList.code) {
    return {
      code: dynamicList?.code || "500",
      message: dynamicList?.message || "未知错误！",
    }
  }
  dynamicList = dynamicList.filter(item => item.type == dynamicType)
  //获取不到动态
  if (dynamicList.length == 0) {
    return {
      code: "0",
      message: `暂无最新的${type}动态！`,
    }
  }
  dynamicList = dynamicList.map(element => {
    return dealDynamicData(element)
  })
  dynamicList = lodash.orderBy(dynamicList, "date", "desc")
  return dynamicList[0]
}
