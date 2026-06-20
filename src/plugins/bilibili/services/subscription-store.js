export const DYNAMIC_TYPE_LABELS = Object.freeze({
  live: "直播",
  text: "文字",
  draw: "图文",
  av: "视频",
  forward: "转发",
  article: "专栏",
  raffle: "抽奖",
})

export const DYNAMIC_TYPE_KEYS = Object.keys(DYNAMIC_TYPE_LABELS)

export function normalizeTypeList(types = []) {
  const list = Array.isArray(types) ? types : [types]
  return [
    ...new Set(
      list.map(type => String(type || "").trim()).filter(type => DYNAMIC_TYPE_LABELS[type]),
    ),
  ]
}

export function normalizeSubscriptionData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null

  const normalized = { ...data }
  const subscribedTypes = normalizeTypeList(normalized.dynamicType)
  const blockedTypes = normalizeTypeList(normalized.unpush)
  const filteredBlockedTypes = subscribedTypes.length
    ? blockedTypes.filter(type => !subscribedTypes.includes(type))
    : blockedTypes

  if (subscribedTypes.length > 0) normalized.dynamicType = subscribedTypes
  else delete normalized.dynamicType

  if (filteredBlockedTypes.length > 0) normalized.unpush = filteredBlockedTypes
  else delete normalized.unpush

  if (!normalized.live || typeof normalized.live !== "object" || Array.isArray(normalized.live)) {
    delete normalized.live
  }

  return normalized
}

export function getDynamicTypeKey(label = "") {
  return Object.entries(DYNAMIC_TYPE_LABELS).find(([, value]) => value === label)?.[0] || ""
}

export function createBilibiliSubscriptionStore({
  filemage,
  cachePaths,
  getLogger = () => globalThis.xunluCore?.services?.logger || console,
} = {}) {
  if (!filemage || typeof filemage.getFileDataToJson !== "function") {
    throw new TypeError("filemage with getFileDataToJson is required")
  }
  if (!filemage || typeof filemage.writeFileJsonData !== "function") {
    throw new TypeError("filemage with writeFileJsonData is required")
  }
  if (!cachePaths || typeof cachePaths.getGroupDataFile !== "function") {
    throw new TypeError("cachePaths with getGroupDataFile is required")
  }

  function getBiliData(groupId, uid) {
    if (!groupId) return uid ? null : {}

    let groupData = {}
    try {
      groupData = filemage.getFileDataToJson(cachePaths.getGroupDataFile(groupId)) || {}
    } catch {
      filemage.writeFileJsonData(cachePaths.getGroupDataFile(groupId), groupData)
      return uid ? null : groupData
    }

    const normalized = Object.fromEntries(
      Object.entries(groupData)
        .map(([key, value]) => [key, normalizeSubscriptionData(value)])
        .filter(([, value]) => value),
    )
    return uid ? normalized[uid] || null : normalized
  }

  function writeBiliData(groupId, uid, data) {
    if (!groupId || !uid) return false

    const groupData = getBiliData(groupId) || {}
    const normalizedData = normalizeSubscriptionData(data)
    if (normalizedData) {
      groupData[uid] = normalizedData
    } else {
      delete groupData[uid]
    }

    filemage.writeFileJsonData(cachePaths.getGroupDataFile(groupId), groupData)

    const liveStatus = normalizedData?.live?.live_status
    if (liveStatus !== undefined) {
      getLogger()?.debug?.(
        `[Bilibili] 更新直播状态，群ID：${groupId}，用户ID：${uid}，状态：${
          liveStatus === 1 ? "直播中" : "下播"
        }`,
      )
    }

    return true
  }

  function getUpList(groupId) {
    return Object.keys(getBiliData(groupId) || {})
  }

  function writeLiveData(groupId, uid, data) {
    const current = getBiliData(groupId, uid)
    if (!current) return false

    return writeBiliData(groupId, uid, {
      ...current,
      live: data && typeof data === "object" ? data : {},
    })
  }

  return {
    getBiliData,
    getUpList,
    writeBiliData,
    writeLiveData,
  }
}
