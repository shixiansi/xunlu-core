/**
 * ProtocolDispatcher — 协议路由调度器。
 *
 * 将跨协议差异的操作（recallMessage / sendGroupMessageReaction 等）
 * 集中注册为路由，消除 universal-bot-api.js 和 binding 文件中的重复 if/else 分支。
 *
 * 使用方式：
 *   import { protocolDispatcher } from "../protocol-dispatcher/index.js"
 *   await protocolDispatcher.exec("recallMessage", protocol, params, ctx)
 */
export class ProtocolDispatcher {
  constructor() {
    this._actions = new Map()
  }

  /**
   * 注册一个跨协议操作。
   * @param {string} name - 操作名，如 "recallMessage"
   * @param {object} impls - 协议实现
   * @param {Function} [impls.milky] - milky 协议实现
   * @param {Function} [impls.onebotv11] - onebotv11 协议实现
   * @param {Function} [impls.icqq] - icqq 协议实现（也作为默认 fallback）
   * @param {object} [options] - { overwrite?: boolean }
   */
  register(name, impls, { overwrite = true } = {}) {
    // kernel 每次 start 都会重新注册 actions；stop→start 循环重启时若直接 throw，
    // 二次启动必然进入回滚失败。默认幂等覆盖；需要严格校验时显式传 overwrite:false。
    if (this._actions.has(name) && !overwrite) {
      throw new Error(`[ProtocolDispatcher] action already registered: ${name}`)
    }
    if (this._actions.has(name) && overwrite) {
      try {
        globalThis.logger?.debug?.(`[ProtocolDispatcher] action 重复注册（已覆盖）: ${name}`)
      } catch {}
    }
    this._actions.set(name, impls)
  }

  /**
   * 执行一个跨协议操作。
   * @param {string} name - 操作名
   * @param {string} protocol - 协议标识（milky / onebotv11 / icqq）
   * @param {object} params - 归一化的参数
   * @param {object} [ctx] - 调用上下文（事件对象或 api 对象）
   * @returns {Promise<any>}
   */
  async exec(name, protocol, params, ctx = {}) {
    const impls = this._actions.get(name)
    if (!impls) {
      throw new Error(`[ProtocolDispatcher] unknown action: ${name}`)
    }
    const fn = impls[protocol] || impls.icqq
    if (typeof fn !== "function") {
      throw new Error(
        `[ProtocolDispatcher] ${name} not implemented for protocol: ${protocol}`,
      )
    }
    return fn(params, ctx)
  }

  hasAction(name) {
    return this._actions.has(name)
  }
}

export const protocolDispatcher = new ProtocolDispatcher()
