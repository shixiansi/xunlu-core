import { MiddlewareManager } from "../../middleware/middleware-manager.js"
import { registerBuiltinMiddlewares } from "../../middleware/builtin/index.js"

export class MessagePipeline {
  constructor(baseBot, roleResolver) {
    this.baseBot = baseBot
    this.roleResolver = roleResolver
    this._mm = new MiddlewareManager()
    registerBuiltinMiddlewares(this._mm)
  }

  async prepareEvent(e) {
    if (!e || typeof e !== "object") return
    e.baseBot = this.baseBot
    e.roleResolver = this.roleResolver
    await this._mm.execute(e)
  }
}

export default MessagePipeline
