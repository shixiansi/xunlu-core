import path from "path"
import lodash from "lodash"
import { loadPlugins } from "../../lib/pluginLoader.js"
import CommandUsageDB from "../../db/CommandUsageDB.js"
import { applyUniversalBotApi } from "../api/universal-bot-api.js"
import { UniversalMessageSegment } from "../message/universal-message.js"
import { getRuntimePaths } from "../../runtime/runtime-context.js"
import {
  invokeYunzaiCommandByReg as invokeYunzaiRecordedCommandByReg,
  invokeYunzaiCommandByText,
} from "../yunzai/command-bridge.js"
import { applyPrefixCompatibilityToEvent, buildCommandTextCandidates } from "./prefix-compat.js"
import { normalizeOptionalString, resolveSyntheticProtocol } from "./shared.js"
import cfg from "../../lib/config.js"
import { services } from "../../service-container.js"
import { LifecycleManager } from "../../plugins/lifecycle/index.js"
import { createPlatformFacade } from "../../runtime/platform-services.js"

/**
 * CommandBus 统一管理插件注册、命令索引、合成事件和命令调用。
 *
 * 这样 BaseBot 不再直接维护"命令注册表 + 定时任务 + onMount + 使用统计"这些杂项。
 */
export class CommandBus {
  constructor(baseBot) {
    this.baseBot = baseBot
    this.lifecycle = new LifecycleManager()
  }

  async loadPlugins(options = {}) {
    try {
      // 获取禁用插件列表
      const botCfg = cfg.getConfig("bot") || {}
      const disabledPlugins = botCfg?.plugin_control?.disabled_plugins || []

      const plugins = await loadPlugins(path.join(getRuntimePaths().rootDir, "src", "plugins"), {
        ...options,
        disabledPlugins,
      })

      for (const plugin of plugins) {
        logger.debug("加载插件:", plugin)
        await this.registerPlugin(plugin)
      }

      logger.debug("插件加载完成，注册命令:", Object.keys(this.baseBot.plugins))
    } catch (error) {
      logger.error("加载插件时出错:", error)
    }
  }

  async reloadPlugins(options = {}) {
    const cacheBust = options.cacheBust !== false

    this.baseBot.plugins = {}
    this.baseBot.pluginCatalog = {}
    this.baseBot.onMount = []

    await this.loadPlugins({ cacheBust })
    await this.runLegacyMount()

    return Object.keys(this.baseBot.plugins)
  }

  async registerPlugin(plugin) {
    if (!plugin.implementation?.register) return

    // 获取禁用命令列表
    const botCfg = cfg.getConfig("bot") || {}
    const disabledCommands = botCfg?.plugin_control?.disabled_commands || []

    let idx = 1
    this.baseBot.pluginCatalog[plugin.name] = {
      name: plugin.name,
      title: plugin.title || plugin.name,
      shortName: plugin.shortName || plugin.title || plugin.name,
      aliases: Array.isArray(plugin.aliases) ? plugin.aliases : [plugin.name],
      helpHidden: Boolean(plugin.helpHidden),
      entryPath: plugin.entryPath,
      rootDir: plugin.rootDir,
    }
    const pluginAPI = {
      registerCommand: this.createCommandRegistrar(plugin, idx, disabledCommands),
      contextReply: this.baseBot.createContextReplyHandler(),
      setTask: this.collectTimerTasks(),
      callFnc: this.callPluginFnc(),
      onMount: fnc => this.baseBot.onMount.push(fnc),
      recordCommandUsage: this.recordCommandUsage.bind(this),
      buildSyntheticCommandEvent: this.buildSyntheticCommandEvent.bind(this),
      invokeCommandByReg: this.invokeCommandByReg.bind(this),
      invokeCommandByText: this.invokeCommandByText.bind(this),
      findCommandByReg: this.findCommandByReg.bind(this),
      renderImg: this.baseBot.renderImg.bind(this.baseBot),
      services,
    }

    applyUniversalBotApi(pluginAPI, { bot: this.baseBot, adapterHint: this.baseBot.adapter })
    delete pluginAPI.sendApi
    delete pluginAPI.callApi

    pluginAPI.platform = createPlatformFacade({
      runtime: {
        getRuntimeBot() {
          return globalThis.xunluCore?.bot?.getRuntimeBot?.() || globalThis.__xunlu_runtime_bot || globalThis.Bot || null
        },
        modeState: {
          adapter: this.baseBot.adapter,
        },
      },
      api: pluginAPI,
      services: globalThis.xunluCore?.services || this.baseBot.platform?.services || {},
    })

    const pluginDef = plugin.implementation
    plugin.implementation.register(pluginAPI)

    if (pluginDef.onEnable || pluginDef.onLoad) {
      try {
        await this.lifecycle.load(pluginDef)
      } catch (err) {
        logger.error(`[Lifecycle] load plugin "${plugin.name}" failed: ${err.message}`)
      }

      if (pluginDef.onEnable) {
        try {
          await this.lifecycle.enable(pluginDef, pluginAPI)
        } catch (err) {
          logger.error(`[Lifecycle] enable plugin "${plugin.name}" failed: ${err.message}`)
        }
      }
    }
  }

  async runMount() {
    return await this.runLegacyMount()
  }

  async runLegacyMount() {
    for (let fnc of this.baseBot.onMount) {
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
      const bindEvent =
        this.baseBot.bindEvent && typeof this.baseBot.bindEvent === "object" ? this.baseBot.bindEvent : {}
      ctx = {
        ...bindEvent,
        ...(ctx || {}),
      }

      delete ctx.reply
      this.baseBot.reply(ctx)
      let p = Object.values(this.baseBot.plugins).find(i => i.id == name)
      await p.fnc.call(ctx, ctx)
    }
  }

  collectTimerTasks() {
    return (interval, task) => {
      const runTask = async (ctxLike = {}) => {
        const extra = ctxLike && typeof ctxLike === "object" ? ctxLike : {}
        return await task({
          ...(this.baseBot.bindEvent && typeof this.baseBot.bindEvent === "object" ? this.baseBot.bindEvent : {}),
          ...extra,
        })
      }

      const job = this.baseBot.scheduler.scheduleJob(interval, () => {
        void runTask().catch(err => logger.error("[setTask] task failed:", err))
      })
      this.baseBot.scheduledTasks.push({
        index: this.baseBot.scheduledTasks.length,
        interval,
        task,
        runner: runTask,
        job,
      })
      return job
    }
  }

  getOrderedCommands() {
    return lodash.orderBy(Object.values(this.baseBot.plugins), ["priority"], ["asc"])
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
      if (item?.event && !this.baseBot.filtEvent(e, item)) continue

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
      protocol: e.protocol || this.baseBot.adapter || "",
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
    const gid = isGroup ? (groupId ?? baseMessageRecord?.group_id ?? baseMessageRecord?.peer_id) : undefined
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
      this.baseBot?.bindEvent?.self_id ??
      runtimeBot?.self_id ??
      runtimeBot?.uin ??
      runtimeBot?.user_id
    const resolvedProtocol = resolveSyntheticProtocol({
      protocol,
      baseMessageRecord,
      adapter: this.baseBot.adapter,
      runtimeBot,
    })

    const event = {
      ...(this.baseBot.bindEvent && typeof this.baseBot.bindEvent === "object" ? this.baseBot.bindEvent : {}),
      adapterType: this.baseBot.adapter,
      protocol: resolvedProtocol,
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
      __proactiveCommand: Boolean(flags?.__proactiveCommand ?? baseMessageRecord?.__proactiveCommand),
      __commandUsageSource:
        normalizeOptionalString(flags?.__commandUsageSource ?? baseMessageRecord?.__commandUsageSource) ||
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

    await this.baseBot.dealMsg(event)
    delete event.reply
    this.baseBot.reply(event)
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
      await this.baseBot.dealMsg(event)
      delete event.reply
      this.baseBot.reply(event)
    }

    const result = await this.processNormalCommands(event, {
      rawCommand: text,
      plugin: options?.plugin,
      skipPrefixCompat: true,
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

  createCommandRegistrar(pluginMeta, idx, disabledCommands = []) {
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

      let reg = ""
      let event = "message"
      let priority = 5000
      let help = null
      let trackUsage
      let cmdKey = ""

      if (command && typeof command === "object" && !Array.isArray(command)) {
        reg = String(command.reg ?? command.pattern ?? command.command ?? "")
        if (lodash.isString(command.event)) event = command.event
        if (lodash.isNumber(command.priority)) priority = command.priority
        if (typeof command.trackUsage === "boolean") trackUsage = command.trackUsage
        if (lodash.isString(command.key)) cmdKey = command.key

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
          if (lodash.isString(last.key)) cmdKey = last.key
          const example = last.example ?? last.examples
          const desc = last.desc ?? last.description
          if (example !== undefined || desc !== undefined) {
            help = { example, desc }
          }
        }
      }

      // 检查命令是否被禁用（优先按 key 匹配，其次按 reg 匹配）
      const commandReg = String(reg || "").trim()
      if (commandReg || cmdKey) {
        const keyId = cmdKey ? `${pname}:${cmdKey}` : ""
        const regId = commandReg ? `${pname}:${commandReg}` : ""
        if (cmdKey) {
          logger.mark?.(`[commandBus] check reg="${reg}" key="${cmdKey}" pname="${pname}" keyId="${keyId}" disabled=${JSON.stringify(disabledCommands)}`)
        }
        const isDisabled = disabledCommands.some(item => {
          const disabledKey = String(item || "").trim()
          if (!disabledKey) return false

          if (disabledKey.includes(":")) {
            return disabledKey === keyId || disabledKey === regId
          }
          return disabledKey === cmdKey || disabledKey === commandReg
        })

        if (isDisabled) {
          logger.info?.(`[commandBus] skip disabled command: ${keyId || regId}`)
          return
        }
      }
        }
      }

      this.baseBot.plugins[`${pname}-${reg == "" ? idx : reg}`] = {
        id: `${pname}-${idx}`,
        plugin: pname,
        pluginTitle: ptitle,
        pluginShortName: pshort,
        pluginAliases: paliases,
        reg,
        key: cmdKey || undefined,
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

  async processNormalCommands(e, options = {}) {
    let prefixState = null
    if (!options?.skipPrefixCompat) {
      prefixState = await applyPrefixCompatibilityToEvent(e, options?.prefixCompat)
      if (!prefixState?.allow) return false
    }

    const commandText = String(options?.rawCommand ?? e?.msg ?? e?.raw_message ?? "").trim()
    const plugin = String(options?.plugin || "").trim()
    let regs = this.getOrderedCommands()

    for (let r of regs) {
      if (plugin && String(r?.plugin || "") !== plugin) continue
      if (r.event && !this.baseBot.filtEvent(e, r)) continue

      let matched = false
      let matchedText = ""
      for (const candidateText of buildCommandTextCandidates(commandText, prefixState)) {
        if (new RegExp(r.reg).test(candidateText)) {
          matched = true
          matchedText = candidateText
          break
        }
      }

      if (matched) {
        try {
          logger.debug("触发命令:", r)
          const previousMsg = e.msg
          e.msg = matchedText
          let res = await this.invokeMatchedCommand(r, e)
          if (!res) {
            e.msg = previousMsg
            continue
          }
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
}

export default CommandBus
