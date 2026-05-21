import { segment } from "../../../Bot/message/index.js"
import { getDynamicTypeKey } from "./subscription-store.js"

export function shouldPushDynamicUpdate(subscription = {}, result = {}) {
  const typeKey = getDynamicTypeKey(result?.type)
  if (subscription?.dynamicType && !subscription.dynamicType.includes(typeKey)) return false
  if (subscription?.unpush && subscription.unpush.includes(typeKey)) return false
  if (result?.id === subscription?.upuid) return false
  return true
}

export function buildDynamicImageSegments(result = {}, segmentApi = segment) {
  let imgList = []
  if (result.imglist) {
    imgList = result.imglist.map(item => segmentApi.image(item))
  }
  if (result.orig?.imglist) {
    result.orig.imglist.forEach(item => {
      imgList.push(segmentApi.image(item))
    })
  }
  return imgList
}

export function buildNextDynamicSubscriptionData(subscription = {}, result = {}, uid = "") {
  return {
    ...subscription,
    nickname: result.author?.nickname || subscription.nickname,
    upuid: result.id,
    uid: subscription.uid || uid,
    img: result.author?.img || subscription.img,
    pendantImg: result.author?.pendantImg || subscription.pendantImg,
  }
}
