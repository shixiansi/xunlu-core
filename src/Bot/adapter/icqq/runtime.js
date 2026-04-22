import { ListenerLoader } from "./EventListener.js"

export function createIcqqRuntimeListener(options = {}) {
  return new ListenerLoader(options)
}

export { ListenerLoader }
