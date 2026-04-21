import Render from "../utils/render.js"
import schedule from "node-schedule"
import env from "../lib/env.js"
import MessageDB from "../db/MessageDB.js"
import { rememberRuntimeLastGroupMessage } from "./runtime-last-message.js"
import CommandBus from "./runtime/command-bus.js"
import ForwardService from "./runtime/forward-service.js"
import MessagePipeline from "./runtime/message-pipeline.js"
import ReplyService from "./runtime/reply-service.js"
import RoleResolver from "./runtime/role-resolver.js"
import SessionManager from "./runtime/session-manager.js"

/**
 * BaseBot 现在只保留“兼容门面”的职责。
 *
 * 它继续对外提供原来的方法名与字段：
 * - plugins / pluginCatalog / groupReply / privateReply / scheduledTasks / onMount
 * - dealMsg / reply / makeForwardMsg / invokeCommandByText ...
 *
 * 但内部实现已经拆到更小的运行部件里，避免继续膨胀成运行时“上帝对象”。
 */
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

    // 这些字段继续保留在 BaseBot 上，供旧逻辑和通用 API 直接读取。
    this.scheduledTasks = []
    this.plugins = {}
    this.pluginCatalog = {}
    this.groupReply = {}
    this.privateReply = {}
    this.onMount = []

    this.roleResolver = new RoleResolver(this)
    this.messagePipeline = new MessagePipeline(this, this.roleResolver)
    this.replyService = new ReplyService(this)
    this.sessionManager = new SessionManager(this)
    this.commandBus = new CommandBus(this)
    this.forwardService = new ForwardService(this)
  }

  async loadBotPlugins(options = {}) {
    return await this.commandBus.loadPlugins(options)
  }

  async reloadBotPlugins(options = {}) {
    return await this.commandBus.reloadPlugins(options)
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
    return await this.commandBus.registerPlugin(plugin)
  }

  async runMount() {
    return await this.commandBus.runMount()
  }

  callPluginFnc() {
    return this.commandBus.callPluginFnc()
  }

  collectTimerTasks() {
    return this.commandBus.collectTimerTasks()
  }

  getOrderedCommands() {
    return this.commandBus.getOrderedCommands()
  }

  shouldTrackCommandUsage(commandMeta, e = null) {
    return this.commandBus.shouldTrackCommandUsage(commandMeta, e)
  }

  findCommandByReg(reg, options = {}) {
    return this.commandBus.findCommandByReg(reg, options)
  }

  findCommandByText(text, e, options = {}) {
    return this.commandBus.findCommandByText(text, e, options)
  }

  getCommandUsageSource(e) {
    return this.commandBus.getCommandUsageSource(e)
  }

  async recordCommandUsage(e, commandMeta) {
    return await this.commandBus.recordCommandUsage(e, commandMeta)
  }

  async buildSyntheticCommandEvent(options = {}) {
    return await this.commandBus.buildSyntheticCommandEvent(options)
  }

  async invokeMatchedCommand(command, ctx) {
    return await this.commandBus.invokeMatchedCommand(command, ctx)
  }

  async invokeCommandByText(rawCommand, ctx = {}, options = {}) {
    return await this.commandBus.invokeCommandByText(rawCommand, ctx, options)
  }

  async invokeCommandByReg(reg, ctx, options = {}) {
    return await this.commandBus.invokeCommandByReg(reg, ctx, options)
  }

  createCommandRegistrar(pluginMeta, idx) {
    return this.commandBus.createCommandRegistrar(pluginMeta, idx)
  }

  createContextReplyHandler() {
    return this.sessionManager.createContextReplyHandler()
  }

  initContextStorage(isPrivate, contextKey, userId) {
    return this.sessionManager.initContextStorage(isPrivate, contextKey, userId)
  }

  hasExistingContext(isPrivate, contextKey, userId, endMsg) {
    return this.sessionManager.hasExistingContext(isPrivate, contextKey, userId, endMsg)
  }

  addToContextQueue(isPrivate, contextKey, userId, callback, endMsg) {
    return this.sessionManager.addToContextQueue(isPrivate, contextKey, userId, callback, endMsg)
  }

  createNewContext(isPrivate, contextKey, userId, callback, endMsg, ctx) {
    return this.sessionManager.createNewContext(isPrivate, contextKey, userId, callback, endMsg, ctx)
  }

  setupTimeout(isPrivate, contextKey, userId, endMsg, ctx) {
    return this.sessionManager.setupTimeout(isPrivate, contextKey, userId, endMsg, ctx)
  }

  clearContext(isPrivate, contextKey, userId) {
    return this.sessionManager.clearContext(isPrivate, contextKey, userId)
  }

  /**
   * 事件过滤逻辑保留在 BaseBot 上，避免改动现有 command metadata 的消费方式。
   */
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
    this.reply(e)

    if (e.user_id == e.self_id && e.post_type == "message") {
      rememberRuntimeLastGroupMessage(e)
      return
    }

    const result = await this.sessionManager.handleEvent(e, async event =>
      await this.processNormalCommands(event),
    )
    rememberRuntimeLastGroupMessage(e)
    return result
  }

  async processNormalCommands(e, options = {}) {
    return await this.commandBus.processNormalCommands(e, options)
  }

  async processUserContexts(e, userContexts) {
    return await this.sessionManager.processUserContexts(e, userContexts)
  }

  isContextValid(context) {
    return this.sessionManager.isContextValid(context)
  }

  async executeContextCallback(e, context) {
    return await this.sessionManager.executeContextCallback(e, context)
  }

  shouldEndContext(e, context) {
    return this.sessionManager.shouldEndContext(e, context)
  }

  cleanupContexts(isPrivate, contextKey, userId, userContexts, result) {
    return this.sessionManager.cleanupContexts(isPrivate, contextKey, userId, userContexts, result)
  }

  removeContextsByType(storage, contextKey, userId, isPersistent) {
    return this.sessionManager.removeContextsByType(storage, contextKey, userId, isPersistent)
  }

  removeLastTemporaryContext(storage, contextKey, userId) {
    return this.sessionManager.removeLastTemporaryContext(storage, contextKey, userId)
  }

  cleanupUserContext(storage, contextKey, userId) {
    return this.sessionManager.cleanupUserContext(storage, contextKey, userId)
  }

  reply(e) {
    return this.replyService.attachReply(e)
  }

  dealSuffix(msg) {
    return this.replyService.applySuffix(msg)
  }

  async dealMsg(e) {
    return await this.messagePipeline.prepareEvent(e)
  }

  async getMaster() {
    return await this.roleResolver.getMasterList()
  }

  async initBot() {
    await this.loadBotPlugins()
  }

  async getGroupHistoryMsg(groupId, date) {
    return await MessageDB.getGroupMsgByDay(groupId, date)
  }

  async makeForwardMsg(e, msg = [], dec = "", msgsscr = false) {
    return await this.forwardService.makeForwardMsg(e, msg, dec, msgsscr)
  }
}
