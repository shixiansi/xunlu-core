export const PluginState = {
  UNLOADED: "unloaded",
  LOADING: "loading",
  LOADED: "loaded",
  ENABLING: "enabling",
  ENABLED: "enabled",
  DISABLING: "disabling",
  DISABLED: "disabled",
  UNLOADING: "unloading",
  ERROR: "error",
}

const validTransitions = {
  [PluginState.UNLOADED]: [PluginState.LOADING],
  [PluginState.LOADING]: [PluginState.LOADED, PluginState.ERROR],
  [PluginState.LOADED]: [PluginState.ENABLING, PluginState.UNLOADING],
  [PluginState.ENABLING]: [PluginState.ENABLED, PluginState.ERROR],
  [PluginState.ENABLED]: [PluginState.DISABLING, PluginState.UNLOADING],
  [PluginState.DISABLING]: [PluginState.DISABLED, PluginState.ERROR],
  [PluginState.DISABLED]: [PluginState.ENABLING, PluginState.UNLOADING],
  [PluginState.UNLOADING]: [PluginState.UNLOADED, PluginState.ERROR],
  [PluginState.ERROR]: [PluginState.UNLOADING],
}

export function isValidTransition(from, to) {
  const allowed = validTransitions[from]
  if (!allowed) return false
  return allowed.includes(to)
}

export default PluginState
