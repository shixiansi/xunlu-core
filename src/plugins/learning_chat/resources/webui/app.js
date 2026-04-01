const $ = s => document.querySelector(s)

function toast(text, kind = "") {
  const el = $("#toast")
  el.className = "msg" + (kind ? ` ${kind}` : "")
  el.textContent = text || ""
}

async function api(path, options) {
  const res = await fetch(path, { credentials: "include", ...(options || {}) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.ok === false) {
    const err = json.error || `HTTP ${res.status}`
    throw new Error(err)
  }
  return json
}

function linesToArray(text) {
  return String(text || "")
    .split(/\r?\n/g)
    .map(s => s.trim())
    .filter(Boolean)
}

function boolVal(selectId) {
  return String($(selectId).value) === "true"
}

function setBool(selectId, v) {
  $(selectId).value = v ? "true" : "false"
}

function setText(id, v) {
  $(id).value = v === undefined || v === null ? "" : String(v)
}

function fmtTime(tsSecOrMs) {
  const n = Number(tsSecOrMs) || 0
  if (!n) return ""
  const ms = n < 10_000_000_000 ? n * 1000 : n
  const d = new Date(ms)
  return d.toLocaleString()
}

let state = {
  config: null,
  groups: [],
  selectedGid: "",
}

async function loadAll() {
  const cfg = await api("./api/config")
  const groupsRes = await api("./api/groups")
  state.config = cfg.config
  state.groups = groupsRes.groups || []

  $("#versionText").textContent = `v${state.config?.version || 1}`
  $("#authUser").textContent = `user: ${state.config?.auth?.username || "chat"}`

  // global
  setText("#g_reply_threshold", state.config.learning.reply_threshold)
  setText("#g_reply_prob", state.config.learning.reply_prob)
  setText("#g_reply_cooldown_sec", state.config.learning.reply_cooldown_sec)
  setText("#g_learn_max_gap_sec", state.config.learning.learn_max_gap_sec)
  setBool("#g_repeat_enable", state.config.repeat.enable)
  setText("#g_repeat_threshold", state.config.repeat.threshold)
  setBool("#g_proactive_enable", state.config.proactive.enable)
  setBool("#g_proactive_command_enable", state.config.proactive.command_enable)
  setBool("#g_proactive_allow_default", state.config.proactive.allow_default)
  setText("#g_block_words", (state.config.learning.block_words || []).join("\n"))
  setText("#g_block_users", (state.config.learning.block_users || []).join("\n"))

  // groups selector
  const sel = $("#groupSelect")
  sel.innerHTML = ""
  const list = state.groups.slice().sort((a, b) => String(a.group_id).localeCompare(String(b.group_id)))
  for (const g of list) {
    const opt = document.createElement("option")
    opt.value = g.group_id
    opt.textContent = g.group_id
    sel.appendChild(opt)
  }
  if (!state.selectedGid && list.length) state.selectedGid = list[0].group_id
  sel.value = state.selectedGid
  await onGroupChange()
}

async function onGroupChange() {
  const gid = $("#groupSelect").value
  state.selectedGid = gid
  const g = state.groups.find(x => String(x.group_id) === String(gid))
  const effective = g?.effective || {}
  const override = g?.override || {}
  if (g?.heat) {
    const h = g.heat
    $("#groupSummary").value = `today=${h.messagesToday || 0}, avg=${Math.round(h.avgIntervalSec || 0)}s, last=${fmtTime(
      h.lastMsgAt || 0,
    )}, lastFromBot=${h.lastMsgFromBot ? "yes" : "no"}`
  } else {
    $("#groupSummary").value = ""
  }

  // group config
  setBool("#c_learning_enabled", Boolean(effective.learning_enabled))
  setBool("#c_proactive_enabled", Boolean(effective.proactive_enabled))
  setBool("#c_proactive_command_enabled", Boolean(effective.proactive_command_enabled))
  setText("#c_reply_prob", override.reply_prob !== undefined ? override.reply_prob : "")
  setText("#c_block_words", (override.block_words || []).join("\n"))
  setText("#c_block_users", (override.block_users || []).join("\n"))

  await loadLearned()
  await loadBans()
  await loadMessages()
}

async function saveGlobal() {
  const patch = {
    learning: {
      reply_threshold: Number($("#g_reply_threshold").value),
      reply_prob: Number($("#g_reply_prob").value),
      reply_cooldown_sec: Number($("#g_reply_cooldown_sec").value),
      learn_max_gap_sec: Number($("#g_learn_max_gap_sec").value),
      block_words: linesToArray($("#g_block_words").value),
      block_users: linesToArray($("#g_block_users").value),
    },
    repeat: {
      enable: boolVal("#g_repeat_enable"),
      threshold: Number($("#g_repeat_threshold").value),
    },
    proactive: {
      enable: boolVal("#g_proactive_enable"),
      command_enable: boolVal("#g_proactive_command_enable"),
      allow_default: boolVal("#g_proactive_allow_default"),
    },
  }

  await api("./api/config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ patch }),
  })
  toast("已保存全局配置", "ok")
  await loadAll()
}

async function saveGroup() {
  const gid = state.selectedGid
  const replyProbRaw = $("#c_reply_prob").value.trim()
  const patch = {
    learning_enabled: boolVal("#c_learning_enabled"),
    proactive_enabled: boolVal("#c_proactive_enabled"),
    proactive_command_enabled: boolVal("#c_proactive_command_enabled"),
    block_words: linesToArray($("#c_block_words").value),
    block_users: linesToArray($("#c_block_users").value),
  }
  if (replyProbRaw !== "") patch.reply_prob = Number(replyProbRaw)

  await api("./api/config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ group_id: gid, patch }),
  })
  toast("已保存本群配置", "ok")
  await loadAll()
}

async function loadLearned() {
  const gid = state.selectedGid
  const res = await api(`./api/groups/${encodeURIComponent(gid)}/learned?limit=50&offset=0`)
  const tbody = $("#learnedTbody")
  tbody.innerHTML = ""
  for (const it of res.items || []) {
    const tr = document.createElement("tr")
    tr.innerHTML = `
      <td>${it.count}</td>
      <td>${escapeHtml(it.from_preview || it.from_hash)}</td>
      <td>${escapeHtml(it.to_preview || it.to_hash)}</td>
      <td class="mono">${escapeHtml(it.to_hash)}</td>
      <td><button class="danger" data-ban="${escapeHtml(it.to_hash)}">禁用</button></td>
    `
    tbody.appendChild(tr)
  }
  tbody.querySelectorAll("button[data-ban]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const h = btn.getAttribute("data-ban")
      if (!h) return
      await api(`./api/groups/${encodeURIComponent(gid)}/ban`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reply_hash: h }),
      })
      toast("已禁用该回复", "ok")
      await loadBans()
    })
  })
}

async function loadBans() {
  const gid = state.selectedGid
  const res = await api(`./api/groups/${encodeURIComponent(gid)}/bans`)
  const tbody = $("#bansTbody")
  tbody.innerHTML = ""
  for (const it of res.items || []) {
    const tr = document.createElement("tr")
    tr.innerHTML = `
      <td>${fmtTime(it.created_at)}</td>
      <td>${escapeHtml(it.preview || "")}</td>
      <td class="mono">${escapeHtml(it.reply_hash)}</td>
      <td><button class="ghost" data-unban="${escapeHtml(it.reply_hash)}">解除</button></td>
    `
    tbody.appendChild(tr)
  }
  tbody.querySelectorAll("button[data-unban]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const h = btn.getAttribute("data-unban")
      if (!h) return
      await api(`./api/groups/${encodeURIComponent(gid)}/unban`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reply_hash: h }),
      })
      toast("已解除禁用", "ok")
      await loadBans()
    })
  })
}

async function loadMessages() {
  const gid = state.selectedGid
  const res = await api(`./api/groups/${encodeURIComponent(gid)}/messages?limit=50`)
  const tbody = $("#msgTbody")
  tbody.innerHTML = ""
  for (const it of res.items || []) {
    const tr = document.createElement("tr")
    tr.innerHTML = `
      <td>${fmtTime(it.time)}</td>
      <td class="mono">${escapeHtml(it.user_id)}</td>
      <td>${escapeHtml(it.preview || "")}</td>
      <td class="mono">${escapeHtml(it.message_id)}</td>
    `
    tbody.appendChild(tr)
  }
}

async function logout() {
  await api("./api/logout", { method: "POST" })
  location.href = "./login"
}

async function saveAuth() {
  const username = $("#auth_username").value.trim()
  const password = $("#auth_password").value
  const rotate = boolVal("#auth_rotate")

  await api("./api/auth/update", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: username || undefined,
      password: password || undefined,
      rotate_token_secret: rotate,
    }),
  })

  if (rotate) {
    toast("已旋转 token_secret，请重新登录", "ok")
    await logout()
    return
  }

  toast("安全设置已保存", "ok")
  $("#auth_username").value = ""
  $("#auth_password").value = ""
  $("#auth_rotate").value = "false"
  await loadAll()
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

$("#btnReload").addEventListener("click", () => void loadAll().catch(err => toast(err.message, "err")))
$("#btnLogout").addEventListener("click", () => void logout().catch(err => toast(err.message, "err")))
$("#groupSelect").addEventListener("change", () => void onGroupChange().catch(err => toast(err.message, "err")))
$("#btnSaveGlobal").addEventListener("click", () => void saveGlobal().catch(err => toast(err.message, "err")))
$("#btnSaveGroup").addEventListener("click", () => void saveGroup().catch(err => toast(err.message, "err")))
$("#btnSaveAuth").addEventListener("click", () => void saveAuth().catch(err => toast(err.message, "err")))

void loadAll().catch(err => {
  toast(err.message || String(err), "err")
  if (String(err.message || "").includes("Unauthorized")) {
    setTimeout(() => (location.href = "./login"), 600)
  }
})
