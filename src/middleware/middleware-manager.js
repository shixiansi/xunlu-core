/**
 * Koa-style 洋葱模型中间件管理器。
 *
 * 用法：
 *   const mm = new MiddlewareManager()
 *   mm.use(async (ctx, next) => { await next() })
 *   await mm.execute(ctx)
 */
export class MiddlewareManager {
  constructor() {
    this._middlewares = []
  }

  use(fn) {
    if (typeof fn !== "function") {
      throw new TypeError("[MiddlewareManager.use] middleware must be a function")
    }
    this._middlewares.push(fn)
    return this
  }

  compose() {
    const middlewares = this._middlewares
    return (ctx, next) => {
      let index = -1
      const dispatch = i => {
        if (i <= index) {
          return Promise.reject(new Error("next() called multiple times"))
        }
        index = i
        let fn = middlewares[i]
        if (i === middlewares.length) fn = next
        if (!fn) return Promise.resolve()
        try {
          return Promise.resolve(fn(ctx, dispatch.bind(null, i + 1)))
        } catch (err) {
          return Promise.reject(err)
        }
      }
      return dispatch(0)
    }
  }

  execute(ctx) {
    const runner = this.compose()
    return runner(ctx)
  }
}

export default MiddlewareManager
