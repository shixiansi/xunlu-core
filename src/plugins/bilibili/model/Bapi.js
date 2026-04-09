import fetch from "node-fetch"
function getURLMap(name, params) {
  const ApiMap = {
    search: `https://api.bilibili.com/x/web-interface/wbi/search/type?__refresh__=true&_extra=&order=${params?.order}&context=&page=1&page_size=42&from_source=&from_spmid=333.337&platform=pc&highlight=1&single_column=0&keyword=${params?.keyword}&qv_id=ZINfg344aj8e6MOSKXaaIcBPyKJsU07m&ad_resource=5654&source_tag=3&gaia_vtoken=&category_id=&search_type=${params?.search_type}&dynamic_offset=36&w_rid=57354046d4011cae09e94c624e9dc9ba&wts=1678541433`,
    searchType: `https://api.bilibili.com/x/web-interface/wbi/search/type`,
    buvid3: `https://api.bilibili.com/x/frontend/finger/spi`,
    videoLow: `https://api.bilibili.com/x/player/playurl?bvid=${params?.bv}&cid=${params?.cid}&qn=112&fnval=4048&fnver=0`,
    videoInfo: `https://api.bilibili.com/x/web-interface/view?bvid=${params?.bv}`,
    suggest: `https://s.search.bilibili.com/main/suggest?term=${params?.str}`,
    tags: `https://api.bilibili.com/x/web-interface/view/detail/tag?aid=${params?.aid}&cid=${params?.cid}`,
    userInfo: `https://api.bilibili.com/x/web-interface/nav`,
    userCard: `https://api.bilibili.com/x/web-interface/card?mid=${params?.mid}&photo=false`,
    userVideo: `https://app.biliapi.com/x/v2/space/archive/cursor?vmid=${params?.mid}`,
    spaceVideo: `https://api.bilibili.com/x/space/wbi/arc/search`,
    userCards: `https://api.bilibili.com/x/polymer/pc-electron/v1/user/cards?${params?.mids}`,
    midRoom: `https://api.live.bilibili.com/live_user/v1/Master/info?uid=${params?.mid}`,
    liveRoomInfo: `https://api.live.bilibili.com/room/v1/Room/get_info?room_id=${params?.room_id}`,
    livePlayInfo: `https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo`,
    dynamiclist: `https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?offset=&host_mid=${params?.mid}&timezone_offset=-480&features=itemOpusStyle`,
    article: `https://api.bilibili.com/x/article/view?id=${params?.id}&gaia_source=main_web&web_location=333.976&w_rid=a55bc106ab28ca2cf261ea0493d16a68&wts=1704863751`,
    medalfans: `https://fsxzk.jjnnnh.website/?querypx=&querylx=&query=${params?.str}&pageNum=1`,
    videoData: `https://api.bilibili.com/x/player/wbi/playurl?bvid=${params?.bv}&cid=${params?.cid}&fnval=80`,
  }

  return ApiMap[name]
}

export default getURLMap
