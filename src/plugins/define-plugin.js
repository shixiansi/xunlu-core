function uniqueTextList(values = []) {
  const seen = new Set()
  const list = []
  for (const value of values) {
    const text = String(value || "").trim()
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    list.push(text)
  }
  return list
}

function titleFromName(name) {
  return String(name || "")
    .split(/[-_]/g)
    .filter(Boolean)
    .map(part => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ")
}

export function normalizePluginDefinition(definition, options = {}) {
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    throw new Error("plugin definition must be an object")
  }

  const name = String(definition.name || "").trim()
  if (!name) {
    throw new Error("plugin name is required")
  }

  const hasCapability =
    typeof definition.register === "function" ||
    typeof definition.onBotEvent === "function" ||
    typeof definition.apiRoutes === "function" ||
    definition.webui !== undefined ||
    Boolean(options.hasWebuiFile)

  if (!hasCapability) {
    throw new Error(
      "plugin must expose at least one capability: register / onBotEvent / apiRoutes / webui",
    )
  }

  const title = String(definition.title || titleFromName(name) || name).trim() || name
  const shortName = String(definition.shortName || definition.alias || title).trim() || title
  const aliases = uniqueTextList([name, title, shortName, ...(definition.aliases || [])])

  return {
    ...definition,
    name,
    title,
    shortName,
    aliases,
    helpHidden: Boolean(definition.helpHidden),
  }
}

export function definePlugin(definition = {}) {
  return normalizePluginDefinition(definition)
}

export default definePlugin
