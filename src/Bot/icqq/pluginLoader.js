import BaseBot from "../index.js";
class pluginLoader extends BaseBot {
  constructor(Bot) {
    super({ adapter: "icqqbot" });
  }
}

export default new pluginLoader();
