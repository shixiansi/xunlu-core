import OneBotV11EventListener from "./event/index.js"

export function createOneBotV11RuntimeListener(options = {}) {
  return new OneBotV11EventListener(options)
}

export { OneBotV11EventListener }
