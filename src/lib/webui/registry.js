import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

import express from "express"

function titleFromName(name) {
  return String(name || "")
    .split(/[-_]/g)
    .filter(Boolean)
    .map(part => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ")
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizePages(pluginName, pages = []) {
  return asArray(pages)
    .map((item, index) => {
      if (!item || typeof item !== "object") return null
      return {
        id: String(item.id || `page_${index + 1}`),
        title: String(item.title || item.label || `页面 ${index + 1}`),
        description: item.description ? String(item.description) : "",
        url: String(item.url || ""),
      }
    })
    .filter(item => item && item.url)
}

function normalizeSections(sections = []) {
  return asArray(sections)
    .map((section, index) => {
      if (!section || typeof section !== "object") return null
      return {
        id: String(section.id || `section_${index + 1}`),
        title: String(section.title || `配置 ${index + 1}`),
        description: section.description ? String(section.description) : "",
        scope: String(section.scope || "global"),
        emptyText: section.emptyText ? String(section.emptyText) : "",
        fields: asArray(section.fields),
      }
    })
    .filter(Boolean)
}

async function resolveProvider(plugin) {
  let provider = plugin?.implementation?.webui || null

  if (!provider) {
    const providerPath = path.join(plugin.rootDir || "", "webui", "index.js")
    if (plugin.rootDir && fs.existsSync(providerPath)) {
      const mod = await import(pathToFileURL(providerPath).href)
      provider = mod.default || mod
      if (provider && typeof provider.createWebUiPlugin === "function") {
        provider = await provider.createWebUiPlugin({ plugin })
      }
    }
  }

  if (typeof provider === "function") {
    provider = await provider({ plugin })
  }

  return provider && typeof provider === "object" ? provider : null
}

async function createEntry(plugin) {
  const provider = await resolveProvider(plugin)
  if (!provider) return null

  const meta = provider?.meta && typeof provider.meta === "object" ? provider.meta : {}
  const staticDir = plugin?.rootDir ? path.join(plugin.rootDir, "resources", "webui") : ""

  return {
    name: plugin.name,
    title: String(meta.title || titleFromName(plugin.name) || plugin.name),
    description: meta.description ? String(meta.description) : "",
    order: Number.isFinite(Number(meta.order)) ? Number(meta.order) : 1000,
    tags: asArray(meta.tags).map(tag => String(tag)),
    configurable:
      Boolean(provider) &&
      (typeof provider.getValues === "function" || typeof provider.getConfig === "function") &&
      (typeof provider.updateValues === "function" || typeof provider.updateConfig === "function"),
    provider,
    staticDir: staticDir && fs.existsSync(staticDir) ? staticDir : "",
  }
}

function getProviderMethod(entry, primary, fallback) {
  if (!entry?.provider) return null
  if (typeof entry.provider[primary] === "function") return entry.provider[primary].bind(entry.provider)
  if (fallback && typeof entry.provider[fallback] === "function") return entry.provider[fallback].bind(entry.provider)
  return null
}

export async function createWebUiRegistry(plugins = []) {
  const entries = (await Promise.all(asArray(plugins).map(createEntry))).filter(Boolean)
  entries.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))

  const byName = new Map(entries.map(entry => [entry.name, entry]))

  return {
    list() {
      return entries.map(entry => ({
        name: entry.name,
        title: entry.title,
        description: entry.description,
        tags: [...entry.tags],
        configurable: Boolean(entry.configurable),
        hasCustomPages: Boolean(entry.provider?.getDefinition || entry.provider?.definition),
      }))
    },

    getEntry(name) {
      return byName.get(String(name || "")) || null
    },

    async getDefinition(name) {
      const entry = byName.get(String(name || ""))
      if (!entry) return null

      const loader = getProviderMethod(entry, "getDefinition")
      const raw = loader ? await loader() : entry.provider?.definition || {}

      return {
        plugin: {
          name: entry.name,
          title: entry.title,
          description: entry.description,
          configurable: Boolean(entry.configurable),
          tags: [...entry.tags],
        },
        sections: normalizeSections(raw?.sections),
        pages: normalizePages(entry.name, raw?.pages),
      }
    },

    async listScopes(name, scope, context = {}) {
      const entry = byName.get(String(name || ""))
      if (!entry?.provider) return []
      const fn = getProviderMethod(entry, "listScopes")
      if (!fn) return []
      const scopes = await fn({ scope: String(scope || ""), ...context })
      return asArray(scopes)
        .map((item, index) => {
          if (!item || typeof item !== "object") return null
          return {
            id: String(item.id || item.value || `scope_${index + 1}`),
            label: String(item.label || item.id || item.value || `scope_${index + 1}`),
            description: item.description ? String(item.description) : "",
          }
        })
        .filter(Boolean)
    },

    async getValues(name, params = {}) {
      const entry = byName.get(String(name || ""))
      if (!entry?.provider) return null
      const fn = getProviderMethod(entry, "getValues", "getConfig")
      if (!fn) return null
      return await fn(params)
    },

    async updateValues(name, params = {}) {
      const entry = byName.get(String(name || ""))
      if (!entry?.provider) return null
      const fn = getProviderMethod(entry, "updateValues", "updateConfig")
      if (!fn) return null
      return await fn(params)
    },

    mount(app, helpers = {}) {
      for (const entry of entries) {
        if (entry.staticDir) {
          app.use(
            `/webui/plugins/${entry.name}/static`,
            express.static(entry.staticDir, { index: false, fallthrough: true }),
          )
        }

        if (entry?.provider && typeof entry.provider.mountRoutes === "function") {
          const router = express.Router()
          entry.provider.mountRoutes(router, { ...helpers, entry })
          app.use(`/webui/plugins/${entry.name}`, router)
        }
      }
    },
  }
}
