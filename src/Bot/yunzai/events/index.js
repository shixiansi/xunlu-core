import { bindMilkyTakeoverMessage, bindOnebotTakeoverMessage } from "./message.js"
import { bindMilkyTakeoverNotice, bindOnebotTakeoverNotice } from "./notice.js"
import { bindMilkyTakeoverRequest, bindOnebotTakeoverRequest } from "./request.js"

export function startOnebotTakeoverBridge({ bot, state, helpers } = {}) {
  const on = (eventType, handler) => state.adapter.on(eventType, handler)

  bindOnebotTakeoverMessage({ on, bot, state, helpers })
  bindOnebotTakeoverNotice({ on, bot, state, helpers })
  bindOnebotTakeoverRequest({ on, bot, state, helpers })
}

export function startMilkyTakeoverBridge({ bot, state, helpers } = {}) {
  const on = (eventType, handler) => {
    try {
      state.adapter.on(eventType, handler)
    } catch (err) {
      helpers.logWarn("[xunlu-core][takeover] bind milky event failed:", eventType, err?.message || err)
    }
  }

  bindMilkyTakeoverMessage({ on, bot, state, helpers })
  bindMilkyTakeoverNotice({ on, bot, state, helpers })
  bindMilkyTakeoverRequest({ on, bot, state, helpers })
}

