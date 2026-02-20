import lodash from "lodash"
import { segment } from "../../../Bot/segment.js"
export function register(bot) {
  if (!bot || !bot.registerCommand) return
  //第一个参数是数组第一个是命令，第二个是事件,如果是其他事件就是事件列表中的事件名称，第二个是方法，第三个是下文函数
  bot.registerCommand(["", 2000], async ctx => {
    return false
  })
}
