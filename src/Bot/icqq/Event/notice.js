import EventListener from "../EventListener.js";
import GroupMessageDB from "../../../db/MessageDB.js";
/**
 * 监听群聊消息
 */
export default class noticeEvent extends EventListener {
  constructor() {
    super({ event: "notice" });
  }

  async execute(e) {
    this.plugins.deal(e);
  }
}
