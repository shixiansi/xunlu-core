const PAGE = document.body.dataset.page || "dashboard"
const API_BASE = "/webui/api"

const state = {
  session: null,
  plugins: [],
  activePlugin: "",
  pluginStates: new Map(),
}

const $ = selector => document.querySelector(selector)

function setToast(message, kind = "", target = "#toast") {
  const el = $(target)
  if (!el) return
  el.className = `toast${kind ? ` ${kind}` : ""}`
  el.textContent = message || ""
}

async function api(path, options = {}) {
  const headers = {
    ...(options.body ? { "content-type": "application/json" } : {}),
    ...(options.headers || {}),
  }

  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...options,
    headers,
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.ok === false) {
    const error = new Error(json.error || `HTTP ${res.status}`)
    error.status = res.status
    throw error
  }

  return json
}

function deepGet(obj, rawPath) {
  const path = String(rawPath || "").trim()
  if (!path) return obj
  return path.split(".").reduce((current, key) => (current && typeof current === "object" ? current[key] : undefined), obj)
}

function deepSet(target, rawPath, value) {
  const path = String(rawPath || "").trim()
  if (!path) return value

  const parts = path.split(".")
  let current = target
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i]
    if (!current[key] || typeof current[key] !== "object") current[key] = {}
    current = current[key]
  }
  current[parts[parts.length - 1]] = value
  return target
}

function escapeHtml(input) {
  return String(input || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function encodeOptionValue(value) {
  return encodeURIComponent(JSON.stringify(value))
}

function decodeOptionValue(value) {
  return JSON.parse(decodeURIComponent(String(value || "")))
}

function normalizeFieldValue(field, value) {
  if (field.type === "array") {
    return Array.isArray(value) ? value.join("\n") : ""
  }
  if (field.type === "json") {
    return value && typeof value === "object" ? JSON.stringify(value, null, 2) : ""
  }
  if (field.type === "boolean") {
    return Boolean(value)
  }
  if (field.type === "select") {
    return encodeOptionValue(value === undefined ? field.default ?? "" : value)
  }
  return value === undefined || value === null ? "" : value
}

function readFieldValue(field, input) {
  if (field.type === "boolean") return Boolean(input.checked)
  if (field.type === "number") {
    const raw = input.value.trim()
    if (!raw && field.allowEmpty) return null
    return raw === "" ? 0 : Number(raw)
  }
  if (field.type === "array") {
    return input.value
      .split(/\r?\n/g)
      .map(item => item.trim())
      .filter(Boolean)
  }
  if (field.type === "json") {
    const raw = input.value.trim()
    if (!raw) return {}
    return JSON.parse(raw)
  }
  if (field.type === "select") {
    return decodeOptionValue(input.value)
  }
  if (field.allowEmpty && input.value.trim() === "") return null
  return input.value
}

function getPluginState(pluginName) {
  if (!state.pluginStates.has(pluginName)) {
    state.pluginStates.set(pluginName, {
      definition: null,
      scopes: {},
      selections: {},
      payloads: {},
    })
  }
  return state.pluginStates.get(pluginName)
}

async function loadSession() {
  const res = await api("/auth/session")
  state.session = res
  return res
}

async function loadPlugins() {
  const res = await api("/plugins")
  state.plugins = Array.isArray(res.plugins) ? res.plugins : []
  if (!state.activePlugin || !state.plugins.find(item => item.name === state.activePlugin)) {
    state.activePlugin = state.plugins[0]?.name || ""
  }
}

async function ensureDefinition(pluginName) {
  const pluginState = getPluginState(pluginName)
  if (pluginState.definition) return pluginState.definition
  const res = await api(`/plugins/${encodeURIComponent(pluginName)}/definition`)
  pluginState.definition = res.definition
  return pluginState.definition
}

async function ensureScopeOptions(pluginName, scope) {
  const pluginState = getPluginState(pluginName)
  if (pluginState.scopes[scope]) return pluginState.scopes[scope]
  const res = await api(`/plugins/${encodeURIComponent(pluginName)}/scopes?scope=${encodeURIComponent(scope)}`)
  pluginState.scopes[scope] = Array.isArray(res.scopes) ? res.scopes : []
  if (!pluginState.selections[scope] && pluginState.scopes[scope][0]) {
    pluginState.selections[scope] = pluginState.scopes[scope][0].id
  }
  return pluginState.scopes[scope]
}

async function ensureValues(pluginName, scope) {
  const pluginState = getPluginState(pluginName)
  let scopeId = ""

  if (scope !== "global") {
    const options = await ensureScopeOptions(pluginName, scope)
    scopeId = pluginState.selections[scope] || options[0]?.id || ""
    pluginState.selections[scope] = scopeId
    if (!scopeId) {
      pluginState.payloads[scope] = { values: {}, meta: {}, message: "" }
      return pluginState.payloads[scope]
    }
  }

  const params = new URLSearchParams({ scope })
  if (scopeId) params.set("scope_id", scopeId)
  const res = await api(`/plugins/${encodeURIComponent(pluginName)}/config?${params.toString()}`)
  pluginState.payloads[scope] = {
    values: res.values || {},
    meta: res.meta || {},
    message: res.message || "",
  }
  return pluginState.payloads[scope]
}

function renderPluginList() {
  const listEl = $("#pluginList")
  if (!listEl) return

  listEl.innerHTML = state.plugins
    .map(plugin => {
      const classes = [
        "plugin-item",
        plugin.name === state.activePlugin ? "active" : "",
        plugin.configurable ? "" : "disabled",
      ]
        .filter(Boolean)
        .join(" ")
      const desc = plugin.description || (plugin.configurable ? "已接入共享配置面板" : "尚未声明共享 WebUI 协议")
      return `
        <button class="${classes}" type="button" data-plugin="${escapeHtml(plugin.name)}">
          <h3>${escapeHtml(plugin.title || plugin.name)}</h3>
          <p>${escapeHtml(desc)}</p>
        </button>
      `
    })
    .join("")

  listEl.querySelectorAll("[data-plugin]").forEach(button => {
    button.addEventListener("click", () => {
      state.activePlugin = button.dataset.plugin || ""
      void refreshActivePlugin().catch(handleError)
    })
  })
}

function renderHeader(definition) {
  $("#pluginTitle").textContent = definition?.plugin?.title || state.activePlugin || "未选择插件"
  $("#pluginDescription").textContent = definition?.plugin?.description || "这个页面会读取插件声明的共享配置协议。"

  const tagEl = $("#pluginTags")
  tagEl.innerHTML = (definition?.plugin?.tags || [])
    .map(tag => `<span class="tag">${escapeHtml(tag)}</span>`)
    .join("")
}

function renderField(field, values, scopeKey) {
  const value = deepGet(values, field.path)
  const normalized = normalizeFieldValue(field, value)
  const classes = ["field"]
  if (field.type === "textarea" || field.type === "array" || field.type === "json") classes.push("wide")

  if (field.type === "boolean") {
    return `
      <label class="checkbox-field">
        <input
          type="checkbox"
          data-scope-key="${escapeHtml(scopeKey)}"
          data-path="${escapeHtml(field.path)}"
          data-type="${escapeHtml(field.type)}"
          ${normalized ? "checked" : ""}
        />
        <span>${escapeHtml(field.label || field.path)}</span>
        ${field.description ? `<small>${escapeHtml(field.description)}</small>` : ""}
      </label>
    `
  }

  if (field.type === "textarea" || field.type === "array" || field.type === "json") {
    return `
      <label class="${classes.join(" ")}">
        <span>${escapeHtml(field.label || field.path)}</span>
        <textarea
          rows="${Number(field.rows) > 0 ? Number(field.rows) : 6}"
          data-scope-key="${escapeHtml(scopeKey)}"
          data-path="${escapeHtml(field.path)}"
          data-type="${escapeHtml(field.type)}"
          ${field.allowEmpty ? 'data-allow-empty="1"' : ""}
          placeholder="${escapeHtml(field.placeholder || "")}"
        >${escapeHtml(normalized)}</textarea>
        ${field.description ? `<small>${escapeHtml(field.description)}</small>` : ""}
      </label>
    `
  }

  if (field.type === "select") {
    const options = Array.isArray(field.options) ? field.options : []
    const optionHtml = options
      .map(option => {
        const selected = encodeOptionValue(option.value) === normalized ? "selected" : ""
        return `<option value="${encodeOptionValue(option.value)}" ${selected}>${escapeHtml(option.label)}</option>`
      })
      .join("")
    return `
      <label class="${classes.join(" ")}">
        <span>${escapeHtml(field.label || field.path)}</span>
        <select
          data-scope-key="${escapeHtml(scopeKey)}"
          data-path="${escapeHtml(field.path)}"
          data-type="${escapeHtml(field.type)}"
        >${optionHtml}</select>
        ${field.description ? `<small>${escapeHtml(field.description)}</small>` : ""}
      </label>
    `
  }

  return `
    <label class="${classes.join(" ")}">
      <span>${escapeHtml(field.label || field.path)}</span>
      <input
        type="${escapeHtml(field.inputType || (field.type === "number" ? "number" : "text"))}"
        value="${escapeHtml(String(normalized))}"
        data-scope-key="${escapeHtml(scopeKey)}"
        data-path="${escapeHtml(field.path)}"
        data-type="${escapeHtml(field.type || "text")}"
        ${field.allowEmpty ? 'data-allow-empty="1"' : ""}
        ${field.min !== undefined ? `min="${escapeHtml(field.min)}"` : ""}
        ${field.max !== undefined ? `max="${escapeHtml(field.max)}"` : ""}
        ${field.step !== undefined ? `step="${escapeHtml(field.step)}"` : ""}
        placeholder="${escapeHtml(field.placeholder || "")}"
      />
      ${field.description ? `<small>${escapeHtml(field.description)}</small>` : ""}
    </label>
  `
}

function collectScopeValues(scopeKey, fields) {
  const payload = {}

  for (const field of fields) {
    const input = document.querySelector(`[data-scope-key="${CSS.escape(scopeKey)}"][data-path="${CSS.escape(field.path)}"]`)
    if (!input) continue
    const allowEmpty = input.dataset.allowEmpty === "1" || field.allowEmpty
    const value = readFieldValue({ ...field, allowEmpty }, input)
    deepSet(payload, field.path, value)
  }

  return payload
}

function groupSectionsByScope(sections = []) {
  const map = new Map()
  for (const section of sections) {
    const scope = section.scope || "global"
    if (!map.has(scope)) map.set(scope, [])
    map.get(scope).push(section)
  }
  return map
}

async function saveScope(pluginName, scope, sections) {
  const pluginState = getPluginState(pluginName)
  const fields = sections.flatMap(section => Array.isArray(section.fields) ? section.fields : [])
  const scopeKey = `${pluginName}:${scope}`
  const values = collectScopeValues(scopeKey, fields)
  const scopeId = scope === "global" ? "" : pluginState.selections[scope] || ""

  const res = await api(`/plugins/${encodeURIComponent(pluginName)}/config`, {
    method: "POST",
    body: JSON.stringify({
      scope,
      scope_id: scopeId,
      values,
    }),
  })

  pluginState.payloads[scope] = {
    values: res.values || {},
    meta: res.meta || {},
    message: res.message || "",
  }

  setToast(res.message || "配置已保存", "ok")
  await renderPluginPanel()
}

function renderScope(scope, sections, payload, scopeOptions, currentSelection, pluginName) {
  const scopeLabel = scope === "global" ? "全局配置" : `${scope} 配置`
  const scopeKey = `${pluginName}:${scope}`
  const summary = payload.meta?.summary ? `<p class="scope-meta">${escapeHtml(payload.meta.summary)}</p>` : ""

  const selectorHtml =
    scope === "global"
      ? ""
      : `
        <div class="field">
          <span>选择 ${escapeHtml(scope)}</span>
          <select data-scope-select="${escapeHtml(scope)}">
            ${scopeOptions
              .map(option => {
                const selected = option.id === currentSelection ? "selected" : ""
                return `<option value="${escapeHtml(option.id)}" ${selected}>${escapeHtml(option.label)}</option>`
              })
              .join("")}
          </select>
        </div>
      `

  const emptyText =
    scope !== "global" && !scopeOptions.length
      ? `<p class="muted">${escapeHtml(sections[0]?.emptyText || `暂无可配置的 ${scope}`)}</p>`
      : ""

  const cardsHtml = sections
    .map(section => {
      const fieldsHtml = (section.fields || []).map(field => renderField(field, payload.values || {}, scopeKey)).join("")
      return `
        <div class="section-card">
          <div>
            <h4>${escapeHtml(section.title)}</h4>
            ${section.description ? `<p class="muted">${escapeHtml(section.description)}</p>` : ""}
          </div>
          <div class="field-grid">${fieldsHtml}</div>
        </div>
      `
    })
    .join("")

  return `
    <section class="scope-card panel">
      <div class="scope-head">
        <div>
          <p class="eyebrow">${escapeHtml(scopeLabel)}</p>
          <h4>${escapeHtml(scope === "global" ? "统一表单" : `按 ${scope} 选择`)}</h4>
          ${summary}
        </div>
        ${selectorHtml}
      </div>
      ${emptyText || cardsHtml}
      ${scopeOptions.length || scope === "global" ? `<div class="panel-actions"><button type="button" data-save-scope="${escapeHtml(scope)}">保存 ${escapeHtml(scopeLabel)}</button></div>` : ""}
    </section>
  `
}

async function renderPluginPanel() {
  const plugin = state.plugins.find(item => item.name === state.activePlugin)
  const panel = $("#pluginPanel")
  if (!plugin || !panel) return

  const definition = await ensureDefinition(plugin.name)
  renderHeader(definition)

  if (!plugin.configurable) {
    panel.innerHTML = `
      <div class="panel-empty">
        <h3>${escapeHtml(plugin.title || plugin.name)} 尚未接入共享 WebUI</h3>
        <p>为这个插件新增 <code>src/plugins/${escapeHtml(plugin.name)}/webui/index.js</code> 后，就可以出现在统一配置面板里。</p>
      </div>
    `
    return
  }

  const grouped = groupSectionsByScope(definition.sections || [])
  const pluginState = getPluginState(plugin.name)

  for (const scope of grouped.keys()) {
    await ensureValues(plugin.name, scope)
  }

  const pagesHtml = Array.isArray(definition.pages) && definition.pages.length
    ? `
      <div class="pages-row">
        ${definition.pages
          .map(page => `<a class="page-link" href="${escapeHtml(page.url)}" target="_blank" rel="noreferrer">${escapeHtml(page.title)}</a>`)
          .join("")}
      </div>
    `
    : ""

  const scopesHtml = Array.from(grouped.entries())
    .map(([scope, sections]) => {
      const options = scope === "global" ? [] : pluginState.scopes[scope] || []
      const payload = pluginState.payloads[scope] || { values: {}, meta: {}, message: "" }
      const currentSelection = pluginState.selections[scope] || options[0]?.id || ""
      return renderScope(scope, sections, payload, options, currentSelection, plugin.name)
    })
    .join("")

  panel.innerHTML = `${pagesHtml}${scopesHtml}`

  panel.querySelectorAll("[data-scope-select]").forEach(select => {
    select.addEventListener("change", async event => {
      const scope = event.currentTarget.dataset.scopeSelect || ""
      pluginState.selections[scope] = event.currentTarget.value
      await ensureValues(plugin.name, scope)
      await renderPluginPanel()
    })
  })

  panel.querySelectorAll("[data-save-scope]").forEach(button => {
    button.addEventListener("click", () => {
      const scope = button.dataset.saveScope || "global"
      void saveScope(plugin.name, scope, grouped.get(scope) || []).catch(handleError)
    })
  })
}

async function refreshActivePlugin() {
  renderPluginList()
  await renderPluginPanel()
}

async function reloadPluginsAndRender() {
  await loadPlugins()
  await refreshActivePlugin()
}

function syncSessionUi() {
  const safe = state.session?.config || {}
  const title = safe?.ui?.title || "xunlu-core WebUI"
  const username = state.session?.user?.username || safe?.auth?.username || "admin"

  $("#uiTitle").textContent = title
  $("#sessionUser").textContent = username

  if ($("#sys_title")) $("#sys_title").value = title
}

async function saveSystemSettings() {
  const title = $("#sys_title")?.value?.trim() || undefined
  const username = $("#sys_username")?.value?.trim() || undefined
  const password = $("#sys_password")?.value || undefined
  const rotate = Boolean($("#sys_rotate")?.checked)

  const res = await api("/auth/update", {
    method: "POST",
    body: JSON.stringify({
      title,
      username,
      password: password || undefined,
      rotate_token_secret: rotate,
    }),
  })

  if (rotate) {
    location.href = "/webui/login"
    return
  }

  if ($("#sys_username")) $("#sys_username").value = ""
  if ($("#sys_password")) $("#sys_password").value = ""
  if ($("#sys_rotate")) $("#sys_rotate").checked = false

  state.session.config = res.config
  syncSessionUi()
  setToast("系统设置已保存", "ok")
}

async function logout() {
  await api("/auth/logout", { method: "POST" })
  location.href = "/webui/login"
}

function handleError(error) {
  if (Number(error?.status) === 401) {
    location.href = "/webui/login"
    return
  }
  setToast(error?.message || String(error), "err", PAGE === "login" ? "#loginToast" : "#toast")
}

async function initDashboard() {
  await loadSession()
  if (!state.session?.authenticated) {
    location.href = "/webui/login"
    return
  }

  syncSessionUi()
  await loadPlugins()
  renderPluginList()
  await renderPluginPanel()

  $("#btnReloadPlugins")?.addEventListener("click", () => void reloadPluginsAndRender().catch(handleError))
  $("#btnLogout")?.addEventListener("click", () => void logout().catch(handleError))
  $("#btnSaveSystem")?.addEventListener("click", () => void saveSystemSettings().catch(handleError))
}

async function initLogin() {
  const session = await loadSession()
  const safe = session?.config || {}
  $("#loginTitle").textContent = safe?.ui?.title || "统一插件 WebUI"

  if (session?.authenticated) {
    location.href = "/webui"
    return
  }

  $("#loginForm")?.addEventListener("submit", async event => {
    event.preventDefault()
    const username = $("#loginUsername").value.trim()
    const password = $("#loginPassword").value
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      })
      location.href = "/webui"
    } catch (error) {
      handleError(error)
    }
  })
}

if (PAGE === "login") {
  void initLogin().catch(handleError)
} else {
  void initDashboard().catch(handleError)
}
