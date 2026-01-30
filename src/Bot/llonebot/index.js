import BotBase from "../index.js";
import lodash from "lodash";
class LloneBot extends BotBase {
  constructor(Bot) {
    super({ adapter: "llonebot" });
  }
}
export default LloneBot;
