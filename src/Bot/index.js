import { loadPlugins } from "../lib/pluginLoader.js"
import Render from "../utils/render.js"
import path from "path"
import lodash from "lodash"
import cfg from "../lib/config.js"
import schedule from "node-schedule"
import env from "../lib/env.js"
import getImageDisplay from "../utils/imgdisplay.js"
import MessageDB from "../db/MessageDB.js"
import CommandUsageDB from "../db/CommandUsageDB.js"
import {
  attachStandardMessageApis,
  applyDerivedFieldsFromUniversalSegments,
  coerceToUniversalMessage,
  getMessageRefFromCtx,
  parseTextWithFaces,
} from "./message/context.js"
import {
  UniversalMessage,
  UniversalMessageSegment,
  UniversalSegmentType,
} from "./message/universal-message.js"
import { applyUniversalBotApi } from "./api/universal-bot-api.js"
import { rememberRuntimeLastGroupMessage } from "./runtime-last-message.js"
import {
  invokeYunzaiCommandByReg as invokeYunzaiRecordedCommandByReg,
  invokeYunzaiCommandByText,
} from "./yunzai/command-bridge.js"
import {
  callRuntimeBotGroupMemberInfo,
  callRuntimeBotGroupMemberList,
  extractMemberRoleFlags,
  findMemberInfoInGroupMemberList,
  isPlaceholderMemberInfo,
  pickGroupMemberRoleInfo,
  selectPreferredRoleFlags,
} from "./member-role-utils.js"

function normalizeEventId(value) {
  if (value === undefined || value === null) return undefined
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined
  const text = String(value).trim()
  if (!text) return undefined
  const num = Number(text)
  return Number.isFinite(num) ? num : text
}

function normalizeOptionalString(value) {
  const text = String(value ?? "").trim()
  return text || ""
}

function normalizeEventTargetFields(e) {
  if (!e || typeof e !== "object") return

  const targetIdRaw = e.target_id ?? e.targetId ?? e.receiver_id ?? e.receiverId
  const targetId = normalizeEventId(targetIdRaw)

  if (targetId !== undefined) {
    e.target_id = targetId
    e.targetId = targetId
    e.receiver_id = targetId
    e.receiverId = targetId
  }

  const senderIdRaw = e.sender_id ?? e.senderId ?? e.initiator_id ?? e.initiatorId
  const senderId = normalizeEventId(senderIdRaw)
  if (senderId !== undefined) {
    e.sender_id = senderId
    e.senderId = senderId
  }

  const operatorIdRaw = e.operator_id ?? e.operatorId ?? senderId
  const operatorId = normalizeEventId(operatorIdRaw)
  if (operatorId !== undefined) {
    e.operator_id = operatorId
    e.operatorId = operatorId
  }

  if (e.post_type === "notice" && e.sub_type === "poke") {
    const inferredTarget = targetId ?? normalizeEventId(e.user_id)
    if (inferredTarget !== undefined) {
      e.target_id = inferredTarget
      e.targetId = inferredTarget
      e.receiver_id = inferredTarget
      e.receiverId = inferredTarget
    }
    if (senderId !== undefined) e.user_id = senderId
    return
  }

  if (senderId !== undefined) e.user_id = senderId
}

const GROUP_MEMBER_ROLE_CACHE_TTL_MS = 60 * 1000
const GROUP_BOT_ROLE_CACHE_TTL_MS = 5 * 60 * 1000
const groupMemberRoleCache = new Map()
const groupBotRoleCache = new Map()

function getRoleFlags(info) {
  return extractMemberRoleFlags(info)
}

function applyRoleFlags(target, flags) {
  const base = target && typeof target === "object" ? target : {}
  const next = { ...base }
  if (!flags) return next

  if (flags.role && !next.role) next.role = flags.role
  if (flags.isOwner !== null && flags.isOwner !== undefined) {
    next.is_owner = Boolean(flags.isOwner)
    next.isOwner = Boolean(flags.isOwner)
  }
  if (flags.isAdmin !== null && flags.isAdmin !== undefined) {
    next.is_admin = Boolean(flags.isAdmin)
    next.isAdmin = Boolean(flags.isAdmin)
  }
  if (!next._info || typeof next._info !== "object") next._info = {}
  if (flags.role && !next._info.role) next._info.role = flags.role
  return next
}

function getSelfIdFromCtx(e) {
  return normalizeEventId(
    e?.self_id ?? e?.bot?.uin ?? e?.bot?.self_id ?? globalThis.Bot?.uin ?? globalThis.Bot?.self_id,
  )
}

function pickMemberInfoSafe(group, userId, { ignorePlaceholder = false } = {}) {
  return pickGroupMemberRoleInfo(group, userId, { ignorePlaceholder })
}

function getCachedRoleFlags(cache, key, ttlMs, now = Date.now()) {
  const cached = cache.get(key)
  if (!cached) return null
  if (now - Number(cached.ts || 0) >= ttlMs) {
    cache.delete(key)
    return null
  }
  return cached.flags || null
}

function setCachedRoleFlags(cache, key, flags, now = Date.now()) {
  if (!flags) return
  cache.set(key, { ts: now, flags })
  while (cache.size > 2000) {
    const firstKey = cache.keys().next()
    if (firstKey.done) break
    cache.delete(firstKey.value)
  }
}

async function enrichGroupRoleFlags(e) {
  if (!e || typeof e !== "object" || !e.group_id) return

  const groupId = normalizeEventId(e.group_id)
  const userId = normalizeEventId(e.user_id ?? e.sender_id)
  const selfId = getSelfIdFromCtx(e)
  const now = Date.now()

  const senderFlags =
    getRoleFlags(e.member) ??
    getRoleFlags(e.group_member) ??
    getRoleFlags(e.sender) ??
    getRoleFlags(pickMemberInfoSafe(e.group, userId, { ignorePlaceholder: true }))

  let resolvedSenderFlags = senderFlags
  const senderCacheKey = groupId !== undefined && userId !== undefined ? `${groupId}:${userId}` : ""
  if (!resolvedSenderFlags && senderCacheKey) {
    resolvedSenderFlags = getCachedRoleFlags(
      groupMemberRoleCache,
      senderCacheKey,
      GROUP_MEMBER_ROLE_CACHE_TTL_MS,
      now,
    )
  }
  if (
    !resolvedSenderFlags &&
    groupId !== undefined &&
    userId !== undefined &&
    typeof e.getGroupMemberInfo === "function"
  ) {
    try {
      let info = null
      try {
        info = await e.getGroupMemberInfo(groupId, userId)
      } catch {
        info = await e.getGroupMemberInfo({ group_id: groupId, user_id: userId }).catch(() => null)
      }
      resolvedSenderFlags = getRoleFlags(info)
      if (resolvedSenderFlags && senderCacheKey) {
        setCachedRoleFlags(groupMemberRoleCache, senderCacheKey, resolvedSenderFlags, now)
      }
    } catch {}
  }

  if (userId !== undefined) {
    e.member = applyRoleFlags(
      e.member || {
        user_id: userId,
        nickname: e.sender?.nickname,
        card: e.sender?.card,
      },
      resolvedSenderFlags,
    )
  }
  if (resolvedSenderFlags) {
    e.sender = applyRoleFlags(e.sender, resolvedSenderFlags)
    e.isOwner = Boolean(resolvedSenderFlags.isOwner)
    e.isAdmin = Boolean(resolvedSenderFlags.isAdmin)
  } else {
    e.isOwner = Boolean(e.member?.is_owner ?? e.member?.isOwner ?? false)
    e.isAdmin = Boolean(e.member?.is_admin ?? e.member?.isAdmin ?? e.isOwner)
  }

  if (groupId === undefined || selfId === undefined) return

  const cacheKey = `${groupId}:${selfId}`
  const cached = getCachedRoleFlags(groupBotRoleCache, cacheKey, GROUP_BOT_ROLE_CACHE_TTL_MS, now)

  const localBotInfo = pickMemberInfoSafe(e.group, selfId)
  let selection = selectPreferredRoleFlags({
    directInfo: e.botMember,
    localInfo: localBotInfo,
    cachedFlags: cached,
    expectedUserId: selfId,
  })
  let botFlags = selection.flags
  let botFlagsSource = selection.source

  if (!botFlags && typeof e.getGroupMemberInfo === "function") {
    try {
      let info = null
      try {
        info = await e.getGroupMemberInfo(groupId, selfId)
      } catch {
        info = await e.getGroupMemberInfo({ group_id: groupId, user_id: selfId }).catch(() => null)
      }
      selection = selectPreferredRoleFlags({
        directInfo: e.botMember,
        localInfo: localBotInfo,
        cachedFlags: cached,
        upstreamInfo: info,
        expectedUserId: selfId,
      })
      botFlags = selection.flags
      botFlagsSource = selection.source
      if (botFlags && botFlagsSource === "upstream") {
        setCachedRoleFlags(groupBotRoleCache, cacheKey, botFlags, now)
      }
    } catch {}
  }
  if (!botFlags && typeof e.getGroupMemberList === "function") {
    try {
      let list = null
      try {
        list = await e.getGroupMemberList(groupId)
      } catch {
        list = await e.getGroupMemberList({ group_id: groupId }).catch(() => null)
      }
      const listInfo = findMemberInfoInGroupMemberList(list, selfId)
      const listFlags = getRoleFlags(listInfo)
      if (listFlags) {
        botFlags = listFlags
        botFlagsSource = "list"
        setCachedRoleFlags(groupBotRoleCache, cacheKey, botFlags, now)
      }
    } catch {}
  }
  if (!botFlags) {
    try {
      const runtimeInfo = await callRuntimeBotGroupMemberInfo(groupId, selfId)
      const runtimeFlags = getRoleFlags(runtimeInfo)
      if (runtimeFlags) {
        botFlags = runtimeFlags
        botFlagsSource = "runtime-upstream"
        setCachedRoleFlags(groupBotRoleCache, cacheKey, botFlags, now)
      }
    } catch {}
  }
  if (!botFlags) {
    try {
      const runtimeListInfo = await callRuntimeBotGroupMemberList(groupId, selfId)
      const runtimeListFlags = getRoleFlags(runtimeListInfo)
      if (runtimeListFlags) {
        botFlags = runtimeListFlags
        botFlagsSource = "runtime-list"
        setCachedRoleFlags(groupBotRoleCache, cacheKey, botFlags, now)
      }
    } catch {}
  }
 

  if (botFlags) {
    e.botMember = applyRoleFlags(
      e.botMember || {
        user_id: selfId,
      },
      botFlags,
    )
    e.botRole = botFlags.role
    e.botIsOwner = Boolean(botFlags.isOwner)
    e.botIsAdmin = Boolean(botFlags.isAdmin)
  }
}

export default class BaseBot {
  constructor(config) {
    const options = config && typeof config === "object" ? config : {}
    this.adapter = options.adapter
    this.scheduler =
      options.scheduler && typeof options.scheduler.scheduleJob === "function"
        ? options.scheduler
        : schedule
    this.timers = {
      setTimeout:
        typeof options?.timers?.setTimeout === "function"
          ? options.timers.setTimeout.bind(options.timers)
          : setTimeout,
      clearTimeout:
        typeof options?.timers?.clearTimeout === "function"
          ? options.timers.clearTimeout.bind(options.timers)
          : clearTimeout,
    }
    this.renderer =
      options.renderer && typeof options.renderer.render === "function" ? options.renderer : Render
    this.scheduledTasks = []
    this.plugins = {}
    this.pluginCatalog = {}
    this.groupReply = {}
    this.privateReply = {}
    this.onMount = []
  }

  async loadBotPlugins(options = {}) {
    try {
      const plugins = await loadPlugins(path.join(env.RootPath, "./src/plugins"), options)

      for (const plugin of plugins) {
        logger.info("加载插件:", plugin)
        await this.registerPlugin(plugin)
      }

      logger.info("插件加载完成，注册命令:", Object.keys(this.plugins))
    } catch (error) {
      logger.error("加载插件时出错:", error)
    }
  }

  async reloadBotPlugins(options = {}) {
    const cacheBust = options.cacheBust !== false

    this.plugins = {}
    this.pluginCatalog = {}
    this.onMount = []

    await this.loadBotPlugins({ cacheBust })
    await this.runMount()

    return Object.keys(this.plugins)
  }

  async renderImg(name, data, options = {}) {
    const tpl = options?.tpl || options?.template || name

    return await this.renderer.render(
      name,
      `/html/${name}/${tpl}.html`,
      {
        ...data,
      },
      {
        retType: "base64",
        beforeRender({ data }) {
          let resPath = data.pluResPath
          return {
            defaulthtml: env.RootPath + "/resources/html/common/" + "default.html",
            ...data,
            _res_path: resPath,
            RootPath: env.RootPath,
            version: "0.0.1",
            botname: String(process.env.xunLuEnv || ""),
            imgType: "png",
          }
        },
      },
    )
  }

  async registerPlugin(plugin) {
    if (!plugin.implementation?.register) return
    let idx = 1
    this.pluginCatalog[plugin.name] = {
      name: plugin.name,
      title: plugin.title || plugin.name,
      shortName: plugin.shortName || plugin.title || plugin.name,
      aliases: Array.isArray(plugin.aliases) ? plugin.aliases : [plugin.name],
      helpHidden: Boolean(plugin.helpHidden),
      entryPath: plugin.entryPath,
      rootDir: plugin.rootDir,
    }
    const pluginAPI = {
      registerCommand: this.createCommandRegistrar(plugin, idx),
      contextReply: this.createContextReplyHandler(),
      setTask: this.collectTimerTasks(),
      callFnc: this.callPluginFnc(),
      onMount: fnc => this.onMount.push(fnc),
      recordCommandUsage: this.recordCommandUsage.bind(this),
      buildSyntheticCommandEvent: this.buildSyntheticCommandEvent.bind(this),
      invokeCommandByReg: this.invokeCommandByReg.bind(this),
      invokeCommandByText: this.invokeCommandByText.bind(this),
      findCommandByReg: this.findCommandByReg.bind(this),
      renderImg: this.renderImg.bind(this),
    }

    // 补齐：通用 QQBot API（注册期可用）
    applyUniversalBotApi(pluginAPI, { bot: this, adapterHint: this.adapter })
    plugin.implementation.register(pluginAPI)
  }

  async runMount() {
    for (let fnc of this.onMount) {
      logger.info("执行初始化任务" + fnc.toString())

      try {
        await fnc()
      } catch (err) {
        logger.error(`执行onMount函数时出错: ${err.stack}`)
      }
    }
  }

  callPluginFnc() {
    return async (name, ctx) => {
      const bindEvent = this.bindEvent && typeof this.bindEvent === "object" ? this.bindEvent : {}
      ctx = {
        ...bindEvent,
        ...(ctx || {}),
      }

      // 确保 ctx.reply 存在且行为一致（依赖 ctx.sendMessage/recallMessage 等）
      delete ctx.reply
      this.reply(ctx)
      let p = Object.values(this.plugins).find(i => i.id == name)
      await p.fnc.call(ctx, ctx)
    }
  }

  collectTimerTasks() {
    return (interval, task) => {
      const runTask = async (ctxLike = {}) => {
        const extra = ctxLike && typeof ctxLike === "object" ? ctxLike : {}
        return await task({
          ...(this.bindEvent && typeof this.bindEvent === "object" ? this.bindEvent : {}),
          ...extra,
        })
      }

      const job = this.scheduler.scheduleJob(interval, () => {
        void runTask().catch(err => logger.error("[setTask] task failed:", err))
      })
      this.scheduledTasks.push({
        index: this.scheduledTasks.length,
        interval,
        task,
        runner: runTask,
        job,
      })
      return job
    }
  }

  getOrderedCommands() {
    return lodash.orderBy(Object.values(this.plugins), ["priority"], ["asc"])
  }

  shouldTrackCommandUsage(commandMeta, e = null) {
    if (!commandMeta || commandMeta.trackUsage === false) return false
    if (commandMeta.trackUsage === true) return true

    const regText = String(commandMeta?.reg || "").trim()
    if (!regText) return false

    const eventText = String(commandMeta?.event || e?.post_type || "message")
      .trim()
      .toLowerCase()

    return eventText.startsWith("message")
  }

  findCommandByReg(reg, options = {}) {
    const regText = String(reg || "").trim()
    if (!regText) return null
    const event = String(options.event || "message")
    const plugin = String(options.plugin || "").trim()

    const list = this.getOrderedCommands().filter(item => {
      if (String(item?.reg || "").trim() !== regText) return false
      if (plugin && String(item?.plugin || "") !== plugin) return false
      if (!event) return true
      return String(item?.event || "message") === event
    })

    return list[0] || null
  }

  findCommandByText(text, e, options = {}) {
    const commandText = String(text || "").trim()
    if (!commandText) return null

    const plugin = String(options?.plugin || "").trim()
    for (const item of this.getOrderedCommands()) {
      if (plugin && String(item?.plugin || "") !== plugin) continue
      if (item?.event && !this.filtEvent(e, item)) continue

      try {
        if (new RegExp(String(item?.reg || "")).test(commandText)) {
          return item
        }
      } catch (err) {
        logger.warn("[findCommandByText] invalid reg:", item?.reg, err?.message || err)
      }
    }

    return null
  }

  getCommandUsageSource(e) {
    if (e?.__commandUsageSource) return String(e.__commandUsageSource)
    if (e?.__proactiveCommand) return "proactive-command"

    const runtimeTakeoverProtocol = String(globalThis.Bot?.__xunlu_takeover_state?.protocol || "")
      .trim()
      .toLowerCase()
    const eventProtocol = String(e?.protocol || "")
      .trim()
      .toLowerCase()
    if (e?.__xunluTakeover || e?.__isTakeover || e?.__takeover) return "yunzai-takeover"
    if (runtimeTakeoverProtocol && eventProtocol && runtimeTakeoverProtocol === eventProtocol) {
      return "yunzai-takeover"
    }

    return "xunlu"
  }

  async recordCommandUsage(e, commandMeta) {
    if (!e || !commandMeta || e.__skipCommandUsageLog) return null
    if (!this.shouldTrackCommandUsage(commandMeta, e)) return null
    if (!e.group_id || !e.user_id) return null

    const rawCommand = String(e.raw_message || e.msg || "").trim()
    if (!rawCommand) return null

    const triggeredAt =
      Number(e.__commandTriggeredAt || 0) ||
      (Number(e.time) > 0 ? Number(e.time) * 1000 : Date.now())

    return await CommandUsageDB.recordUsage({
      groupId: e.group_id,
      userId: e.user_id,
      plugin: commandMeta.plugin,
      reg: commandMeta.reg,
      rawCommand,
      protocol: e.protocol || this.adapter || "",
      event: commandMeta.event || e.post_type || "message",
      priority: commandMeta.priority,
      source: this.getCommandUsageSource(e),
      triggeredAt,
      isSynthetic: Boolean(e.__synthetic),
    }).catch(err => {
      logger.warn("[recordCommandUsage] failed:", err?.message || err)
      return null
    })
  }

  async buildSyntheticCommandEvent({
    baseMessageRecord = {},
    rawCommand = "",
    reg = "",
    userId,
    groupId,
    peerId,
    scene,
    protocol = "",
    flags = {},
  } = {}) {
    const text = String(rawCommand || "").trim()
    const desiredScene = String(
      scene ??
        flags?.scene ??
        baseMessageRecord?.message_scene ??
        baseMessageRecord?.message_type ??
        ((groupId ?? baseMessageRecord?.group_id) ? "group" : "private"),
    )
      .trim()
      .toLowerCase()
    const isGroup = desiredScene !== "private"
    const gid = isGroup
      ? (groupId ?? baseMessageRecord?.group_id ?? baseMessageRecord?.peer_id)
      : undefined
    const uid = userId ?? baseMessageRecord?.user_id ?? baseMessageRecord?.sender_id
    const pid =
      peerId ??
      baseMessageRecord?.peer_id ??
      (isGroup ? gid : (baseMessageRecord?.user_id ?? baseMessageRecord?.sender_id ?? uid))
    if (!uid || !text || (isGroup ? !gid : !pid)) {
      throw new Error("[buildSyntheticCommandEvent] requires userId/rawCommand and a valid target")
    }

    const sender =
      baseMessageRecord?.sender && typeof baseMessageRecord.sender === "object"
        ? { ...baseMessageRecord.sender }
        : {}
    const runtimeBot = globalThis.Bot || null
    const selfId =
      baseMessageRecord?.self_id ??
      baseMessageRecord?.bot?.self_id ??
      baseMessageRecord?.bot?.uin ??
      this?.bindEvent?.self_id ??
      runtimeBot?.self_id ??
      runtimeBot?.uin ??
      runtimeBot?.user_id

    const event = {
      ...(this.bindEvent && typeof this.bindEvent === "object" ? this.bindEvent : {}),
      adapterType: this.adapter,
      protocol: String(protocol || baseMessageRecord?.protocol || this.adapter || "").toLowerCase(),
      post_type: "message",
      message_type: isGroup ? "group" : "private",
      sub_type: "normal",
      group_id: isGroup ? gid : undefined,
      peer_id: isGroup ? gid : pid,
      user_id: uid,
      sender_id: uid,
      target_id: isGroup ? gid : pid,
      receiver_id: isGroup ? gid : pid,
      self_id: selfId,
      message_id: baseMessageRecord?.message_id,
      seq: baseMessageRecord?.seq ?? baseMessageRecord?.message_seq,
      message_seq: baseMessageRecord?.message_seq ?? baseMessageRecord?.seq,
      time: Math.floor(Date.now() / 1000),
      raw_message: text,
      message_scene: isGroup ? "group" : "private",
      group_name: isGroup ? String(baseMessageRecord?.group_name || gid) : "",
      sender: {
        ...sender,
        user_id: uid,
        nickname: String(sender?.nickname || sender?.name || uid),
        card: String(sender?.card || sender?.nickname || sender?.name || uid),
      },
      message: [UniversalMessageSegment.text(text)],
      rawSegments: [UniversalMessageSegment.text(text)],
      reg: String(reg || ""),
      __synthetic:
        baseMessageRecord?.__synthetic !== undefined
          ? Boolean(baseMessageRecord.__synthetic)
          : true,
      __skipLearning:
        baseMessageRecord?.__skipLearning !== undefined
          ? Boolean(baseMessageRecord.__skipLearning)
          : true,
      __proactiveCommand: Boolean(
        flags?.__proactiveCommand ?? baseMessageRecord?.__proactiveCommand,
      ),
      __commandUsageSource:
        normalizeOptionalString(
          flags?.__commandUsageSource ?? baseMessageRecord?.__commandUsageSource,
        ) ||
        ((flags?.__proactiveCommand ?? baseMessageRecord?.__proactiveCommand)
          ? "proactive-command"
          : ""),
      ...flags,
    }

    try {
      if (isGroup && runtimeBot?.pickGroup) event.group = runtimeBot.pickGroup(Number(gid) || gid)
    } catch {}
    try {
      if (!isGroup && runtimeBot?.pickUser) event.friend = runtimeBot.pickUser(Number(pid) || pid)
    } catch {}

    await this.dealMsg(event)
    delete event.reply
    this.reply(event)
    return event
  }

  async invokeMatchedCommand(command, ctx) {
    if (!command) return false

    if (ctx && typeof ctx === "object") {
      ctx.reg = command.reg
      ctx.__commandTriggeredAt = Number(ctx.__commandTriggeredAt || 0) || Date.now()
      if (ctx.__skipLearning === undefined) ctx.__skipLearning = true
    }

    await this.recordCommandUsage(ctx, command)
    return await command.fnc(ctx)
  }

  async invokeCommandByText(rawCommand, ctx = {}, options = {}) {
    const text = String(rawCommand || ctx?.raw_message || ctx?.msg || "").trim()
    if (!text) return false

    let event = ctx
    const alreadyPrepared =
      event &&
      typeof event === "object" &&
      String(event?.post_type || "").toLowerCase() === "message" &&
      typeof event?.reply === "function"

    if (!alreadyPrepared) {
      event = await this.buildSyntheticCommandEvent({
        baseMessageRecord: ctx,
        rawCommand: text,
        userId: options?.userId ?? ctx?.user_id ?? ctx?.sender_id,
        groupId: options?.groupId ?? ctx?.group_id,
        peerId: options?.peerId ?? ctx?.peer_id,
        scene: options?.scene,
        protocol: options?.protocol ?? ctx?.protocol,
        flags: options?.flags ?? {},
      })
    } else {
      event.raw_message = text
      event.msg = text
      await this.dealMsg(event)
      delete event.reply
      this.reply(event)
    }

    const result = await this.processNormalCommands(event, {
      rawCommand: text,
      plugin: options?.plugin,
    })
    if (result !== false && result !== undefined && result !== null) {
      return result
    }

    const yunzaiResult = await invokeYunzaiCommandByText(text, event, options).catch(err => {
      logger.warn("[invokeCommandByText] yunzai fallback failed:", err?.message || err)
      return false
    })
    if (yunzaiResult !== false && yunzaiResult !== undefined && yunzaiResult !== null) {
      return yunzaiResult
    }

    return false
  }

  async invokeCommandByReg(reg, ctx, options = {}) {
    const command = this.findCommandByReg(reg, options)
    if (!command) {
      const yunzaiResult = await invokeYunzaiRecordedCommandByReg(reg, ctx, options).catch(err => {
        logger.warn("[invokeCommandByReg] yunzai fallback failed:", err?.message || err)
        return false
      })
      if (yunzaiResult !== false && yunzaiResult !== undefined && yunzaiResult !== null) {
        return yunzaiResult
      }
      throw new Error(`[invokeCommandByReg] command not found: ${reg}`)
    }

    return await this.invokeMatchedCommand(command, ctx)
  }

  createCommandRegistrar(pluginMeta, idx) {
    return (command, handler) => {
      if (!command || !handler) return

      const pname =
        pluginMeta && typeof pluginMeta === "object" ? String(pluginMeta.name || "") : String(pluginMeta || "")
      const ptitle =
        pluginMeta && typeof pluginMeta === "object"
          ? String(pluginMeta.title || pluginMeta.name || "")
          : String(pluginMeta || "")
      const pshort =
        pluginMeta && typeof pluginMeta === "object"
          ? String(pluginMeta.shortName || pluginMeta.title || pluginMeta.name || "")
          : String(pluginMeta || "")
      const paliases =
        pluginMeta && typeof pluginMeta === "object" && Array.isArray(pluginMeta.aliases)
          ? pluginMeta.aliases
          : [pname]

      // 支持：registerCommand(["^xx$", "message", 5000, { example, desc }], handler)
      // 也兼容：registerCommand({ reg/pattern, event, priority, help/example/desc }, handler)
      let reg = ""
      let event = "message"
      let priority = 5000
      let help = null
      let trackUsage

      if (command && typeof command === "object" && !Array.isArray(command)) {
        reg = String(command.reg ?? command.pattern ?? command.command ?? "")
        if (lodash.isString(command.event)) event = command.event
        if (lodash.isNumber(command.priority)) priority = command.priority
        if (typeof command.trackUsage === "boolean") trackUsage = command.trackUsage

        const meta = command.help && typeof command.help === "object" ? command.help : command
        const example = meta.example ?? meta.examples
        const desc = meta.desc ?? meta.description
        if (example !== undefined || desc !== undefined) {
          help = { example, desc }
        }
      } else {
        const commands = Array.isArray(command) ? command : [command]
        reg = String(commands[0] ?? "")

        if (lodash.isString(commands[1])) event = commands[1]
        if (lodash.isNumber(commands[1])) priority = commands[1]
        if (lodash.isNumber(commands[2])) priority = commands[2]

        const last = commands[commands.length - 1]
        if (last && typeof last === "object" && !Array.isArray(last)) {
          if (typeof last.trackUsage === "boolean") trackUsage = last.trackUsage
          const example = last.example ?? last.examples
          const desc = last.desc ?? last.description
          if (example !== undefined || desc !== undefined) {
            help = { example, desc }
          }
        }
      }

      this.plugins[`${pname}-${reg == "" ? idx : reg}`] = {
        id: `${pname}-${idx}`,
        plugin: pname,
        pluginTitle: ptitle,
        pluginShortName: pshort,
        pluginAliases: paliases,
        reg,
        event,
        priority,
        trackUsage:
          typeof trackUsage === "boolean"
            ? trackUsage
            : Boolean(String(reg || "").trim()) && String(event || "message").startsWith("message"),
        help,
        fnc: handler,
      }
      idx++
    }
  }

  createContextReplyHandler() {
    return async (ctx, callback, endMsg) => {
      const isPrivate = ctx.isPrivate
      const contextKey = isPrivate ? ctx.user_id : ctx.group_id
      const userId = ctx.sender_id || ctx.user_id

      if (!contextKey || !userId) {
        logger.warn("缺少上下文Key或用户ID")
        return
      }

      // 初始化数据结构
      this.initContextStorage(isPrivate, contextKey, userId)

      // 处理现有上下文
      if (this.hasExistingContext(isPrivate, contextKey, userId, endMsg)) {
        this.addToContextQueue(isPrivate, contextKey, userId, callback, endMsg)
        return
      }

      // 创建新上下文
      this.createNewContext(isPrivate, contextKey, userId, callback, endMsg, ctx)
    }
  }

  initContextStorage(isPrivate, contextKey, userId) {
    const storage = isPrivate ? this.privateReply : this.groupReply

    if (!storage[contextKey]) {
      storage[contextKey] = {}
    }
    if (!storage[contextKey][userId]) {
      storage[contextKey][userId] = []
    }
  }

  hasExistingContext(isPrivate, contextKey, userId, endMsg) {
    const storage = isPrivate ? this.privateReply : this.groupReply
    const userContexts = storage[contextKey]?.[userId]

    return userContexts && userContexts.length > 0 && userContexts[0]?.endMsg && endMsg
  }

  addToContextQueue(isPrivate, contextKey, userId, callback, endMsg) {
    const storage = isPrivate ? this.privateReply : this.groupReply

    const newContext = {
      cfnc: callback,
      endMsg,
      timer: null,
      isPrivate,
      contextKey,
      userId,
    }

    storage[contextKey][userId].unshift(newContext)
  }

  createNewContext(isPrivate, contextKey, userId, callback, endMsg, ctx) {
    const storage = isPrivate ? this.privateReply : this.groupReply

    const newContext = {
      cfnc: callback,
      endMsg,
      timer: this.setupTimeout(isPrivate, contextKey, userId, endMsg, ctx),
      isPrivate,
      contextKey,
      userId,
    }

    storage[contextKey][userId].push(newContext)
  }

  setupTimeout(isPrivate, contextKey, userId, endMsg, ctx) {
    if (endMsg) return null

    return this.timers.setTimeout(() => {
      this.clearContext(isPrivate, contextKey, userId)
      if (ctx) {
        ctx.reply("时间超时，已取消。", true).catch(logger.error)
      }
    }, 30000)
  }

  clearContext(isPrivate, contextKey, userId) {
    const storage = isPrivate ? this.privateReply : this.groupReply

    if (storage[contextKey]?.[userId]) {
      delete storage[contextKey][userId]
    }
  }

  filtEvent(e, v) {
    let event = v.event.split(".")
    let eventMap = {
      message: ["post_type", "message_type", "sub_type"],
      notice: ["post_type", "notice_type", "sub_type"],
      request: ["post_type", "request_type", "sub_type"],
    }
    let newEvent = []
    event.forEach((val, index) => {
      if (val === "*") {
        newEvent.push(val)
      } else if (eventMap[e.post_type]) {
        newEvent.push(e[eventMap[e.post_type][index]])
      }
    })
    newEvent = newEvent.join(".")

    if (v.event == newEvent) return true

    return false
  }

  async deal(e) {
    console.log(e)
    await this.dealMsg(e)
    await this.reply(e)

    if (e.user_id == e.self_id && e.post_type == "message") {
      rememberRuntimeLastGroupMessage(e)
      return
    }
    //处理上下文
    const isPrivate = e.isPrivate
    const contextKey = isPrivate ? e.user_id : e.group_id
    const userId = e.user_id

    const hasContext = isPrivate
      ? this.privateReply?.[contextKey]?.[userId]
      : this.groupReply?.[contextKey]?.[userId]

    if (!hasContext) {
      // 没有上下文时处理普通命令
      const result = await this.processNormalCommands(e)
      rememberRuntimeLastGroupMessage(e)
      return result
    }

    // 处理上下文
    const userContexts = isPrivate
      ? this.privateReply[contextKey][userId]
      : this.groupReply[contextKey][userId]

    const result = await this.processUserContexts(e, userContexts)

    // 根据处理结果清理上下文
    this.cleanupContexts(isPrivate, contextKey, userId, userContexts, result)
    rememberRuntimeLastGroupMessage(e)
  }

  // 处理普通命令
  async processNormalCommands(e, options = {}) {
    const commandText = String(options?.rawCommand ?? e?.msg ?? e?.raw_message ?? "").trim()
    const plugin = String(options?.plugin || "").trim()
    let regs = this.getOrderedCommands()

    for (let r of regs) {
      if (plugin && String(r?.plugin || "") !== plugin) continue
      if (r.event && !this.filtEvent(e, r)) continue
      if (new RegExp(r.reg).test(commandText)) {
        try {
          logger.debug("触发命令:", r)
          e.raw_message = commandText
          e.msg = commandText
          let res = await this.invokeMatchedCommand(r, e)
          if (!res) continue
          return res
        } catch (err) {
          logger.error("处理命令时出错:", err)
          if (e?.__xunluThrowCommandError) {
            throw err
          }
        }
      }
    }
  }

  // 处理用户上下文
  async processUserContexts(e, userContexts) {
    const result = {
      processed: false,
      shouldCleanPersistent: false,
      shouldCleanTemporary: false,
    }

    // 优先处理临时上下文（后进先出）
    for (let i = userContexts.length - 1; i >= 0; i--) {
      const context = userContexts[i]

      if (this.isContextValid(context)) {
        let res = await this.executeContextCallback(e, context)
        result.processed = true

        if (!context.endMsg && !res && !context.timer) {
          context.timer = this.setupTimeout(
            context.isPrivate,
            context.contextKey,
            context.userId,
            context.endMsg,
            e,
          )
        }

        // 检查是否需要结束上下文
        if (this.shouldEndContext(e, context) && res) {
          if (context.endMsg) {
            result.shouldCleanPersistent = true
          } else {
            result.shouldCleanTemporary = true
          }
          break
        }
      }
    }

    return result
  }

  // 检查上下文是否有效
  isContextValid(context) {
    return context && context.cfnc && typeof context.cfnc === "function"
  }

  // 执行上下文回调
  async executeContextCallback(e, context) {
    try {
      let res = await context.cfnc(e)
      // 清除超时计时器，因为用户已响应
      if (context.timer) {
        this.timers.clearTimeout(context.timer)
        context.timer = null
      }
      return res
    } catch (error) {
      logger.error("执行上下文回调出错:", error)
      await e.reply("处理出错，请重新操作").catch(logger.error)
    }
  }

  // 检查是否需要结束上下文
  shouldEndContext(e, context) {
    // 如果有结束消息且匹配，或者临时上下文已执行一次
    return (context.endMsg && e.msg === context.endMsg) || !context.endMsg
  }

  // 清理上下文
  cleanupContexts(isPrivate, contextKey, userId, userContexts, result) {
    if (!userContexts.length) return

    const storage = isPrivate ? this.privateReply : this.groupReply

    if (result.shouldCleanPersistent) {
      // 清理指令关闭的上下文
      this.removeContextsByType(storage, contextKey, userId, true)
    } else if (result.shouldCleanTemporary) {
      // 清理临时上下文
      this.removeLastTemporaryContext(storage, contextKey, userId)
    }

    // 如果所有上下文都处理完毕，清理整个用户条目
    if (!storage[contextKey]?.[userId]?.length) {
      this.cleanupUserContext(storage, contextKey, userId)
    }
  }

  // 按类型移除上下文
  removeContextsByType(storage, contextKey, userId, isPersistent) {
    if (!storage[contextKey]?.[userId]) return

    storage[contextKey][userId] = storage[contextKey][userId].filter(context => {
      const shouldRemove = isPersistent ? context.endMsg : !context.endMsg
      if (shouldRemove && context.timer) {
        this.timers.clearTimeout(context.timer)
      }
      return !shouldRemove
    })
  }

  // 移除最后一个临时上下文
  removeLastTemporaryContext(storage, contextKey, userId) {
    if (!storage[contextKey]?.[userId]) return

    const contexts = storage[contextKey][userId]
    for (let i = contexts.length - 1; i >= 0; i--) {
      if (!contexts[i].endMsg) {
        if (contexts[i].timer) {
          this.timers.clearTimeout(contexts[i].timer)
        }
        contexts.splice(i, 1)
        break
      }
    }
  }

  // 清理用户上下文
  cleanupUserContext(storage, contextKey, userId) {
    if (storage[contextKey]?.[userId]) {
      delete storage[contextKey][userId]
    }

    // 如果上下文键没有其他用户上下文，清理整个条目
    if (storage[contextKey] && Object.keys(storage[contextKey]).length === 0) {
      delete storage[contextKey]
    }
  }

  reply(e) {
    const reply = async (msg = "", quote = false, data = {}) => {
      let msgRes
      let { recallMsg = 0, at = "" } = data
      if (!msg) return false

      // forward/raw 消息直接透传，避免被误转换（例如 onebot 的 node 转发）
      const rawList = Array.isArray(msg) ? msg : msg ? [msg] : []
      const hasRawNode = rawList.some(i => i?.type === "node" || i?.type === "forward")

      if (!hasRawNode) {
        if (typeof msg === "string") {
          msg = this.dealSuffix(msg)
        } else if (msg instanceof UniversalMessage) {
          msg = msg.segments
        } else {
          msg = coerceToUniversalMessage(msg).segments
        }

        if (at) {
          msg = [UniversalMessageSegment.mention(at), ...msg]
        }

        if (quote) {
          const ref = e.messageRef || getMessageRefFromCtx(e)
          try {
            msg = [UniversalMessageSegment.reply({ msgId: ref.msgId, seq: ref.seq }), ...msg]
          } catch {}
        }

        if (
          Array.isArray(msg) &&
          msg.some(seg => seg?.type === UniversalSegmentType.IMAGE && !seg?.data?.summary)
        ) {
          const imgdisplay = await getImageDisplay().catch(() => "")
          msg = msg.map(seg => {
            if (seg?.type === UniversalSegmentType.IMAGE && seg?.data && !seg.data.summary) {
              seg.data.summary = imgdisplay || ""
            }
            return seg
          })
        }
      }

      if (e.group_id) {
        msgRes = await e.sendMessage(e, msg).catch(err => {
          logger.error(err)
        })
      } else {
        const privateTarget = e?.peer_id ?? e?.user_id
        msgRes = await e.sendMessage(`${privateTarget}`, msg).catch(err => {
          logger.warn(err)
        })
      }

      if (e.group_id && Array.isArray(msg) && msgRes) {
        rememberRuntimeLastGroupMessage({
          group_id: e.group_id,
          user_id: e.self_id,
          sender_id: e.self_id,
          self_id: e.self_id,
          message: msg,
          isMaster: false,
        })
      }

      if (!e.isGuild && recallMsg > 0 && (msgRes?.seq || msgRes?.message_id)) {
        this.timers.setTimeout(() => {
          void Promise.resolve()
            .then(() =>
              e.recallMessage?.({
                peer_id: e?.peer_id || e.group_id,
                message_seq: msgRes.seq,
                message_id: msgRes?.message_id || msgRes?.data?.message_id,
                isGroup: e.group_id || e.message_scene == "group",
              }),
            )
            .catch(err => logger.warn(err))
        }, recallMsg * 1000)
      }

      return msgRes
    }

    if (e.reply) e.replyNew = e.reply
    e.reply = reply
  }

  dealSuffix(msg) {
    if (typeof msg !== "string") return msg
    const suffixText = cfg.getConfig("bot")?.suffix_text || ""
    return parseTextWithFaces(msg + suffixText)
  }

  async dealMsg(e) {
    if (!e || typeof e !== "object") return

    // 统一 self_id 格式，便于 atBot 判断
    e.self_id = Array.isArray(e.self_id) ? e.self_id[0] : e?.self_id

    // 统一 rawSegments：保留转换前段数组（优先 segments，其次 message）
    if (!Array.isArray(e.rawSegments)) {
      if (Array.isArray(e.segments)) e.rawSegments = e.segments
      else if (Array.isArray(e.message)) e.rawSegments = e.message
    }

    // 兜底推断协议类型（多数情况下由各适配器事件层注入 e.protocol）
    if (!e.protocol) {
      const adapterHint = String(e.adapterType || this.adapter || "").toLowerCase()
      if (adapterHint.includes("milky")) e.protocol = "milky"
      else if (adapterHint.includes("onebot")) e.protocol = "onebotv11"
      else if (adapterHint.includes("icqq")) e.protocol = "icqq"
    }

    // 解析分享卡片 JSON（onebot/icqq: json 段；milky: light_app 段）
    const tryParseJsonPayload = payload => {
      if (!payload) return null
      if (typeof payload === "object") return payload
      if (typeof payload !== "string") return null
      const text = payload.trim()
      if (!text) return null
      try {
        return JSON.parse(text)
      } catch {
        return null
      }
    }

    const extractJsonFromSegments = segments => {
      if (!Array.isArray(segments)) return null

      const protocol = String(e.protocol || "").toLowerCase()

      if (protocol === "milky") {
        const lightApp = segments.find(seg => seg?.type === "light_app")
        const payload = lightApp?.data?.json_payload ?? lightApp?.data?.jsonPayload
        return tryParseJsonPayload(payload)
      }

      const jsonSeg = segments.find(seg => seg?.type === "json")
      if (!jsonSeg) return null
      const payload = jsonSeg?.data?.data ?? jsonSeg?.data?.json ?? jsonSeg?.data ?? jsonSeg?.json
      return tryParseJsonPayload(payload)
    }

    if (!e.json) {
      e.json = extractJsonFromSegments(e.rawSegments) || undefined
    }

    // 优先：用 rawSegments 按协议构造 universalMessage（支持 takeover 场景：message 为 icqq 段，但 segments/rawSegments 为 onebot/milky 段）
    const looksLikeUniversalSegment = seg =>
      Boolean(
        (seg?.type === UniversalSegmentType.TEXT &&
          seg?.data &&
          (Object.prototype.hasOwnProperty.call(seg.data, "text") ||
            Object.prototype.hasOwnProperty.call(seg.data, "content"))) ||
        (seg?.type === UniversalSegmentType.MENTION &&
          seg?.data &&
          (Object.prototype.hasOwnProperty.call(seg.data, "qq") ||
            Object.prototype.hasOwnProperty.call(seg.data, "target"))) ||
        (seg?.type === UniversalSegmentType.MENTION_ALL &&
          seg?.data &&
          typeof seg.data === "object") ||
        (seg?.type === UniversalSegmentType.REPLY &&
          seg?.data &&
          (Object.prototype.hasOwnProperty.call(seg.data, "id") ||
            Object.prototype.hasOwnProperty.call(seg.data, "msgId") ||
            Object.prototype.hasOwnProperty.call(seg.data, "seq"))) ||
        ((seg?.type === UniversalSegmentType.IMAGE ||
          seg?.type === UniversalSegmentType.VOICE ||
          seg?.type === UniversalSegmentType.VIDEO ||
          seg?.type === UniversalSegmentType.FILE) &&
          seg?.data &&
          (Object.prototype.hasOwnProperty.call(seg.data, "file") ||
            Object.prototype.hasOwnProperty.call(seg.data, "url") ||
            Object.prototype.hasOwnProperty.call(seg.data, "fileId") ||
            Object.prototype.hasOwnProperty.call(seg.data, "path") ||
            Object.prototype.hasOwnProperty.call(seg.data, "id"))),
      )

    const looksLikeUniversalSegments = segments =>
      Array.isArray(segments) &&
      segments.length > 0 &&
      segments.every(seg => looksLikeUniversalSegment(seg))

    const rawLooksUniversal = looksLikeUniversalSegments(e.rawSegments)
    if (!e.universalMessage && Array.isArray(e.rawSegments) && e.protocol && !rawLooksUniversal) {
      try {
        e.universalMessage = UniversalMessage.from(e.protocol, e.rawSegments)
      } catch {}
    }

    // 统一真值：e.message 始终为 UniversalMessage.segments
    if (e.universalMessage) {
      e.message = e.universalMessage.segments
    } else if (Array.isArray(e.message) && e.protocol) {
      const looksUniversal = looksLikeUniversalSegments(e.message)

      if (!looksUniversal) {
        try {
          e.universalMessage = UniversalMessage.from(e.protocol, e.message)
          e.message = e.universalMessage.segments
        } catch {}
      }
    }

    if (Array.isArray(e.message)) {
      applyDerivedFieldsFromUniversalSegments(e)

      // 若 url 未从文本中提取到，则尝试从分享卡片 json 推断
      if (!e.url && e.json && typeof e.json === "object") {
        const derivedUrl =
          e.json?.meta?.detail_1?.qqdocurl ||
          e.json?.meta?.detail_1?.url ||
          e.json?.meta?.news?.jumpUrl ||
          e.json?.meta?.news?.jump_url ||
          e.json?.meta?.news?.jumpURL ||
          ""
        if (derivedUrl) e.url = String(derivedUrl)
      }
    } else if (!e.msg) {
      e.msg = e.raw_message || ""
    }

    e.logText = ""

    // 私聊/群聊标记（优先 group_id，否则按 message_type/friend 兜底）
    e.isGroup = Boolean(e.group_id)
    e.isPrivate = !e.isGroup && (e.message_type === "private" || Boolean(e.friend))

    if (e.isPrivate) {
      if (!e.sender) {
        const nickname = e.friend?.nickname || e.sender?.nickname || ""
        e.sender = { card: nickname, nickname }
      } else if (e.sender && !e.sender.card) {
        e.sender.card = e.sender.nickname
      }
      const senderId = e.sender_id ?? e.user_id ?? ""
      e.logText = `[私聊][${e.sender.nickname}(${senderId})]`
    }

    if (e.isGroup) {
      if (!e.sender) {
        e.sender = {
          card: e.group_member?.card,
          nickname: e.group_member?.nickname,
        }
      }
      if (!e.group_name) e.group_name = e.group?.group_name || e.group_name
      const displayName = e.sender?.card || e.sender?.nickname || ""
      e.logText = `[${e.group_name || e.group_id}(${displayName})]`
    }

    const masters = await this.getMaster()
    const uid = e.sender_id ?? e.user_id
    const uidNum = Number(uid)
    if (Array.isArray(masters) && (masters.includes(uidNum) || masters.includes(uid))) {
      e.isMaster = true
    }
    normalizeEventTargetFields(e)

    // 标准消息 API：getMessage / getReplyMessage / messageRef
    attachStandardMessageApis(e)

    // 通用 QQBot API：覆盖协议差异（尤其是群申请 accept/reject 参数映射）
    applyUniversalBotApi(e, {
      bot: this,
      adapterHint: this.adapter,
      override: [
        "getLoginInfo",
        "getFriendList",
        "getFriendInfo",
        "getGroupList",
        "getGroupInfo",
        "setGroupName",
        "setGroupMemberCard",
        "setGroupMemberAdmin",
        "setGroupMemberSpecialTitle",
        "setGroupWholeMute",
        "kickGroupMember",
        "quitGroup",
        "acceptFriendRequest",
        "rejectFriendRequest",
        "sendGroupMessageReaction",
        "acceptGroupRequest",
        "rejectGroupRequest",
        "getUserInfo",
        "getGroupMemberList",
        "getGroupMemberInfo",
        "setGroupMemberMute",
        "makeGroupForwardMsg",
        "makeGroupForwardMsgByUser",
        "pickUser",
        "renderImg",
      ],
    })

    await enrichGroupRoleFlags(e)
  }

  async getMaster() {
    if (env.CurEnv == "QQBot-YunZai") {
      const { default: yuncfg } = await import("../../../../lib/config/config.js")
      return yuncfg.masterQQ
    }
    return cfg.getConfig("bot").masterQQ
  }

  async initBot() {
    await this.loadBotPlugins()
  }

  //获取群历史消息
  async getGroupHistoryMsg(groupId, date) {
    return await MessageDB.getGroupMsgByDay(groupId, date)
  }
  //制作消息转发
  async makeForwardMsg(e, msg = [], dec = "", msgsscr = false) {
    if (!Array.isArray(msg)) {
      msg = [msg]
    }
    const runtimeBot = (() => {
      try {
        return Bot || globalThis.Bot || null
      } catch {
        return globalThis.Bot || null
      }
    })()
    const defaultId = e?.user_id ?? Bot?.uin
    let name = msgsscr ? e?.sender?.card || e?.sender?.nickname || e?.user_id : Bot.nickname
    let id = defaultId

    if (e.isGroup) {
      try {
        if (id !== undefined && id !== null && id !== "") {
          let info = await e.getGroupMemberInfo(e.group_id, id || Bot.uin)
          name = info.card || info.nickname || name
        }
      } catch (err) {
        logger.error(err)
      }
    }

    let userInfo = {
      user_id: id,
      nickname: name,
    }

    let forwardMsg = []
    for (let message of msg) {
      if (!message) {
        continue
      }
      const itemUserId = message?.user_id ?? message?.uin ?? message?.id ?? userInfo.user_id
      const explicitName = message?.nickname ?? message?.sender_name ?? message?.name
      const itemName = explicitName ?? userInfo.nickname
      const m = {
        ...userInfo,
      }
      if (itemUserId !== undefined && itemUserId !== null && itemUserId !== "") {
        m.user_id = itemUserId
        m.uin = itemUserId
      }
      if (itemName !== undefined && itemName !== null && itemName !== "") {
        m.nickname = itemName
        m.sender_name = itemName
        m.name = itemName
      }
      message?.content ? (m.message = message.content) : (m.message = message)
      message?.time ? (m.time = message.time) : ""
      forwardMsg.push(m)
    }

    /** 制作转发内容 */
    try {
      const takeoverState = runtimeBot?.__xunlu_takeover_state
      const takeoverForwardTarget = (() => {
        if (!takeoverState || typeof takeoverState !== "object") return null

        if (e?.isGroup && typeof takeoverState.getGroup === "function") {
          return takeoverState.getGroup(e.group_id)
        }

        if (!e?.isGroup && typeof takeoverState.getUser === "function") {
          return takeoverState.getUser(e.user_id)
        }

        return null
      })()

      if (typeof takeoverForwardTarget?.makeForwardMsg === "function") {
        forwardMsg = await takeoverForwardTarget.makeForwardMsg(forwardMsg)
      } else if (e?.group?.makeForwardMsg) {
        forwardMsg = await e.group.makeForwardMsg(forwardMsg)
      } else if (e?.friend?.makeForwardMsg) {
        forwardMsg = await e.friend.makeForwardMsg(forwardMsg)
      } else if (e?.isGroup && typeof runtimeBot?.pickGroup === "function") {
        const group = runtimeBot.pickGroup(e.group_id)
        if (typeof group?.makeForwardMsg === "function") {
          forwardMsg = await group.makeForwardMsg(forwardMsg)
        } else if (typeof runtimeBot?.makeGroupForwardMsg === "function") {
          forwardMsg = await runtimeBot.makeGroupForwardMsg(forwardMsg, e.group_id)
        } else {
          throw new Error("[makeForwardMsg] group forward API not available")
        }
      } else if (!e?.isGroup && typeof runtimeBot?.pickFriend === "function") {
        const friend = runtimeBot.pickFriend(e.user_id)
        if (typeof friend?.makeForwardMsg === "function") {
          forwardMsg = await friend.makeForwardMsg(forwardMsg)
        } else if (typeof runtimeBot?.makePrivateForwardMsg === "function") {
          forwardMsg = await runtimeBot.makePrivateForwardMsg(forwardMsg, e.user_id)
        } else {
          throw new Error("[makeForwardMsg] private forward API not available")
        }
      } else if (!e?.isGroup && typeof runtimeBot?.pickUser === "function") {
        const user = runtimeBot.pickUser(e.user_id)
        if (typeof user?.makeForwardMsg === "function") {
          forwardMsg = await user.makeForwardMsg(forwardMsg)
        } else if (typeof runtimeBot?.makePrivateForwardMsg === "function") {
          forwardMsg = await runtimeBot.makePrivateForwardMsg(forwardMsg, e.user_id)
        } else {
          throw new Error("[makeForwardMsg] private forward API not available")
        }
      } else if (typeof runtimeBot?.makeGroupForwardMsg === "function") {
        forwardMsg = await runtimeBot.makeGroupForwardMsg(forwardMsg, e.group_id)
      } else {
        throw new Error("[makeForwardMsg] makeForwardMsg not available")
      }

      if (dec) {
        /** 处理描述 */

        if (typeof forwardMsg.data === "object") {
          let detail = forwardMsg.data?.meta?.detail
          if (detail) {
            detail.news = [{ text: dec }]
          }
        } else {
          forwardMsg.data = forwardMsg.data
            ?.replace(/\n/g, "")
            ?.replace(/<title color="#777777" size="26">(.+?)<\/title>/g, "___")
            ?.replace(/___+/, `<title color="#777777" size="26">${dec}</title>`)
        }
      }
    } catch (err) {
      logger.error(err)
      throw err
    }

    return forwardMsg
  }
}
