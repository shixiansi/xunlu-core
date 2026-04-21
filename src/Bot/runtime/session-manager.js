/**
 * SessionManager 负责上下文对话和超时清理。
 *
 * 它不关心协议和命令来源，只关心：
 * - 当前用户是否已经在一个上下文里
 * - 新消息应该交给上下文还是普通命令
 * - 何时清理临时 / 持久上下文
 */
export class SessionManager {
  constructor(baseBot) {
    this.baseBot = baseBot
  }

  createContextReplyHandler() {
    return async (ctx, callback, endMsg) => {
      const isPrivate = ctx.isPrivate
      const contextKey = isPrivate ? ctx.user_id : ctx.group_id
      const userId = ctx.sender_id || ctx.user_id

      if (!contextKey || !userId) {
        logger.warn("缺少上下文Key或用户ID")
        return
      }

      this.initContextStorage(isPrivate, contextKey, userId)

      if (this.hasExistingContext(isPrivate, contextKey, userId, endMsg)) {
        this.addToContextQueue(isPrivate, contextKey, userId, callback, endMsg)
        return
      }

      this.createNewContext(isPrivate, contextKey, userId, callback, endMsg, ctx)
    }
  }

  initContextStorage(isPrivate, contextKey, userId) {
    const storage = isPrivate ? this.baseBot.privateReply : this.baseBot.groupReply

    if (!storage[contextKey]) storage[contextKey] = {}
    if (!storage[contextKey][userId]) storage[contextKey][userId] = []
  }

  hasExistingContext(isPrivate, contextKey, userId, endMsg) {
    const storage = isPrivate ? this.baseBot.privateReply : this.baseBot.groupReply
    const userContexts = storage[contextKey]?.[userId]

    return userContexts && userContexts.length > 0 && userContexts[0]?.endMsg && endMsg
  }

  addToContextQueue(isPrivate, contextKey, userId, callback, endMsg) {
    const storage = isPrivate ? this.baseBot.privateReply : this.baseBot.groupReply

    const newContext = {
      cfnc: callback,
      endMsg,
      timer: null,
      isPrivate,
      contextKey,
      userId,
    }

    storage[contextKey][userId].unshift(newContext)
  }

  createNewContext(isPrivate, contextKey, userId, callback, endMsg, ctx) {
    const storage = isPrivate ? this.baseBot.privateReply : this.baseBot.groupReply

    const newContext = {
      cfnc: callback,
      endMsg,
      timer: this.setupTimeout(isPrivate, contextKey, userId, endMsg, ctx),
      isPrivate,
      contextKey,
      userId,
    }

    storage[contextKey][userId].push(newContext)
  }

  setupTimeout(isPrivate, contextKey, userId, endMsg, ctx) {
    if (endMsg) return null

    return this.baseBot.timers.setTimeout(() => {
      this.clearContext(isPrivate, contextKey, userId)
      if (ctx) {
        ctx.reply("时间超时，已取消。", true).catch(logger.error)
      }
    }, 30000)
  }

  clearContext(isPrivate, contextKey, userId) {
    const storage = isPrivate ? this.baseBot.privateReply : this.baseBot.groupReply

    if (storage[contextKey]?.[userId]) {
      delete storage[contextKey][userId]
    }
  }

  async handleEvent(e, onNoContext) {
    const isPrivate = e.isPrivate
    const contextKey = isPrivate ? e.user_id : e.group_id
    const userId = e.user_id

    const hasContext = isPrivate
      ? this.baseBot.privateReply?.[contextKey]?.[userId]
      : this.baseBot.groupReply?.[contextKey]?.[userId]

    if (!hasContext) {
      return await onNoContext(e)
    }

    const userContexts = isPrivate
      ? this.baseBot.privateReply[contextKey][userId]
      : this.baseBot.groupReply[contextKey][userId]

    const result = await this.processUserContexts(e, userContexts)
    this.cleanupContexts(isPrivate, contextKey, userId, userContexts, result)
    return result
  }

  async processUserContexts(e, userContexts) {
    const result = {
      processed: false,
      shouldCleanPersistent: false,
      shouldCleanTemporary: false,
    }

    for (let i = userContexts.length - 1; i >= 0; i--) {
      const context = userContexts[i]

      if (this.isContextValid(context)) {
        let res = await this.executeContextCallback(e, context)
        result.processed = true

        if (!context.endMsg && !res && !context.timer) {
          context.timer = this.setupTimeout(
            context.isPrivate,
            context.contextKey,
            context.userId,
            context.endMsg,
            e,
          )
        }

        if (this.shouldEndContext(e, context) && res) {
          if (context.endMsg) result.shouldCleanPersistent = true
          else result.shouldCleanTemporary = true
          break
        }
      }
    }

    return result
  }

  isContextValid(context) {
    return context && context.cfnc && typeof context.cfnc === "function"
  }

  async executeContextCallback(e, context) {
    try {
      let res = await context.cfnc(e)
      if (context.timer) {
        this.baseBot.timers.clearTimeout(context.timer)
        context.timer = null
      }
      return res
    } catch (error) {
      logger.error("执行上下文回调出错:", error)
      await e.reply("处理出错，请重新操作").catch(logger.error)
    }
  }

  shouldEndContext(e, context) {
    return (context.endMsg && e.msg === context.endMsg) || !context.endMsg
  }

  cleanupContexts(isPrivate, contextKey, userId, userContexts, result) {
    if (!userContexts.length) return

    const storage = isPrivate ? this.baseBot.privateReply : this.baseBot.groupReply

    if (result.shouldCleanPersistent) {
      this.removeContextsByType(storage, contextKey, userId, true)
    } else if (result.shouldCleanTemporary) {
      this.removeLastTemporaryContext(storage, contextKey, userId)
    }

    if (!storage[contextKey]?.[userId]?.length) {
      this.cleanupUserContext(storage, contextKey, userId)
    }
  }

  removeContextsByType(storage, contextKey, userId, isPersistent) {
    if (!storage[contextKey]?.[userId]) return

    storage[contextKey][userId] = storage[contextKey][userId].filter(context => {
      const shouldRemove = isPersistent ? context.endMsg : !context.endMsg
      if (shouldRemove && context.timer) {
        this.baseBot.timers.clearTimeout(context.timer)
      }
      return !shouldRemove
    })
  }

  removeLastTemporaryContext(storage, contextKey, userId) {
    if (!storage[contextKey]?.[userId]) return

    const contexts = storage[contextKey][userId]
    for (let i = contexts.length - 1; i >= 0; i--) {
      if (!contexts[i].endMsg) {
        if (contexts[i].timer) {
          this.baseBot.timers.clearTimeout(contexts[i].timer)
        }
        contexts.splice(i, 1)
        break
      }
    }
  }

  cleanupUserContext(storage, contextKey, userId) {
    if (storage[contextKey]?.[userId]) {
      delete storage[contextKey][userId]
    }

    if (storage[contextKey] && Object.keys(storage[contextKey]).length === 0) {
      delete storage[contextKey]
    }
  }
}

export default SessionManager
