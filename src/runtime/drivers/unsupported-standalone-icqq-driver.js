import BaseAdapterDriver from "./base-adapter-driver.js"

/**
 * 显式表达“独立 icqq 当前不受支持”。
 *
 * 这里不再像之前那样把它误判成 yunzai-icqq，而是尽早抛出清晰错误，
 * 让调用方和 CLI 都能看到稳定的失败语义。
 */
export class UnsupportedStandaloneIcqqDriver extends BaseAdapterDriver {
  getRuntimeBot() {
    return null
  }

  getBotCore() {
    return null
  }

  getStatus() {
    return {
      protocol: "icqq",
      adapterType: "unsupported",
      mode: "standalone-icqq-unsupported",
      supported: false,
      message:
        "icqq only works in yunzai plugin mode or takeover mode; use milky / onebotv11 / auto for standalone runtime",
    }
  }

  async start() {
    throw new Error(
      "[UnsupportedStandaloneIcqqDriver] icqq only works in yunzai plugin mode or takeover mode; use milky / onebotv11 / auto for standalone runtime",
    )
  }

  async reloadPlugins() {
    return []
  }

  async simulateIncoming() {
    throw new Error("[UnsupportedStandaloneIcqqDriver] simulateIncoming is unavailable")
  }

  async stop() {
    return true
  }
}

export default UnsupportedStandaloneIcqqDriver
