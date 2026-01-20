import EventListener from '../EventListener.js'
import GroupMessageDB from '../../../db/MessageDB.js'
import getBot from '../../../adapter/adapter.js';
import rkeyManager from '../../../utils/rkeyManager.js';
import Config from '../../../model/base/Config.js';
/**
 * 监听群聊消息
 */
export default class noticeEvent extends EventListener {
  constructor() {
    super({ event: 'notice' })
  }

  async execute(e) {
    this.plugins.deal(e)
    if (e.user_id == e.self_id) return
    if (e.sub_type == 'recall') {
      let message = await GroupMessageDB.getMessageById(e.group_id, e.message_id)
      if (!message) return
      if (message.length > 0)
        message = message[0]
      if (!Config.GetCfg('other')[e.group_id]?.isRecall) return
      const forwardMsg = []
      let userInfo = {
        user_id: e.user_id,
        nickname: message.sender?.nickname
      }

      for (let m in message.message) {
        if (message.message[m].type == 'image' && message.message[m]?.file?.startsWith('https://multimedia.nt.qq.com.cn')) {
          let newUrl = message.message[m].file.split('&reky')[0] + (await rkeyManager.getRkey()).group_rkey
          newUrl = newUrl.replace('https', 'http')
          message.message[m].file = newUrl
          message.message[m].url = newUrl
        } else if (message.message[m].type == 'node' && message.message[m].id) {
          let result = await e.bot.api.get_forward_msg(message.message[m].id)
          message.message = result?.message || '[暂不支持该消息类型]'
          let rkey = (await rkeyManager.getRkey()).group_rkey
          message.message.forEach(msg => {
            forwardMsg.push({
              user_id: msg.data.user_id,
              nickname: msg.data.nickname,
              message: msg.data.content.map(i => {
                if (i.type == 'image' && i?.file?.startsWith('https://multimedia.nt.qq.com.cn')) {
                  let newUrl = i.file.split('&reky')[0] + rkey
                  newUrl = newUrl.replace('https', 'http')
                  i.file = newUrl
                  i.url = newUrl
                }
                return { type: i.type, ...i.data }
              }),
            })
          });

          e.reply(`检测到用户${e.user_id}撤回了一条消息`)
          e.reply(await getBot().pickGroup(e.group_id).makeForwardMsg(forwardMsg))
          return
        }
      }
      forwardMsg.push({
        ...userInfo,
        message: message.message,
        time: message.time
      })

      e.reply(`检测到用户${e.user_id}撤回了一条消息`)
      e.reply(await getBot().pickGroup(e.group_id).makeForwardMsg(forwardMsg))
    }
  }
}