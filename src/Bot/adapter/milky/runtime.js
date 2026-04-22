import MilkyEventListener from "./event/index.js"

export function createMilkyRuntimeListener(options = {}) {
  return new MilkyEventListener(options)
}

export { MilkyEventListener }
